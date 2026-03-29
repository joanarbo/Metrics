import type { NeonSql } from "@/lib/db/neon";

export type SubscriberPortfolioRow = {
  total_subscribers: number;
  by_brand: Record<string, number>;
};

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Hoy UTC (YYYY-MM-DD). */
export function utcTodayDateString(): string {
  return utcDateString(new Date());
}

/** Fecha UTC hace `days` días (inclusive “hoy” como 0). */
export function utcDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return utcDateString(d);
}

function parseByBrand(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = Math.trunc(n);
  }
  return out;
}

export async function upsertSubscriberPortfolioDaily(
  sql: NeonSql,
  snapshotDateUtc: string,
  byBrand: Record<string, number>,
): Promise<void> {
  const total = Object.values(byBrand).reduce((a, n) => a + n, 0);
  const json = JSON.stringify(byBrand);
  try {
    await sql`
      INSERT INTO subscriber_portfolio_daily (snapshot_date_utc, total_subscribers, by_brand, computed_at)
      VALUES (${snapshotDateUtc}::date, ${total}, ${json}::jsonb, now())
      ON CONFLICT (snapshot_date_utc) DO UPDATE SET
        total_subscribers = EXCLUDED.total_subscribers,
        by_brand = EXCLUDED.by_brand,
        computed_at = now()
    `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("subscriber_portfolio_daily") && msg.includes("does not exist")) {
      console.warn(
        "[subscriber-snapshots] Tabla subscriber_portfolio_daily ausente: ejecuta db/schema.sql en Neon.",
      );
      return;
    }
    throw e;
  }
}

export async function getSubscriberPortfolioAtOrBefore(
  sql: NeonSql,
  dateUtc: string,
): Promise<SubscriberPortfolioRow | null> {
  try {
    const rows = (await sql`
      SELECT total_subscribers, by_brand
      FROM subscriber_portfolio_daily
      WHERE snapshot_date_utc <= ${dateUtc}::date
      ORDER BY snapshot_date_utc DESC
      LIMIT 1
    `) as Array<{ total_subscribers: number; by_brand: unknown }>;
    const row = rows[0];
    if (!row) return null;
    return {
      total_subscribers: Number(row.total_subscribers) || 0,
      by_brand: parseByBrand(row.by_brand),
    };
  } catch {
    return null;
  }
}

export async function hasAnySubscriberSnapshot(sql: NeonSql): Promise<boolean> {
  try {
    const rows = (await sql`
      SELECT 1 AS ok FROM subscriber_portfolio_daily LIMIT 1
    `) as Array<{ ok: number }>;
    return Boolean(rows[0]);
  } catch {
    return false;
  }
}

/**
 * Totales de suscriptores (suma marcas) en cuatro puntos: hace ~21, 14, 7 y 0 días UTC.
 * Etiquetas TV: S-3 … Act.
 */
export async function fetchSubscriberWeeklyTotals(
  sql: NeonSql,
  currentTotalFallback: number,
): Promise<{ values: number[]; synthetic: boolean }> {
  const offsets = [21, 14, 7, 0];
  const raw: number[] = [];
  let anyRow = false;
  for (const off of offsets) {
    const row = await getSubscriberPortfolioAtOrBefore(sql, utcDateDaysAgo(off));
    if (row) anyRow = true;
    raw.push(row?.total_subscribers ?? 0);
  }
  if (!anyRow) {
    return {
      values: [
        currentTotalFallback,
        currentTotalFallback,
        currentTotalFallback,
        currentTotalFallback,
      ],
      synthetic: true,
    };
  }
  let last = 0;
  const forward = raw.map((v) => {
    if (v > 0) {
      last = v;
      return v;
    }
    return last;
  });
  const firstPos = forward.findIndex((x) => x > 0);
  if (firstPos > 0) {
    const seed = forward[firstPos] ?? 0;
    for (let j = 0; j < firstPos; j++) {
      forward[j] = seed;
    }
  }
  return { values: forward, synthetic: false };
}

/**
 * Serie S-3…Act. por marca (mismos snapshots que el total cartera), para tarjetas por proyecto.
 */
export async function fetchSubscriberWeeklySeriesByBrands(
  sql: NeonSql,
  brands: string[],
): Promise<Record<string, { values: number[]; synthetic: boolean }>> {
  const offsets = [21, 14, 7, 0];
  const snapshots: Array<SubscriberPortfolioRow | null> = [];
  for (const off of offsets) {
    snapshots.push(await getSubscriberPortfolioAtOrBefore(sql, utcDateDaysAgo(off)));
  }
  const anyRow = snapshots.some((r) => r !== null);
  const out: Record<string, { values: number[]; synthetic: boolean }> = {};
  for (const brand of brands) {
    const raw = snapshots.map((row) => {
      const n = brandCountFromPortfolio(row, brand);
      return typeof n === "number" ? n : 0;
    });
    if (!anyRow) {
      out[brand] = {
        values: [0, 0, 0, 0],
        synthetic: true,
      };
      continue;
    }
    let last = 0;
    const forward = raw.map((v) => {
      if (v > 0) {
        last = v;
        return v;
      }
      return last;
    });
    const firstPos = forward.findIndex((x) => x > 0);
    if (firstPos > 0) {
      const seed = forward[firstPos] ?? 0;
      for (let j = 0; j < firstPos; j++) {
        forward[j] = seed;
      }
    }
    out[brand] = { values: forward, synthetic: false };
  }
  return out;
}

export function brandCountFromPortfolio(
  row: SubscriberPortfolioRow | null,
  brand: string,
): number | null {
  if (!row) return null;
  const n = row.by_brand[brand];
  return typeof n === "number" ? n : null;
}
