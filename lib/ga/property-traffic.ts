import { BetaAnalyticsDataClient, protos } from "@google-analytics/data";
import type { AccountRow } from "@/lib/ga/account-summaries";
import { googleAnalyticsClientOptions } from "@/lib/ga/google-client-options";

function excludeUserIdsDimensionFilter(
  excludeUserIds: string[],
): protos.google.analytics.data.v1beta.IFilterExpression | undefined {
  if (excludeUserIds.length === 0) {
    return undefined;
  }
  return {
    notExpression: {
      filter: {
        fieldName: "userId",
        inListFilter: {
          values: excludeUserIds,
          caseSensitive: true,
        },
      },
    },
  };
}

export type PropertyTrafficRow = {
  property: string;
  propertyDisplayName: string;
  accountDisplayName: string;
  sessions: number;
  totalUsers: number;
  screenPageViews: number;
  error?: string;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateRangeForLastDays(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

/** Misma anchura que `dateRangeForLastDays`, inmediatamente antes del periodo actual. */
export function dateRangeForPreviousPeriod(days: number): { startDate: string; endDate: string } {
  const currentStart = new Date();
  currentStart.setUTCDate(currentStart.getUTCDate() - days);

  const prevEnd = new Date(currentStart);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);

  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - days);

  return { startDate: isoDate(prevStart), endDate: isoDate(prevEnd) };
}

function percentChange(prev: number, curr: number): number | null {
  if (prev <= 0) {
    if (curr <= 0) return 0;
    return null;
  }
  return ((curr - prev) / prev) * 100;
}

/** Días desde el 1 ene (UTC) hasta hoy inclusive. */
export function daysUtcFromJan1ToToday(): number {
  const now = new Date();
  const t0 = Date.UTC(now.getUTCFullYear(), 0, 1);
  const t1 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((t1 - t0) / 86400000) + 1;
}

/**
 * Parte los últimos `totalDays` días (terminando hoy UTC) en `n` rangos contiguos.
 */
export function buildEqualDateBuckets(
  totalDays: number,
  n: number,
): Array<{ startDate: string; endDate: string }> {
  if (n <= 0 || totalDays <= 0) return [];
  const now = new Date();
  const endUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startUtc = endUtc - (totalDays - 1) * 86400000;
  const baseLen = Math.floor(totalDays / n);
  const rem = totalDays % n;
  const out: Array<{ startDate: string; endDate: string }> = [];
  let cursor = startUtc;
  for (let i = 0; i < n; i++) {
    const len = baseLen + (i < rem ? 1 : 0);
    const segEnd = cursor + (len - 1) * 86400000;
    out.push({
      startDate: isoDate(new Date(cursor)),
      endDate: isoDate(new Date(segEnd)),
    });
    cursor = segEnd + 86400000;
  }
  return out;
}

export type GeckoTimeLayer = {
  bucketLabels: string[];
  globalBucketSessions: number[];
  globalBucketUsers: number[];
  byProperty: Record<
    string,
    {
      bucketSessions: number[];
      bucketUsers: number[];
      sessionsWeekOverWeekPct: number | null;
      /** Sesiones en los últimos 7 días (rolling). */
      sessionsLast7Days: number;
      /** Sesiones en los 7 días anteriores a ese tramo. */
      sessionsPrev7Days: number;
    }
  >;
};

function bucketLabelsForCount(count: number): string[] {
  if (count === 4) return ["S-3", "S-2", "S-1", "Act."];
  if (count === 8) return Array.from({ length: 8 }, (_, i) => `B${i + 1}`);
  if (count === 12) return Array.from({ length: 12 }, (_, i) => `P${i + 1}`);
  return Array.from({ length: count }, (_, i) => `${i + 1}`);
}

/**
 * Por cada propiedad: series por bucket + % sesiones últimos 7d vs 7d anteriores.
 */
export async function fetchGeckoTimeLayer(
  accounts: AccountRow[],
  totalDays: number,
  bucketCount: number,
  excludeUserIds: string[] = [],
): Promise<GeckoTimeLayer> {
  const buckets = buildEqualDateBuckets(totalDays, bucketCount);
  const labels = bucketLabelsForCount(bucketCount);
  const client = new BetaAnalyticsDataClient(googleAnalyticsClientOptions());
  const list = flattenGa4Properties(accounts);

  const globalBucketSessions = Array.from({ length: bucketCount }, () => 0);
  const globalBucketUsers = Array.from({ length: bucketCount }, () => 0);
  const byProperty: GeckoTimeLayer["byProperty"] = {};

  const recent7 = dateRangeForLastDays(7);
  const prev7 = dateRangeForPreviousPeriod(7);

  for (const item of list) {
    const bucketSessions: number[] = [];
    const bucketUsers: number[] = [];
    let sessionsWeekOverWeekPct: number | null = null;
    let sessionsLast7Days = 0;
    let sessionsPrev7Days = 0;
    try {
      const bucketResults = await Promise.all(
        buckets.map((b) =>
          fetchTrafficForPropertyRange(client, item.property, b, excludeUserIds),
        ),
      );
      const [currW, prevW] = await Promise.all([
        fetchTrafficForPropertyRange(client, item.property, recent7, excludeUserIds),
        fetchTrafficForPropertyRange(client, item.property, prev7, excludeUserIds),
      ]);
      sessionsLast7Days = currW.sessions;
      sessionsPrev7Days = prevW.sessions;
      sessionsWeekOverWeekPct = percentChange(prevW.sessions, currW.sessions);

      for (let i = 0; i < bucketCount; i++) {
        const m = bucketResults[i];
        bucketSessions.push(m.sessions);
        bucketUsers.push(m.totalUsers);
        globalBucketSessions[i] += m.sessions;
        globalBucketUsers[i] += m.totalUsers;
      }
    } catch {
      for (let i = 0; i < bucketCount; i++) {
        bucketSessions.push(0);
        bucketUsers.push(0);
      }
    }
    byProperty[item.property] = {
      bucketSessions,
      bucketUsers,
      sessionsWeekOverWeekPct,
      sessionsLast7Days,
      sessionsPrev7Days,
    };
  }

  return {
    bucketLabels: labels,
    globalBucketSessions,
    globalBucketUsers,
    byProperty,
  };
}

function num(v: string | null | undefined): number {
  if (v === null || v === undefined || v === "") {
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function flattenGa4Properties(accounts: AccountRow[]): Array<{
  property: string;
  propertyDisplayName: string;
  accountDisplayName: string;
}> {
  const out: Array<{
    property: string;
    propertyDisplayName: string;
    accountDisplayName: string;
  }> = [];
  for (const acc of accounts) {
    for (const p of acc.propertySummaries) {
      if (!p.property?.startsWith("properties/")) {
        continue;
      }
      out.push({
        property: p.property,
        propertyDisplayName: p.displayName || p.property,
        accountDisplayName: acc.displayName || acc.account,
      });
    }
  }
  return out;
}

export async function fetchTrafficForPropertyRange(
  client: BetaAnalyticsDataClient,
  propertyResource: string,
  range: { startDate: string; endDate: string },
  excludeUserIds: string[] = [],
): Promise<{ sessions: number; totalUsers: number; screenPageViews: number }> {
  const dimensionFilter = excludeUserIdsDimensionFilter(excludeUserIds);
  const [response] = await client.runReport({
    property: propertyResource,
    dateRanges: [range],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "screenPageViews" },
    ],
    ...(dimensionFilter ? { dimensionFilter } : {}),
  });

  const row = response.rows?.[0];
  if (!row?.metricValues || row.metricValues.length < 3) {
    return { sessions: 0, totalUsers: 0, screenPageViews: 0 };
  }

  return {
    sessions: num(row.metricValues[0]?.value),
    totalUsers: num(row.metricValues[1]?.value),
    screenPageViews: num(row.metricValues[2]?.value),
  };
}

export async function fetchTrafficForProperty(
  client: BetaAnalyticsDataClient,
  propertyResource: string,
  days: number,
  excludeUserIds: string[] = [],
): Promise<{ sessions: number; totalUsers: number; screenPageViews: number }> {
  return fetchTrafficForPropertyRange(
    client,
    propertyResource,
    dateRangeForLastDays(days),
    excludeUserIds,
  );
}

export type PropertyTrafficComparisonRow = PropertyTrafficRow & {
  priorSessions: number;
  priorTotalUsers: number;
  priorScreenPageViews: number;
  sessionsChangePct: number | null;
  totalUsersChangePct: number | null;
  screenPageViewsChangePct: number | null;
};

export async function fetchTrafficForAllProperties(
  accounts: AccountRow[],
  days: number,
  excludeUserIds: string[] = [],
): Promise<PropertyTrafficRow[]> {
  const client = new BetaAnalyticsDataClient(googleAnalyticsClientOptions());
  const list = flattenGa4Properties(accounts);
  const rows: PropertyTrafficRow[] = [];

  for (const item of list) {
    try {
      const m = await fetchTrafficForProperty(client, item.property, days, excludeUserIds);
      rows.push({
        property: item.property,
        propertyDisplayName: item.propertyDisplayName,
        accountDisplayName: item.accountDisplayName,
        sessions: m.sessions,
        totalUsers: m.totalUsers,
        screenPageViews: m.screenPageViews,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      rows.push({
        property: item.property,
        propertyDisplayName: item.propertyDisplayName,
        accountDisplayName: item.accountDisplayName,
        sessions: 0,
        totalUsers: 0,
        screenPageViews: 0,
        error: msg,
      });
    }
  }

  return rows;
}

export async function fetchTrafficForAllPropertiesWithComparison(
  accounts: AccountRow[],
  days: number,
  excludeUserIds: string[] = [],
): Promise<PropertyTrafficComparisonRow[]> {
  const client = new BetaAnalyticsDataClient(googleAnalyticsClientOptions());
  const list = flattenGa4Properties(accounts);
  const currentRange = dateRangeForLastDays(days);
  const previousRange = dateRangeForPreviousPeriod(days);
  const rows: PropertyTrafficComparisonRow[] = [];

  for (const item of list) {
    try {
      const [current, previous] = await Promise.all([
        fetchTrafficForPropertyRange(client, item.property, currentRange, excludeUserIds),
        fetchTrafficForPropertyRange(client, item.property, previousRange, excludeUserIds),
      ]);
      rows.push({
        property: item.property,
        propertyDisplayName: item.propertyDisplayName,
        accountDisplayName: item.accountDisplayName,
        sessions: current.sessions,
        totalUsers: current.totalUsers,
        screenPageViews: current.screenPageViews,
        priorSessions: previous.sessions,
        priorTotalUsers: previous.totalUsers,
        priorScreenPageViews: previous.screenPageViews,
        sessionsChangePct: percentChange(previous.sessions, current.sessions),
        totalUsersChangePct: percentChange(previous.totalUsers, current.totalUsers),
        screenPageViewsChangePct: percentChange(previous.screenPageViews, current.screenPageViews),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      rows.push({
        property: item.property,
        propertyDisplayName: item.propertyDisplayName,
        accountDisplayName: item.accountDisplayName,
        sessions: 0,
        totalUsers: 0,
        screenPageViews: 0,
        priorSessions: 0,
        priorTotalUsers: 0,
        priorScreenPageViews: 0,
        sessionsChangePct: null,
        totalUsersChangePct: null,
        screenPageViewsChangePct: null,
        error: msg,
      });
    }
  }

  return rows;
}

/** Top países por propiedad (sesiones). */
export async function fetchCountrySessionsForProperty(
  client: BetaAnalyticsDataClient,
  propertyResource: string,
  days: number,
  excludeUserIds: string[] = [],
): Promise<Array<{ country: string; sessions: number }>> {
  const range = dateRangeForLastDays(days);
  const dimensionFilter = excludeUserIdsDimensionFilter(excludeUserIds);
  const [response] = await client.runReport({
    property: propertyResource,
    dateRanges: [range],
    dimensions: [{ name: "country" }],
    metrics: [{ name: "sessions" }],
    limit: 25,
    orderBys: [{ desc: true, metric: { metricName: "sessions" } }],
    ...(dimensionFilter ? { dimensionFilter } : {}),
  });

  const out: Array<{ country: string; sessions: number }> = [];
  for (const row of response.rows ?? []) {
    const country = row.dimensionValues?.[0]?.value ?? "(desconocido)";
    const sessions = num(row.metricValues?.[0]?.value);
    out.push({ country, sessions });
  }
  return out;
}

/** Suma sesiones por país entre varias propiedades. */
export async function fetchAggregatedCountrySessions(
  propertyResources: string[],
  days: number,
  topN = 18,
  excludeUserIds: string[] = [],
): Promise<Array<{ country: string; sessions: number }>> {
  if (propertyResources.length === 0) {
    return [];
  }
  const client = new BetaAnalyticsDataClient(googleAnalyticsClientOptions());
  const agg = new Map<string, number>();

  for (const prop of propertyResources) {
    try {
      const rows = await fetchCountrySessionsForProperty(client, prop, days, excludeUserIds);
      for (const r of rows) {
        agg.set(r.country, (agg.get(r.country) ?? 0) + r.sessions);
      }
    } catch {
      /* omitir propiedad sin datos geo */
    }
  }

  return [...agg.entries()]
    .map(([country, sessions]) => ({ country, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, topN);
}
