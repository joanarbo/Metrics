import { NextResponse } from "next/server";
import { parseGa4ExcludedUserIds } from "@/lib/ga/excluded-user-ids";
import { fetchTrafficForAllProperties } from "@/lib/ga/property-traffic";
import { getAccountsForTrafficRequest } from "@/lib/ga/traffic-accounts";
import {
  summarizeTrafficWithTogether,
  type TrafficPayloadForInsights,
} from "@/lib/together/summarize-traffic";

export const runtime = "nodejs";

function toInsightsPayload(
  body: Record<string, unknown>,
): TrafficPayloadForInsights | null {
  const days = body.days;
  const propertyCount = body.propertyCount;
  const totals = body.totals;
  const rows = body.rows;
  if (
    typeof days !== "number" ||
    typeof propertyCount !== "number" ||
    !totals ||
    typeof totals !== "object" ||
    !Array.isArray(rows)
  ) {
    return null;
  }
  const t = totals as Record<string, unknown>;
  const sessions = t.sessions;
  const totalUsers = t.totalUsers;
  const screenPageViews = t.screenPageViews;
  if (
    typeof sessions !== "number" ||
    typeof totalUsers !== "number" ||
    typeof screenPageViews !== "number"
  ) {
    return null;
  }

  const userIdFilterActive = body.userIdFilterActive === true;
  const excludedUserIdCount =
    typeof body.excludedUserIdCount === "number" ? body.excludedUserIdCount : 0;

  const cleanRows = rows.map((r: unknown) => {
    const row = r as Record<string, unknown>;
    return {
      propertyDisplayName: String(row.propertyDisplayName ?? ""),
      accountDisplayName: String(row.accountDisplayName ?? ""),
      sessions: Number(row.sessions) || 0,
      totalUsers: Number(row.totalUsers) || 0,
      screenPageViews: Number(row.screenPageViews) || 0,
      ...(typeof row.error === "string" ? { error: row.error } : {}),
    };
  });

  return {
    days,
    propertyCount,
    totals: { sessions, totalUsers, screenPageViews },
    rows: cleanRows,
    userIdFilterActive,
    excludedUserIdCount,
  };
}

/** POST body = JSON del mismo shape que GET /api/analytics/traffic (tras éxito). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    let payload = toInsightsPayload(body);

    if (!payload) {
      const daysRaw = Number(body.days);
      const days = Math.min(90, Math.max(1, Number.isFinite(daysRaw) ? Math.floor(daysRaw) : 7));
      const source = body.source === "stored" ? "stored" : null;
      const excludeUserIds = parseGa4ExcludedUserIds();
      const accounts = await getAccountsForTrafficRequest(source);
      const rows = await fetchTrafficForAllProperties(accounts, days, excludeUserIds);
      const totals = rows.reduce(
        (acc, r) => ({
          sessions: acc.sessions + r.sessions,
          totalUsers: acc.totalUsers + r.totalUsers,
          screenPageViews: acc.screenPageViews + r.screenPageViews,
        }),
        { sessions: 0, totalUsers: 0, screenPageViews: 0 },
      );
      payload = {
        days,
        propertyCount: rows.length,
        totals,
        rows: rows.map((r) => ({
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

    const { text, model } = await summarizeTrafficWithTogether(payload);
    return NextResponse.json({ text, model, userIdFilterActive: payload.userIdFilterActive });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
