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

export async function fetchTrafficForProperty(
  client: BetaAnalyticsDataClient,
  propertyResource: string,
  days: number,
  excludeUserIds: string[] = [],
): Promise<{ sessions: number; totalUsers: number; screenPageViews: number }> {
  const range = dateRangeForLastDays(days);
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
