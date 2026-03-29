import { NextResponse } from "next/server";
import { parseGa4ExcludedUserIds } from "@/lib/ga/excluded-user-ids";
import {
  fetchTrafficForAllProperties,
  fetchTrafficForAllPropertiesWithComparison,
} from "@/lib/ga/property-traffic";
import { getAccountsForTrafficRequest } from "@/lib/ga/traffic-accounts";
import { getNeonSql } from "@/lib/db/neon";
import {
  cacheKeyFromPayload,
  getCachedInsights,
  insightUserFilterHash,
  upsertInsightsCache,
  utcInsightDateString,
} from "@/lib/db/insights-cache";
import { toInsightsPayload } from "@/lib/insights/traffic-payload";
import {
  summarizeAlertsAndActionsWithTogether,
  type InsightAlertItem,
  type TrafficPayloadForInsights,
} from "@/lib/together/summarize-traffic";

export const runtime = "nodejs";

const PERIOD_TO_CACHE_KEY: Record<string, string> = {
  "7": "7d",
  "30": "30d",
  "90": "90d",
  ytd: "ytd",
};

/**
 * Lectura solo desde Neon (`dashboard_insights_cache`), sin Together.
 * Query: period=7|30|90|ytd, source=live|stored, compare=1|0 (default 1).
 */
export async function GET(request: Request) {
  try {
    const sql = getNeonSql();
    if (!sql) {
      return NextResponse.json({ cached: false, reason: "no_database" });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period");
    const periodKey = period && PERIOD_TO_CACHE_KEY[period] ? PERIOD_TO_CACHE_KEY[period] : null;
    if (!periodKey) {
      return NextResponse.json(
        { cached: false, reason: "bad_period", hint: "Use period=7, 30, 90 o ytd." },
        { status: 400 },
      );
    }

    const sourceStored = searchParams.get("source") === "stored";
    const compareMode = searchParams.get("compare") !== "0";

    const excludeUserIds = parseGa4ExcludedUserIds();
    const row = await getCachedInsights(sql, {
      insightDateUtc: utcInsightDateString(),
      periodKey,
      compareMode,
      sourceStored,
      userIdFilterHash: insightUserFilterHash(),
    });

    if (!row) {
      return NextResponse.json({ cached: false });
    }

    return NextResponse.json({
      cached: true,
      alerts: row.alerts,
      actions: row.actions,
      dataNote: row.dataNote ?? undefined,
      model: row.model ?? "cached",
      userIdFilterActive: excludeUserIds.length > 0,
      computedAt: row.computedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ cached: false, error: message }, { status: 502 });
  }
}

function insightsSourceStoredFromBody(body: Record<string, unknown>): boolean {
  return body._insightsCacheSource === "stored";
}

async function resolveInsightsPayload(
  body: Record<string, unknown>,
): Promise<TrafficPayloadForInsights | null> {
  let payload = toInsightsPayload(body);
  if (payload) return payload;

  const daysRaw = Number(body.days);
  const days = Math.min(90, Math.max(1, Number.isFinite(daysRaw) ? Math.floor(daysRaw) : 7));
  const source = body.source === "stored" ? "stored" : null;
  const wantCompare = body.compare === true;
  const excludeUserIds = parseGa4ExcludedUserIds();
  const accounts = await getAccountsForTrafficRequest(source);

  if (wantCompare) {
    const rows = await fetchTrafficForAllPropertiesWithComparison(accounts, days, excludeUserIds);
    const totals = rows.reduce(
      (acc, r) => ({
        sessions: acc.sessions + r.sessions,
        totalUsers: acc.totalUsers + r.totalUsers,
        screenPageViews: acc.screenPageViews + r.screenPageViews,
      }),
      { sessions: 0, totalUsers: 0, screenPageViews: 0 },
    );
    const previousTotals = rows.reduce(
      (acc, r) => ({
        sessions: acc.sessions + r.priorSessions,
        totalUsers: acc.totalUsers + r.priorTotalUsers,
        screenPageViews: acc.screenPageViews + r.priorScreenPageViews,
      }),
      { sessions: 0, totalUsers: 0, screenPageViews: 0 },
    );
    const aggregatePct = (prev: number, curr: number): number | null => {
      if (prev <= 0) return curr > 0 ? null : 0;
      return ((curr - prev) / prev) * 100;
    };
    let topGrowth: { propertyDisplayName: string; sessionsChangePct: number } | null = null;
    for (const r of rows) {
      if (r.error || r.sessionsChangePct === null) continue;
      if (!topGrowth || r.sessionsChangePct > topGrowth.sessionsChangePct) {
        topGrowth = {
          propertyDisplayName: r.propertyDisplayName,
          sessionsChangePct: r.sessionsChangePct,
        };
      }
    }
    return {
      days,
      compare: true,
      propertyCount: rows.length,
      totals,
      previousTotals,
      totalsChangePct: {
        sessions: aggregatePct(previousTotals.sessions, totals.sessions),
        totalUsers: aggregatePct(previousTotals.totalUsers, totals.totalUsers),
        screenPageViews: aggregatePct(previousTotals.screenPageViews, totals.screenPageViews),
      },
      topGrowth,
      rows: rows.map((r) => ({
        property: r.property,
        propertyDisplayName: r.propertyDisplayName,
        accountDisplayName: r.accountDisplayName,
        sessions: r.sessions,
        totalUsers: r.totalUsers,
        screenPageViews: r.screenPageViews,
        priorSessions: r.priorSessions,
        priorTotalUsers: r.priorTotalUsers,
        priorScreenPageViews: r.priorScreenPageViews,
        sessionsChangePct: r.sessionsChangePct,
        totalUsersChangePct: r.totalUsersChangePct,
        ...(r.error ? { error: r.error } : {}),
      })),
      userIdFilterActive: excludeUserIds.length > 0,
      excludedUserIdCount: excludeUserIds.length,
    };
  }

  const rows = await fetchTrafficForAllProperties(accounts, days, excludeUserIds);
  const totals = rows.reduce(
    (acc, r) => ({
      sessions: acc.sessions + r.sessions,
      totalUsers: acc.totalUsers + r.totalUsers,
      screenPageViews: acc.screenPageViews + r.screenPageViews,
    }),
    { sessions: 0, totalUsers: 0, screenPageViews: 0 },
  );
  return {
    days,
    propertyCount: rows.length,
    totals,
    rows: rows.map((r) => ({
      property: r.property,
      propertyDisplayName: r.propertyDisplayName,
      accountDisplayName: r.accountDisplayName,
      sessions: r.sessions,
      totalUsers: r.totalUsers,
      screenPageViews: r.screenPageViews,
      ...(r.error ? { error: r.error } : {}),
    })),
    userIdFilterActive: excludeUserIds.length > 0,
    excludedUserIdCount: excludeUserIds.length,
  };
}

function jsonResponseFromInsights(
  payload: TrafficPayloadForInsights,
  data: {
    alerts: InsightAlertItem[];
    actions: string[];
    dataNote?: string;
    model: string;
  },
) {
  return NextResponse.json({
    alerts: data.alerts,
    actions: data.actions,
    dataNote: data.dataNote,
    model: data.model,
    userIdFilterActive: payload.userIdFilterActive,
  });
}

/** POST body = JSON del mismo shape que GET /api/analytics/traffic (tras éxito). */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    const body = (await request.json()) as Record<string, unknown>;
    const sourceStored = insightsSourceStoredFromBody(body);
    const payload = await resolveInsightsPayload(body);

    if (!payload) {
      return NextResponse.json(
        { error: "Body inválido: falta JSON de tráfico o parámetros days/source/compare." },
        { status: 400 },
      );
    }

    const sql = getNeonSql();
    const cacheKey = cacheKeyFromPayload(payload, sourceStored);

    if (sql && !forceRefresh) {
      const cached = await getCachedInsights(sql, cacheKey);
      if (cached) {
        return jsonResponseFromInsights(payload, {
          alerts: cached.alerts,
          actions: cached.actions,
          dataNote: cached.dataNote ?? undefined,
          model: cached.model ?? "cached",
        });
      }
    }

    const togetherKey = process.env.TOGETHER_API_KEY?.trim();
    if (!togetherKey) {
      return NextResponse.json(
        {
          skipped: true,
          message:
            "Define TOGETHER_API_KEY en .env.local (raíz del proyecto), guarda el archivo y reinicia npm run dev para que Next.js cargue la variable. Solo se usa en el servidor; no viaja al navegador.",
        },
        { status: 503 },
      );
    }

    const { alerts, actions, dataNote, model } = await summarizeAlertsAndActionsWithTogether(payload);

    if (sql) {
      await upsertInsightsCache(sql, cacheKey, { alerts, actions, dataNote, model });
    }

    return jsonResponseFromInsights(payload, { alerts, actions, dataNote, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
