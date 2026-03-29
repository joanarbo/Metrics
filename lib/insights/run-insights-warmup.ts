import { getNeonSql } from "@/lib/db/neon";
import { cacheKeyFromPayload, upsertInsightsCache } from "@/lib/db/insights-cache";
import {
  trafficCacheKeyFromRouteParams,
  upsertTrafficCache,
} from "@/lib/db/traffic-cache";
import { buildDashboardTrafficJson } from "@/lib/ga/build-dashboard-traffic-json";
import { hasGoogleCredentialsEnv } from "@/lib/ga/google-client-options";
import { toInsightsPayload } from "@/lib/insights/traffic-payload";
import { summarizeAlertsAndActionsWithTogether } from "@/lib/together/summarize-traffic";

const ALLOWED_PERIODS = new Set(["7", "30", "90", "ytd"]);

export type InsightsWarmupResultItem = {
  period: string;
  source: string;
  ok: boolean;
  error?: string;
};

function parsePeriods(): string[] {
  const raw = process.env.INSIGHTS_CRON_PERIODS?.trim() || "30,90,ytd";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((p) => ALLOWED_PERIODS.has(p));
}

function warmupSources(): Array<"live" | "stored"> {
  const mode = (process.env.INSIGHTS_CRON_SOURCES || "both").toLowerCase().trim();
  if (mode === "live") return ["live"];
  if (mode === "stored") return ["stored"];
  return ["live", "stored"];
}

/**
 * Misma lógica que el cron Netlify: tráfico compare+strip por periodo y origen, Together, upsert en Neon.
 */
export async function runInsightsWarmup(): Promise<{
  ok: boolean;
  results: InsightsWarmupResultItem[];
  error?: string;
  status?: number;
}> {
  if (!hasGoogleCredentialsEnv()) {
    return { ok: false, results: [], error: "Credenciales Google ausentes", status: 503 };
  }

  const sql = getNeonSql();
  if (!sql) {
    return { ok: false, results: [], error: "DATABASE_URL ausente", status: 503 };
  }

  if (!process.env.TOGETHER_API_KEY?.trim()) {
    return { ok: false, results: [], error: "TOGETHER_API_KEY ausente", status: 503 };
  }

  const periods = parsePeriods();
  if (periods.length === 0) {
    return {
      ok: false,
      results: [],
      error: "INSIGHTS_CRON_PERIODS vacío o inválido (use 30, 90, ytd)",
      status: 400,
    };
  }

  const sources = warmupSources();
  const results: InsightsWarmupResultItem[] = [];

  for (const period of periods) {
    for (const src of sources) {
      try {
        const body = await buildDashboardTrafficJson({
          period,
          daysParam: null,
          source: src === "stored" ? "stored" : null,
          withCompare: true,
          withStrip: true,
          withLocations: false,
        });
        const tKey = trafficCacheKeyFromRouteParams({
          period,
          daysParam: null,
          withCompare: true,
          withStrip: true,
          withLocations: false,
          sourceStored: src === "stored",
        });
        await upsertTrafficCache(sql, tKey, body);
        const payload = toInsightsPayload(body);
        if (!payload) {
          results.push({ period, source: src, ok: false, error: "toInsightsPayload null" });
          continue;
        }
        const key = cacheKeyFromPayload(payload, src === "stored");
        const out = await summarizeAlertsAndActionsWithTogether(payload);
        await upsertInsightsCache(sql, key, out);
        results.push({ period, source: src, ok: true });
      } catch (e) {
        results.push({
          period,
          source: src,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return { ok: true, results };
}
