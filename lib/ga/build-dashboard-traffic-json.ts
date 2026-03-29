import { getNeonSql } from "@/lib/db/neon";
import {
  brandCountFromPortfolio,
  fetchSubscriberWeeklySeriesByBrands,
  fetchSubscriberWeeklyTotals,
  getSubscriberPortfolioAtOrBefore,
  upsertSubscriberPortfolioDaily,
  utcDateDaysAgo,
  utcTodayDateString,
} from "@/lib/db/subscriber-snapshots";
import { brandShortLabelForTv } from "@/lib/dashboard/tv-brand-short";
import { fetchNeonSubscriberCounts } from "@/lib/neon-api/fetch-subscriber-counts";
import { parseNeonSubscriberSources } from "@/lib/neon-api/subscriber-sources";
import { parseGa4ExcludedUserIds } from "@/lib/ga/excluded-user-ids";
import { inferBrandFromPropertyName } from "@/lib/ga/infer-brand";
import {
  daysUtcFromJan1ToToday,
  fetchAggregatedCountrySessions,
  fetchGeckoTimeLayer,
  fetchTrafficForAllProperties,
  fetchTrafficForAllPropertiesWithComparison,
  type PropertyTrafficComparisonRow,
  type PropertyTrafficRow,
} from "@/lib/ga/property-traffic";
import { getAccountsForTrafficRequest } from "@/lib/ga/traffic-accounts";

function clampDays(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : 7;
  if (!Number.isFinite(n)) {
    return 7;
  }
  return Math.min(450, Math.max(1, n));
}

/** Preset Geckoboard (30/90/YTD) o null si solo viene `days` legacy. */
export function resolvePeriodDays(
  period: string | null,
  daysParam: string | null,
): { days: number; bucketCount: number; periodKey: string } {
  if (period === "7") {
    return { days: 7, bucketCount: 4, periodKey: "7d" };
  }
  if (period === "90") {
    return { days: 90, bucketCount: 8, periodKey: "90d" };
  }
  if (period === "ytd") {
    const d = daysUtcFromJan1ToToday();
    return { days: Math.min(d, 450), bucketCount: 12, periodKey: "ytd" };
  }
  if (period === "30") {
    return { days: 30, bucketCount: 4, periodKey: "30d" };
  }
  return { days: clampDays(daysParam), bucketCount: 0, periodKey: "legacy" };
}

function aggregatePct(prev: number, curr: number): number | null {
  if (prev <= 0) {
    if (curr <= 0) return 0;
    return null;
  }
  return ((curr - prev) / prev) * 100;
}

export type BuildDashboardTrafficJsonOptions = {
  period: string | null;
  daysParam: string | null;
  source: string | null;
  withLocations: boolean;
  withCompare: boolean;
  withStrip: boolean;
};

/** Mismo shape que la respuesta JSON de GET /api/analytics/traffic. */
export async function buildDashboardTrafficJson(
  opts: BuildDashboardTrafficJsonOptions,
): Promise<Record<string, unknown>> {
  const { days, bucketCount, periodKey } = resolvePeriodDays(opts.period, opts.daysParam);
  const excludeUserIds = parseGa4ExcludedUserIds();
  const userIdFilterActive = excludeUserIds.length > 0;

  const accounts = await getAccountsForTrafficRequest(opts.source);

  const rows: PropertyTrafficRow[] | PropertyTrafficComparisonRow[] = opts.withCompare
    ? await fetchTrafficForAllPropertiesWithComparison(accounts, days, excludeUserIds)
    : await fetchTrafficForAllProperties(accounts, days, excludeUserIds);

  const totals = rows.reduce(
    (acc, r) => ({
      sessions: acc.sessions + r.sessions,
      totalUsers: acc.totalUsers + r.totalUsers,
      screenPageViews: acc.screenPageViews + r.screenPageViews,
    }),
    { sessions: 0, totalUsers: 0, screenPageViews: 0 },
  );

  let previousTotals: { sessions: number; totalUsers: number; screenPageViews: number } | undefined;
  let totalsChangePct:
    | { sessions: number | null; totalUsers: number | null; screenPageViews: number | null }
    | undefined;
  let topGrowth:
    | {
        property: string;
        propertyDisplayName: string;
        sessionsChangePct: number;
      }
    | null
    | undefined;

  if (opts.withCompare) {
    const cRows = rows as PropertyTrafficComparisonRow[];
    previousTotals = cRows.reduce(
      (acc, r) => ({
        sessions: acc.sessions + r.priorSessions,
        totalUsers: acc.totalUsers + r.priorTotalUsers,
        screenPageViews: acc.screenPageViews + r.priorScreenPageViews,
      }),
      { sessions: 0, totalUsers: 0, screenPageViews: 0 },
    );
    totalsChangePct = {
      sessions: aggregatePct(previousTotals.sessions, totals.sessions),
      totalUsers: aggregatePct(previousTotals.totalUsers, totals.totalUsers),
      screenPageViews: aggregatePct(previousTotals.screenPageViews, totals.screenPageViews),
    };

    let best: { property: string; propertyDisplayName: string; sessionsChangePct: number } | null =
      null;
    for (const r of cRows) {
      if (r.error) continue;
      const pct = r.sessionsChangePct;
      if (pct === null) continue;
      if (!best || pct > best.sessionsChangePct) {
        best = {
          property: r.property,
          propertyDisplayName: r.propertyDisplayName,
          sessionsChangePct: pct,
        };
      }
    }
    topGrowth = best;
  }

  let locations: Array<{ country: string; sessions: number }> | undefined;
  if (opts.withLocations) {
    const okProps = rows.filter((r) => !r.error).map((r) => r.property);
    locations = await fetchAggregatedCountrySessions(okProps, days, 18, excludeUserIds);
  }

  let timeStrip:
    | {
        periodKey: string;
        bucketLabels: string[];
        globalBucketSessions: number[];
        globalBucketUsers: number[];
      }
    | undefined;

  const rowExtras = new Map<
    string,
    {
      sessionsWeekOverWeekPct: number | null;
      bucketSessions: number[];
      bucketUsers: number[];
      sessionsLast7Days: number;
      sessionsPrev7Days: number;
    }
  >();

  if (opts.withStrip && bucketCount > 0) {
    const layer = await fetchGeckoTimeLayer(accounts, days, bucketCount, excludeUserIds);
    timeStrip = {
      periodKey,
      bucketLabels: layer.bucketLabels,
      globalBucketSessions: layer.globalBucketSessions,
      globalBucketUsers: layer.globalBucketUsers,
    };
    for (const [prop, v] of Object.entries(layer.byProperty)) {
      rowExtras.set(prop, {
        sessionsWeekOverWeekPct: v.sessionsWeekOverWeekPct,
        bucketSessions: v.bucketSessions,
        bucketUsers: v.bucketUsers,
        sessionsLast7Days: v.sessionsLast7Days,
        sessionsPrev7Days: v.sessionsPrev7Days,
      });
    }
  }

  /** 4 tramos tipo S-3…Act. para gráfico TV visitas (90d usa ventana 28d adicional). */
  let tvVisitWeekStrip: { labels: string[]; values: number[] } | undefined;
  if (opts.withStrip && timeStrip) {
    if (bucketCount === 4) {
      tvVisitWeekStrip = {
        labels: timeStrip.bucketLabels,
        values: timeStrip.globalBucketSessions,
      };
    } else {
      try {
        const layerTv = await fetchGeckoTimeLayer(accounts, 28, 4, excludeUserIds);
        tvVisitWeekStrip = {
          labels: layerTv.bucketLabels,
          values: layerTv.globalBucketSessions,
        };
      } catch {
        tvVisitWeekStrip = undefined;
      }
    }
  }

  const rowsOut = rows.map((r) => {
    const x = rowExtras.get(r.property);
    if (!x) return r;
    return {
      ...r,
      sessionsWeekOverWeekPct: x.sessionsWeekOverWeekPct,
      bucketSessions: x.bucketSessions,
      bucketUsers: x.bucketUsers,
      sessionsLast7Days: x.sessionsLast7Days,
      sessionsPrev7Days: x.sessionsPrev7Days,
    };
  });

  let neonSubscribers:
    | {
        byBrand: Record<string, number>;
        errors?: Array<{ brand: string; message: string }>;
      }
    | undefined;
  let rowsWithNeon = rowsOut;

  try {
    const subSources = parseNeonSubscriberSources();
    if (subSources.length > 0) {
      neonSubscribers = await fetchNeonSubscriberCounts(subSources);
      const byBrand = neonSubscribers.byBrand;
      rowsWithNeon = rowsOut.map((r) => {
        const brand = inferBrandFromPropertyName(r.propertyDisplayName);
        const n = byBrand[brand];
        return {
          ...r,
          neonSubscriberCount: typeof n === "number" ? n : null,
        };
      });
    }
  } catch (neonErr) {
    const msg = neonErr instanceof Error ? neonErr.message : String(neonErr);
    neonSubscribers = {
      byBrand: {},
      errors: [{ brand: "_config", message: msg }],
    };
    rowsWithNeon = rowsOut.map((r) => ({ ...r, neonSubscriberCount: null as number | null }));
  }

  let outputRows = rowsWithNeon;
  let neonPortfolioTotal: number | undefined;
  let neonPortfolioChangePct: number | null | undefined;
  let neonWeeklyStrip:
    | { labels: string[]; values: number[]; synthetic: boolean }
    | undefined;
  let neonWeeklyByBrand:
    | Record<string, { labels: string[]; values: number[]; synthetic: boolean }>
    | undefined;
  let tvTopGrowth:
    | {
        property: string;
        propertyDisplayName: string;
        brandShort: string;
        sessionsChangePct: number;
        neonSubscriberChangePct: number | null;
      }
    | null = null;

  const liveByBrand = neonSubscribers?.byBrand;
  if (
    liveByBrand &&
    typeof liveByBrand === "object" &&
    Object.keys(liveByBrand).length > 0
  ) {
    neonPortfolioTotal = Object.values(liveByBrand).reduce((a, n) => a + n, 0);
    const sql = getNeonSql();
    if (sql) {
      try {
        await upsertSubscriberPortfolioDaily(sql, utcTodayDateString(), liveByBrand);
      } catch {
        /* errores de red / permisos: seguimos sin histórico */
      }
      const prevAnchor = await getSubscriberPortfolioAtOrBefore(
        sql,
        utcDateDaysAgo(days),
      );
      neonPortfolioChangePct =
        prevAnchor != null && neonPortfolioTotal !== undefined
          ? aggregatePct(prevAnchor.total_subscribers, neonPortfolioTotal)
          : null;

      const weekly = await fetchSubscriberWeeklyTotals(sql, neonPortfolioTotal);
      neonWeeklyStrip = {
        labels: ["S-3", "S-2", "S-1", "Act."],
        values: weekly.values,
        synthetic: weekly.synthetic,
      };

      const brandKeys = Object.keys(liveByBrand);
      if (brandKeys.length > 0) {
        const seriesByBrand = await fetchSubscriberWeeklySeriesByBrands(sql, brandKeys);
        neonWeeklyByBrand = {};
        for (const brand of brandKeys) {
          const ser = seriesByBrand[brand];
          if (!ser) continue;
          neonWeeklyByBrand[brand] = {
            labels: ["S-3", "S-2", "S-1", "Act."],
            values: ser.values,
            synthetic: ser.synthetic,
          };
        }
      }

      outputRows = rowsWithNeon.map((r) => {
        const brand = inferBrandFromPropertyName(r.propertyDisplayName);
        const curr =
          typeof liveByBrand[brand] === "number" ? liveByBrand[brand]! : null;
        const prev = brandCountFromPortfolio(prevAnchor, brand);
        let neonSubscriberChangePct: number | null = null;
        if (curr != null && prev != null) {
          neonSubscriberChangePct = aggregatePct(prev, curr);
        }
        return { ...r, neonSubscriberChangePct };
      });

      if (topGrowth) {
        const b = inferBrandFromPropertyName(topGrowth.propertyDisplayName);
        const c = typeof liveByBrand[b] === "number" ? liveByBrand[b]! : null;
        const p = brandCountFromPortfolio(prevAnchor, b);
        tvTopGrowth = {
          property: topGrowth.property,
          propertyDisplayName: topGrowth.propertyDisplayName,
          brandShort: brandShortLabelForTv(b),
          sessionsChangePct: topGrowth.sessionsChangePct,
          neonSubscriberChangePct:
            c != null && p != null ? aggregatePct(p, c) : null,
        };
      }
    } else {
      outputRows = rowsWithNeon.map((r) => ({
        ...r,
        neonSubscriberChangePct: null as number | null,
      }));
      if (topGrowth) {
        const b = inferBrandFromPropertyName(topGrowth.propertyDisplayName);
        tvTopGrowth = {
          property: topGrowth.property,
          propertyDisplayName: topGrowth.propertyDisplayName,
          brandShort: brandShortLabelForTv(b),
          sessionsChangePct: topGrowth.sessionsChangePct,
          neonSubscriberChangePct: null,
        };
      }
    }
  }

  return {
    days,
    period: periodKey,
    compare: opts.withCompare,
    rows: outputRows,
    totals,
    propertyCount: rows.length,
    userIdFilterActive,
    excludedUserIdCount: excludeUserIds.length,
    ...(previousTotals ? { previousTotals, totalsChangePct, topGrowth: topGrowth ?? null } : {}),
    ...(opts.withLocations ? { locations: locations ?? [] } : {}),
    ...(timeStrip ? { timeStrip } : {}),
    ...(tvVisitWeekStrip ? { tvVisitWeekStrip } : {}),
    ...(neonSubscribers ? { neonSubscribers } : {}),
    ...(neonPortfolioTotal !== undefined
      ? { neonPortfolioTotal, neonPortfolioChangePct: neonPortfolioChangePct ?? null }
      : {}),
    ...(neonWeeklyStrip ? { neonWeeklyStrip } : {}),
    ...(neonWeeklyByBrand && Object.keys(neonWeeklyByBrand).length > 0
      ? { neonWeeklyByBrand }
      : {}),
    ...(tvTopGrowth !== null ? { tvTopGrowth } : {}),
  };
}
