import type { NeonSql } from "@/lib/db/neon";
import {
  insightUserFilterHash,
  utcInsightDateString,
} from "@/lib/db/insights-cache";
import { resolvePeriodDays } from "@/lib/ga/build-dashboard-traffic-json";

export type TrafficCacheKey = {
  cacheDateUtc: string;
  periodKey: string;
  compareMode: boolean;
  stripMode: boolean;
  locationsMode: boolean;
  sourceStored: boolean;
  userIdFilterHash: string;
};

/**
 * Clave alineada con insights: legacy usa `legacy-${días}` para no mezclar 7/14/28.
 */
export function trafficCacheKeyFromRouteParams(params: {
  period: string | null;
  daysParam: string | null;
  withCompare: boolean;
  withStrip: boolean;
  withLocations: boolean;
  sourceStored: boolean;
}): TrafficCacheKey {
  const { days, periodKey } = resolvePeriodDays(
    params.period,
    params.daysParam,
  );
  const rowPeriodKey =
    periodKey === "legacy" ? `legacy-${days}` : periodKey;
  return {
    cacheDateUtc: utcInsightDateString(),
    periodKey: rowPeriodKey,
    compareMode: params.withCompare,
    stripMode: params.withStrip,
    locationsMode: params.withLocations,
    sourceStored: params.sourceStored,
    userIdFilterHash: insightUserFilterHash(),
  };
}

export async function getCachedTrafficPayload(
  sql: NeonSql,
  key: TrafficCacheKey,
): Promise<Record<string, unknown> | null> {
  let rows: Array<{ payload: unknown }>;
  try {
    rows = (await sql`
      SELECT payload
      FROM dashboard_traffic_cache
      WHERE cache_date_utc = ${key.cacheDateUtc}::date
        AND period_key = ${key.periodKey}
        AND compare_mode = ${key.compareMode}
        AND strip_mode = ${key.stripMode}
        AND locations_mode = ${key.locationsMode}
        AND source_stored = ${key.sourceStored}
        AND user_id_filter_hash = ${key.userIdFilterHash}
      LIMIT 1
    `) as Array<{ payload: unknown }>;
  } catch {
    return null;
  }

  const row = rows[0];
  if (!row?.payload) return null;

  if (typeof row.payload === "string") {
    try {
      return JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (row.payload && typeof row.payload === "object") {
    return row.payload as Record<string, unknown>;
  }
  return null;
}

export async function upsertTrafficCache(
  sql: NeonSql,
  key: TrafficCacheKey,
  payload: Record<string, unknown>,
): Promise<void> {
  const payloadJson = JSON.stringify(payload);

  try {
    await sql`
      INSERT INTO dashboard_traffic_cache (
        cache_date_utc,
        period_key,
        compare_mode,
        strip_mode,
        locations_mode,
        source_stored,
        user_id_filter_hash,
        payload,
        computed_at
      ) VALUES (
        ${key.cacheDateUtc}::date,
        ${key.periodKey},
        ${key.compareMode},
        ${key.stripMode},
        ${key.locationsMode},
        ${key.sourceStored},
        ${key.userIdFilterHash},
        ${payloadJson}::jsonb,
        now()
      )
      ON CONFLICT (
        cache_date_utc,
        period_key,
        compare_mode,
        strip_mode,
        locations_mode,
        source_stored,
        user_id_filter_hash
      )
      DO UPDATE SET
        payload = EXCLUDED.payload,
        computed_at = now()
    `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("dashboard_traffic_cache") && msg.includes("does not exist")) {
      console.warn(
        "[traffic-cache] Tabla dashboard_traffic_cache ausente: ejecuta db/schema.sql en Neon para activar la caché.",
      );
    }
  }
}
