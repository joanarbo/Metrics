import { createHash } from "crypto";
import type { NeonSql } from "@/lib/db/neon";
import { parseGa4ExcludedUserIds } from "@/lib/ga/excluded-user-ids";
import type { InsightAlertItem, TrafficPayloadForInsights } from "@/lib/together/summarize-traffic";

export function insightUserFilterHash(): string {
  const ids = parseGa4ExcludedUserIds().slice().sort().join("\0");
  if (!ids) return "";
  return createHash("sha256").update(ids).digest("hex").slice(0, 32);
}

export function utcInsightDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function periodKeyForCache(payload: TrafficPayloadForInsights): string {
  if (typeof payload.period === "string" && payload.period.length > 0) {
    return payload.period;
  }
  return `legacy-${payload.days}`;
}

export type CachedInsightsRow = {
  alerts: InsightAlertItem[];
  actions: string[];
  dataNote: string | null;
  model: string | null;
  computedAt: string;
};

type CacheKeyParts = {
  insightDateUtc: string;
  periodKey: string;
  compareMode: boolean;
  sourceStored: boolean;
  userIdFilterHash: string;
};

export async function getCachedInsights(
  sql: NeonSql,
  key: CacheKeyParts,
): Promise<CachedInsightsRow | null> {
  const rows = (await sql`
    SELECT alerts, actions, data_note, model, computed_at
    FROM dashboard_insights_cache
    WHERE insight_date_utc = ${key.insightDateUtc}::date
      AND period_key = ${key.periodKey}
      AND compare_mode = ${key.compareMode}
      AND source_stored = ${key.sourceStored}
      AND user_id_filter_hash = ${key.userIdFilterHash}
    LIMIT 1
  `) as Array<{
    alerts: unknown;
    actions: unknown;
    data_note: string | null;
    model: string | null;
    computed_at: Date | string;
  }>;

  const row = rows[0];
  if (!row) return null;

  const alerts = Array.isArray(row.alerts)
    ? (row.alerts as InsightAlertItem[])
    : [];
  const actions = Array.isArray(row.actions)
    ? (row.actions as string[]).map((x) => String(x).trim()).filter(Boolean)
    : [];

  const computedAt =
    row.computed_at instanceof Date
      ? row.computed_at.toISOString()
      : String(row.computed_at);

  return {
    alerts,
    actions,
    dataNote: row.data_note,
    model: row.model,
    computedAt,
  };
}

export async function upsertInsightsCache(
  sql: NeonSql,
  key: CacheKeyParts,
  data: {
    alerts: InsightAlertItem[];
    actions: string[];
    dataNote?: string;
    model: string;
  },
): Promise<void> {
  const alertsJson = JSON.stringify(data.alerts);
  const actionsJson = JSON.stringify(data.actions);
  const dataNote = data.dataNote ?? null;

  await sql`
    INSERT INTO dashboard_insights_cache (
      insight_date_utc,
      period_key,
      compare_mode,
      source_stored,
      user_id_filter_hash,
      alerts,
      actions,
      data_note,
      model,
      computed_at
    ) VALUES (
      ${key.insightDateUtc}::date,
      ${key.periodKey},
      ${key.compareMode},
      ${key.sourceStored},
      ${key.userIdFilterHash},
      ${alertsJson}::jsonb,
      ${actionsJson}::jsonb,
      ${dataNote},
      ${data.model},
      now()
    )
    ON CONFLICT (insight_date_utc, period_key, compare_mode, source_stored, user_id_filter_hash)
    DO UPDATE SET
      alerts = EXCLUDED.alerts,
      actions = EXCLUDED.actions,
      data_note = EXCLUDED.data_note,
      model = EXCLUDED.model,
      computed_at = now()
  `;
}

export function cacheKeyFromPayload(
  payload: TrafficPayloadForInsights,
  sourceStored: boolean,
): CacheKeyParts {
  return {
    insightDateUtc: utcInsightDateString(),
    periodKey: periodKeyForCache(payload),
    compareMode: payload.compare === true,
    sourceStored,
    userIdFilterHash: insightUserFilterHash(),
  };
}
