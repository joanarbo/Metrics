"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFitScale } from "@/hooks/use-fit-scale";
import { DashboardMiniLineChart } from "@/components/dashboard-mini-chart";
import { DashboardProjectCard } from "@/components/dashboard-project-card";
import type { TrafficChartRow } from "@/components/traffic-charts";
import {
  filterTvActions,
  filterTvAlerts,
  insightMetricBadgeForLine,
} from "@/lib/dashboard/growth-insights-filter";
import { matchInsightLineToPropertyId } from "@/lib/dashboard/match-insight-property";
import { pickCardInsights } from "@/lib/dashboard/pick-card-insights";
import { formatUtcDateTimeForDisplay } from "@/lib/format-datetime";
import { isNetlifyAuthSkipped } from "@/lib/identity";
import { ga4PropertyReportsUrl } from "@/lib/ga/ga4-web-url";
import type { AccountRow } from "@/lib/ga/account-summaries";
import {
  DASHBOARD_BRAND_ORDER,
  dashboardBrandSortIndex,
  getBrandVisuals,
} from "@/lib/ga/brand-theme";
import { inferBrandFromPropertyName } from "@/lib/ga/infer-brand";
import {
  inferInsightTrendFromText,
  type InsightAlertItem,
  type InsightTrend,
} from "@/lib/together/summarize-traffic";
import { ExternalLink, ListTodo } from "lucide-react";

const GECKO_THRESHOLD_PCT = 15;
const REFRESH_MS = 60 * 60 * 1000;

function readKioskMode(searchParams: ReturnType<typeof useSearchParams>): boolean {
  const v = searchParams.get("kiosk") ?? searchParams.get("tv");
  return v === "1" || (typeof v === "string" && v.toLowerCase() === "true");
}

type TrafficRow = TrafficChartRow & {
  priorSessions?: number;
  priorTotalUsers?: number;
  priorScreenPageViews?: number;
  sessionsChangePct?: number | null;
  totalUsersChangePct?: number | null;
  screenPageViewsChangePct?: number | null;
  sessionsWeekOverWeekPct?: number | null;
  bucketSessions?: number[];
  bucketUsers?: number[];
  neonSubscriberChangePct?: number | null;
};

type HomeTrafficOk = {
  days: number;
  period?: string;
  compare?: boolean;
  rows: TrafficRow[];
  totals: { sessions: number; totalUsers: number; screenPageViews: number };
  propertyCount: number;
  userIdFilterActive?: boolean;
  excludedUserIdCount?: number;
  previousTotals?: { sessions: number; totalUsers: number; screenPageViews: number };
  totalsChangePct?: {
    sessions: number | null;
    totalUsers: number | null;
    screenPageViews: number | null;
  };
  topGrowth?: {
    property: string;
    propertyDisplayName: string;
    sessionsChangePct: number;
  } | null;
  timeStrip?: {
    periodKey: string;
    bucketLabels: string[];
    globalBucketSessions: number[];
    globalBucketUsers: number[];
  };
  neonSubscribers?: {
    byBrand: Record<string, number>;
    errors?: Array<{ brand: string; message: string }>;
  };
  neonPortfolioTotal?: number;
  neonPortfolioChangePct?: number | null;
  neonWeeklyStrip?: {
    labels: string[];
    values: number[];
    synthetic?: boolean;
  };
  neonWeeklyByBrand?: Record<
    string,
    { labels: string[]; values: number[]; synthetic: boolean }
  >;
  tvVisitWeekStrip?: {
    labels: string[];
    values: number[];
  };
  tvTopGrowth?: {
    property: string;
    propertyDisplayName: string;
    brandShort: string;
    sessionsChangePct: number;
    neonSubscriberChangePct: number | null;
  } | null;
};

type ApiOk = {
  accounts: AccountRow[];
  source?: "database" | "google";
  syncedAt?: string | null;
  persistEnabled?: boolean;
};

type ApiErr = { error: string; code?: string; hint?: string };

const PERIOD_OPTIONS = [
  { value: "7" as const, label: "7d" },
  { value: "30" as const, label: "30d" },
  { value: "90" as const, label: "90d" },
];

function fmtTraffic(n: number) {
  return new Intl.NumberFormat("es-ES").format(Math.round(n));
}

/** Texto secundario bajo KPI TV: Δ vs N días previos con flecha. */
function fmtTvDeltaKpiLine(
  pct: number | null | undefined,
  compare: boolean,
  days: number | undefined,
): { line: string; className: string } {
  if (!compare) return { line: "Sin comparación", className: "text-zinc-500" };
  if (pct === null || pct === undefined) {
    return { line: "vs periodo anterior · nuevo", className: "text-sky-400/90" };
  }
  const arrow = pct >= 0 ? "↑" : "↓";
  const sign = pct >= 0 ? "+" : "";
  const d = days ?? "—";
  return {
    line: `Δ vs ${d}d previos: ${arrow} ${sign}${pct.toFixed(0)}%`,
    className:
      pct > GECKO_THRESHOLD_PCT
        ? "text-emerald-400"
        : pct < -GECKO_THRESHOLD_PCT
          ? "text-rose-400"
          : "text-amber-300/90",
  };
}

function normalizeInsightTrend(raw: unknown): InsightTrend {
  const x = String(raw ?? "").toLowerCase();
  if (x === "up" || x === "down" || x === "flat" || x === "nodata") return x;
  return "flat";
}

function parseInsightAlertsFromResponse(raw: unknown): InsightAlertItem[] {
  if (!Array.isArray(raw)) return [];
  const out: InsightAlertItem[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      const text = item.trim();
      out.push({ text, trend: inferInsightTrendFromText(text) });
    } else if (item && typeof item === "object" && "text" in item) {
      const t = String((item as { text: unknown }).text).trim();
      if (t) {
        out.push({
          text: t,
          trend:
            "trend" in item
              ? normalizeInsightTrend((item as { trend: unknown }).trend)
              : inferInsightTrendFromText(t),
        });
      }
    }
  }
  return out;
}

function trendTagTiny(t: InsightTrend): { tag: string; className: string } {
  const base =
    "shrink-0 rounded border px-2 py-0.5 text-center font-mono text-[10px] font-bold uppercase tracking-wide sm:text-[11px]";
  switch (t) {
    case "up":
      return {
        tag: "UP",
        className: `${base} border-emerald-800/50 bg-emerald-950/90 text-emerald-300/95`,
      };
    case "down":
      return {
        tag: "DOWN",
        className: `${base} border-rose-800/50 bg-rose-950/90 text-rose-300/95`,
      };
    case "nodata":
      return {
        tag: "N/D",
        className: `${base} border-zinc-700 bg-zinc-900/90 text-zinc-500`,
      };
    default:
      return {
        tag: "FLAT",
        className: `${base} border-amber-800/50 bg-amber-950/90 text-amber-300/95`,
      };
  }
}

function gaLinkClass(tiny?: boolean) {
  return tiny
    ? "rounded border border-zinc-600/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-300 hover:border-teal-600 hover:text-teal-200"
    : "rounded-md border border-teal-700/60 bg-teal-950/50 px-2.5 py-1.5 text-xs font-medium text-teal-100 hover:border-teal-500";
}

function pulseBarClass(height: string, width: string) {
  return `animate-pulse rounded bg-zinc-800/85 ${height} ${width}`;
}

function DashboardProjectGridSkeleton({ gridClass }: { gridClass: string }) {
  return (
    <div
      className={gridClass}
      aria-busy
      aria-label="Cargando proyectos"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-800/90 bg-zinc-900/50 p-3"
        >
          <div className={pulseBarClass("h-2.5", "w-[85%]")} />
          <div className={`mt-3 ${pulseBarClass("h-6", "w-20")}`} />
          <div className={`mt-2 ${pulseBarClass("h-6", "w-28")}`} />
          <div className={`mt-3 rounded-lg bg-black/20 p-2 ${pulseBarClass("h-14", "w-full")}`} />
        </div>
      ))}
    </div>
  );
}

function DashboardInsightsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2" aria-busy aria-label="Cargando análisis IA">
      {[0, 1].map((col) => (
        <div
          key={col}
          className="rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-2 py-2 sm:px-3"
        >
          <div className="mb-3 flex justify-between gap-2 border-b border-zinc-800/50 pb-2">
            <div className={pulseBarClass("h-5", "w-24")} />
            <div className={pulseBarClass("h-3", "w-16")} />
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded border border-zinc-800/40 bg-black/20 px-2 py-2">
                <div className={pulseBarClass("h-2 w-full", "")} />
                <div className={`mt-2 ${pulseBarClass("h-2", "w-[85%]")}`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function insightPlainText(text: string): ReactNode {
  const t = text
    .replace(/\buserIdFilterActive\s+es\s+false\b/gi, "sin filtro User-ID")
    .replace(/\buserIdFilterActive\s+es\s+true\b/gi, "filtro User-ID")
    .replace(/\buserIdFilterActive\b/gi, "User-ID");
  return t.replace(/\*\*([^*]+)\*\*/g, "$1");
}

export function HomePageClient() {
  const searchParams = useSearchParams();
  const kiosk = useMemo(() => readKioskMode(searchParams), [searchParams]);
  const authSkipped = useMemo(() => isNetlifyAuthSkipped(), []);

  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const [homeTraffic, setHomeTraffic] = useState<HomeTrafficOk | null>(null);
  const [homeTrafficLoading, setHomeTrafficLoading] = useState(true);
  const [homeTrafficError, setHomeTrafficError] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsSkipped, setInsightsSkipped] = useState(false);
  const [insightsSkipMessage, setInsightsSkipMessage] = useState<string | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insightAlerts, setInsightAlerts] = useState<InsightAlertItem[]>([]);
  const [insightActions, setInsightActions] = useState<string[]>([]);
  const [periodPreset, setPeriodPreset] = useState<"7" | "30" | "90">("30");
  const [useStoredTraffic, setUseStoredTraffic] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  /** Evita que una respuesta antigua pise datos tras cambiar periodo / Neon. */
  const trafficLoadSeq = useRef(0);
  const [warmupError, setWarmupError] = useState<string | null>(null);
  /** Refresco forzado + precache cron en Neon (secuencial). */
  const [fullRefreshLoading, setFullRefreshLoading] = useState(false);
  const [meta, setMeta] = useState<{
    source: "database" | "google" | null;
    syncedAt: string | null;
    persistEnabled: boolean;
  }>({ source: null, syncedAt: null, persistEnabled: false });

  const load = useCallback(async (opts?: { live?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const q = opts?.live ? "?live=1" : "";
      const res = await fetch(`/api/analytics/accounts${q}`, { cache: "no-store" });
      const body = (await res.json()) as ApiOk & ApiErr;
      if (!res.ok) {
        setAccounts(null);
        setMeta({ source: null, syncedAt: null, persistEnabled: false });
        setError({
          error: body.error ?? res.statusText,
          code: body.code,
          hint: body.hint,
        });
        return;
      }
      setAccounts(body.accounts ?? []);
      setMeta({
        source: body.source ?? null,
        syncedAt: body.syncedAt ?? null,
        persistEnabled: Boolean(body.persistEnabled),
      });
    } catch (e) {
      setAccounts(null);
      setMeta({ source: null, syncedAt: null, persistEnabled: false });
      setError({
        error: e instanceof Error ? e.message : "No se pudo cargar el dashboard",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const syncFromGoogle = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/accounts/sync", { method: "POST" });
      const body = (await res.json()) as ApiOk & ApiErr;
      if (!res.ok) {
        setError({
          error: body.error ?? res.statusText,
          code: body.code,
          hint: body.hint,
        });
        return;
      }
      setAccounts(body.accounts ?? []);
      setMeta({
        source: "database",
        syncedAt: body.syncedAt ?? null,
        persistEnabled: true,
      });
    } catch (e) {
      setError({
        error: e instanceof Error ? e.message : "Error al sincronizar",
      });
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTrafficAndInsights = useCallback(
    async (opts?: { forceRefresh?: boolean }): Promise<{ ok: boolean }> => {
    const seq = ++trafficLoadSeq.current;

    setHomeTrafficLoading(true);
    setInsightsLoading(true);
    setHomeTrafficError(null);
    setInsightsError(null);
    setInsightsSkipped(false);
    setInsightsSkipMessage(null);
    setInsightAlerts([]);
    setInsightActions([]);

    const trafficQ = new URLSearchParams({
      period: periodPreset,
      compare: "1",
      strip: "1",
    });
    if (useStoredTraffic) trafficQ.set("source", "stored");
    if (opts?.forceRefresh) trafficQ.set("refresh", "1");

    const cacheQ = new URLSearchParams({
      period: periodPreset,
      compare: "1",
      source: useStoredTraffic ? "stored" : "live",
    });

    let insightsFromNeon = false;

    const isStale = () => seq !== trafficLoadSeq.current;

    try {
      let trRes: Response;
      if (opts?.forceRefresh) {
        trRes = await fetch(`/api/analytics/traffic?${trafficQ}`, { cache: "no-store" });
        if (isStale()) return { ok: false };
      } else {
        const [trP, neonRes] = await Promise.all([
          fetch(`/api/analytics/traffic?${trafficQ}`, { cache: "no-store" }),
          fetch(`/api/insights?${cacheQ}`, { cache: "no-store" }),
        ]);
        if (isStale()) return { ok: false };

        const neonJson = (await neonRes.json()) as {
          cached?: boolean;
          alerts?: unknown;
          actions?: string[];
          error?: string;
        };

        if (
          neonRes.ok &&
          neonJson.cached === true &&
          !neonJson.error
        ) {
          setInsightAlerts(parseInsightAlertsFromResponse(neonJson.alerts));
          setInsightActions(Array.isArray(neonJson.actions) ? neonJson.actions : []);
          setInsightsLoading(false);
          insightsFromNeon = true;
        }
        trRes = trP;
      }

      const tj = (await trRes.json()) as HomeTrafficOk & {
        error?: string;
        hint?: string;
        code?: string;
      };

      if (isStale()) return { ok: false };

      if (!trRes.ok) {
        setHomeTraffic(null);
        const base = tj.error ?? trRes.statusText;
        const hint = typeof tj.hint === "string" && tj.hint.trim() ? `\n\n${tj.hint}` : "";
        setHomeTrafficError(`${base}${hint}`);
        return { ok: false };
      }

      setHomeTraffic(tj);
      setLastRefreshAt(new Date());

      if (insightsFromNeon) {
        return { ok: true };
      }

      const insightUrl = opts?.forceRefresh ? "/api/insights?refresh=1" : "/api/insights";
      const ins = await fetch(insightUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...tj,
          _insightsCacheSource: useStoredTraffic ? "stored" : "live",
        }),
      });
      const ij = (await ins.json()) as {
        skipped?: boolean;
        message?: string;
        error?: string;
        alerts?: unknown;
        actions?: string[];
      };

      if (isStale()) return { ok: false };

      if (ins.status === 503 && ij.skipped) {
        setInsightsSkipped(true);
        setInsightsSkipMessage(ij.message ?? null);
        return { ok: true };
      }
      if (!ins.ok) {
        setInsightsError(ij.error ?? "IA");
        return { ok: false };
      }
      setInsightAlerts(parseInsightAlertsFromResponse(ij.alerts));
      setInsightActions(Array.isArray(ij.actions) ? ij.actions : []);
      return { ok: true };
    } catch (e) {
      if (isStale()) return { ok: false };
      setHomeTrafficError(e instanceof Error ? e.message : "Red");
      if (!insightsFromNeon) {
        setInsightsError(e instanceof Error ? e.message : "Red");
      }
      return { ok: false };
    } finally {
      if (seq === trafficLoadSeq.current) {
        setHomeTrafficLoading(false);
        if (!insightsFromNeon) {
          setInsightsLoading(false);
        }
      }
    }
  },
    [periodPreset, useStoredTraffic],
  );

  /** GA4 + IA con refresh=1 (Neon), luego precache de periodos como el cron. */
  const refreshAllAndPrecacheNeon = useCallback(async () => {
    setFullRefreshLoading(true);
    setWarmupError(null);
    try {
      const first = await loadTrafficAndInsights({ forceRefresh: true });
      if (!first.ok) {
        return;
      }
      const res = await fetch("/api/insights/warmup", { method: "POST" });
      const j = (await res.json()) as { ok?: boolean; error?: string; results?: unknown };
      if (!res.ok) {
        setWarmupError(typeof j.error === "string" ? j.error : res.statusText);
        return;
      }
      await loadTrafficAndInsights();
    } catch (e) {
      setWarmupError(e instanceof Error ? e.message : "Red");
    } finally {
      setFullRefreshLoading(false);
    }
  }, [loadTrafficAndInsights]);

  useEffect(() => {
    void loadTrafficAndInsights();
  }, [loadTrafficAndInsights]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadTrafficAndInsights();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadTrafficAndInsights]);

  const stats = useMemo(() => {
    if (!accounts?.length) {
      return { accounts: 0, properties: 0 };
    }
    const properties = accounts.reduce((n, a) => n + a.propertySummaries.length, 0);
    return { accounts: accounts.length, properties };
  }, [accounts]);

  const compareActive = Boolean(homeTraffic?.compare);

  const projectCardRows = useMemo(() => {
    if (!homeTraffic?.rows.length) return [];
    const copy = [...homeTraffic.rows];
    copy.sort((a, b) => {
      const ba = inferBrandFromPropertyName(a.propertyDisplayName);
      const bb = inferBrandFromPropertyName(b.propertyDisplayName);
      const ia = dashboardBrandSortIndex(ba);
      const ib = dashboardBrandSortIndex(bb);
      if (ia !== ib) return ia - ib;
      return a.propertyDisplayName.localeCompare(b.propertyDisplayName, "es");
    });
    return copy;
  }, [homeTraffic?.rows]);

  /** Hasta 5 marcas: una sola fila en desktop (menos hueco vacío a la derecha). */
  const projectGridClass = useMemo(() => {
    const n = projectCardRows.length;
    if (n <= 0) return "grid w-full grid-cols-1 gap-1.5";
    if (n <= 5) {
      return "grid w-full grid-cols-1 content-start gap-1.5 pr-0.5 [scrollbar-gutter:stable] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5";
    }
    if (n <= 6) {
      return "grid w-full grid-cols-1 content-start gap-1.5 pr-0.5 [scrollbar-gutter:stable] sm:grid-cols-2 lg:grid-cols-3";
    }
    return "grid w-full grid-cols-1 content-start gap-1.5 pr-0.5 [scrollbar-gutter:stable] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  }, [projectCardRows.length]);

  const trafficRowsForInsights = homeTraffic?.rows ?? [];
  const canFilterInsightsByBrand = trafficRowsForInsights.length > 0;

  const insightsByPropertyId = useMemo(() => {
    const rows = homeTraffic?.rows ?? [];
    const m = new Map<
      string,
      ReturnType<typeof pickCardInsights>
    >();
    for (const r of rows) {
      m.set(r.property, pickCardInsights(r.property, rows, insightAlerts, insightActions));
    }
    return m;
  }, [homeTraffic?.rows, insightAlerts, insightActions]);

  const tvAlertItems = useMemo(() => filterTvAlerts(insightAlerts, 3), [insightAlerts]);
  const tvActionLines = useMemo(
    () =>
      trafficRowsForInsights.length > 0
        ? filterTvActions(insightActions, trafficRowsForInsights, 8)
        : insightActions.slice(0, 8),
    [insightActions, trafficRowsForInsights],
  );

  const portfolioInsightVisuals = getBrandVisuals("Otros");

  const insightsUnavailableNoteGlobal =
    insightsError ?? (insightsSkipped ? insightsSkipMessage : null);

  const portfolioSummary = useMemo(() => {
    if (!homeTraffic) return null;
    const visitDelta = fmtTvDeltaKpiLine(
      homeTraffic.totalsChangePct?.sessions,
      compareActive,
      homeTraffic.days,
    );
    const neonDelta =
      homeTraffic.neonPortfolioTotal === undefined
        ? { line: "Inscritos Neon: configura NEON_SUBSCRIBER_SOURCES", className: "text-zinc-500" }
        : homeTraffic.neonPortfolioChangePct === null ||
            homeTraffic.neonPortfolioChangePct === undefined
          ? {
              line: "Δ inscritos cartera: sin histórico (subscriber_portfolio_daily)",
              className: "text-zinc-500",
            }
          : fmtTvDeltaKpiLine(
              homeTraffic.neonPortfolioChangePct,
              true,
              homeTraffic.days,
            );
    return {
      visitDelta,
      neonDelta,
      days: homeTraffic.days,
      totalSessions: homeTraffic.totals.sessions,
      totalUsers: homeTraffic.totals.totalUsers,
      neonTotal: homeTraffic.neonPortfolioTotal,
    };
  }, [homeTraffic, compareActive]);

  const { containerRef: fitContainerRef, contentRef: fitContentRef, scale: fitScale } =
    useFitScale([
      projectCardRows.length,
      homeTrafficLoading,
      insightsLoading,
      insightAlerts.length,
      insightActions.length,
      portfolioSummary?.days,
      portfolioSummary?.totalSessions,
      homeTraffic?.tvVisitWeekStrip?.labels?.length ?? 0,
    ]);

  const controlBar = (
    <>
      {!kiosk ? (
        <label
          className="flex cursor-pointer touch-manipulation items-center gap-2 rounded border border-zinc-800/80 bg-zinc-900/40 px-2 py-1.5 max-sm:min-h-10"
          title={
            meta.persistEnabled
              ? "Listado de propiedades desde snapshot en Neon (menos llamadas a Admin API)"
              : "Sin snapshot en Neon aún: sincroniza cuentas (panel abajo) para que «Neon» use la lista guardada; si no, GA4 sigue en vivo."
          }
        >
          <input
            type="checkbox"
            checked={useStoredTraffic}
            onChange={(e) => setUseStoredTraffic(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-zinc-600 max-sm:h-[1.15rem] max-sm:w-[1.15rem]"
          />
          <span className="font-mono text-xs text-zinc-400 max-sm:text-sm">Neon</span>
        </label>
      ) : null}
      {!kiosk ? (
        <Link
          href="/traffic"
          className="inline-flex min-h-10 items-center font-mono text-xs text-violet-300 underline-offset-2 max-sm:px-1 hover:underline sm:text-sm"
        >
          Detalle
        </Link>
      ) : (
        <Link
          href="/"
          className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400"
          title="Salir del modo kiosko"
        >
          Panel
        </Link>
      )}
      {!kiosk ? (
        <button
          type="button"
          onClick={() => void refreshAllAndPrecacheNeon()}
          disabled={fullRefreshLoading || homeTrafficLoading || insightsLoading}
          title="Actualiza tráfico GA4 e IA (sin leer caché), guarda en Neon; luego precalienta todos los periodos del cron (INSIGHTS_CRON_*)."
          className="hidden touch-manipulation rounded border border-emerald-800/55 bg-emerald-950/45 px-2.5 py-1.5 font-mono text-[10px] font-semibold text-emerald-200/95 disabled:opacity-40 sm:inline-flex sm:min-h-0 sm:items-center"
        >
          {fullRefreshLoading ? "…" : "Refrescar + Neon"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void refreshAllAndPrecacheNeon()}
          disabled={fullRefreshLoading || homeTrafficLoading || insightsLoading}
          title="Refrescar todo y precachear en Neon"
          className="inline-flex min-h-8 touch-manipulation items-center rounded border border-emerald-800/60 bg-emerald-950/40 px-2 py-1 font-mono text-[10px] text-emerald-300 disabled:opacity-40"
        >
          {fullRefreshLoading ? "…" : "↻"}
        </button>
      )}
      {warmupError ? (
        <span
          className="max-w-56 truncate font-mono text-[10px] text-rose-400/95 max-sm:max-w-full"
          title={warmupError}
        >
          {warmupError}
        </span>
      ) : null}
      {lastRefreshAt ? (
        <span className="font-mono text-[10px] text-zinc-500 max-sm:text-xs" title="Auto cada 1h">
          {lastRefreshAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
        </span>
      ) : null}
      <div className="flex w-full justify-end sm:ml-auto sm:w-auto">
        <div
          className="flex touch-manipulation rounded-lg border border-zinc-600/90 bg-zinc-900/95 p-0.5 shadow-md"
          title="Rango del panel (visitas e inscritos)"
        >
          {PERIOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setPeriodPreset(o.value)}
              className={`rounded-md px-3 py-1.5 font-mono text-xs font-bold max-sm:min-h-10 max-sm:min-w-[3rem] max-sm:text-sm ${
                periodPreset === o.value
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex max-h-dvh min-h-dvh flex-col overflow-hidden bg-[#07090c] font-sans text-zinc-100 max-sm:max-h-dvh max-sm:min-h-dvh">
      <header
        className={`relative z-20 shrink-0 border-b border-zinc-800/80 pt-[env(safe-area-inset-top,0px)] ${
          kiosk
            ? "flex flex-wrap items-center justify-between gap-2 px-2 py-1"
            : "flex flex-col gap-2 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:px-4"
        }`}
      >
        {kiosk ? (
          <>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <h1 className="truncate font-mono text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300 sm:text-[13px]">
                GA4 · TV
              </h1>
              <span className="font-mono text-[10px] text-zinc-500">kiosk</span>
            </div>
            <div
              className={`flex flex-wrap items-center gap-1.5 sm:gap-2 ${authSkipped ? "" : "sm:pr-28"}`}
            >
              {controlBar}
            </div>
          </>
        ) : (
          <>
            <div className="flex w-full items-center justify-between gap-2 sm:hidden">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                  GA4 · TV
                </h1>
                {homeTraffic?.userIdFilterActive ? (
                  <span className="shrink-0 rounded bg-amber-950/50 px-2 py-0.5 font-mono text-[10px] text-amber-200/95">
                    UID
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void refreshAllAndPrecacheNeon()}
                  disabled={fullRefreshLoading || homeTrafficLoading || insightsLoading}
                  title="Actualiza GA4 e IA (sin caché), guarda en Neon y precalienta periodos del cron"
                  className="touch-manipulation rounded-lg border border-emerald-800/55 bg-emerald-950/45 px-3 py-2 font-mono text-[11px] font-semibold text-emerald-200/95 disabled:opacity-40"
                >
                  {fullRefreshLoading ? "…" : "Refrescar + Neon"}
                </button>
              </div>
            </div>
            <div className="hidden min-w-0 items-center gap-2 sm:flex sm:gap-3">
              <h1 className="truncate font-mono text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300 sm:text-[13px]">
                GA4 · TV
              </h1>
              {homeTraffic?.userIdFilterActive ? (
                <span className="hidden rounded bg-amber-950/50 px-2 py-0.5 font-mono text-[10px] text-amber-200/95 sm:inline">
                  UID
                </span>
              ) : null}
            </div>
            <div
              className={`flex w-full flex-wrap items-center gap-2 max-sm:justify-between sm:w-auto sm:justify-end ${authSkipped ? "" : "sm:pr-28"}`}
            >
              {controlBar}
            </div>
          </>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={fitContainerRef}
          className={`touch-pan-y-safe mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col overflow-hidden max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] ${
            kiosk ? "p-1.5 sm:p-2" : "p-2.5 sm:p-4"
          }`}
        >
        <div
          ref={fitContentRef}
          className={`flex w-full flex-col origin-top ${kiosk ? "gap-1.5" : "gap-2"}`}
          style={{
            transform: `scale(${fitScale})`,
            transformOrigin: "top center",
            ...(fitScale < 1 ? { width: `${100 / fitScale}%` } : {}),
          }}
        >
        {homeTrafficError ? (
          <div
            className="shrink-0 rounded-xl border border-rose-800/70 bg-rose-950/40 px-4 py-4 font-sans shadow-[0_0_24px_rgba(127,29,29,0.15)]"
            role="alert"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">
              Tráfico GA4 no disponible
            </p>
            <p className="mt-2 text-sm leading-relaxed text-rose-50/95">{homeTrafficError}</p>
            <p className="mt-3 text-xs leading-relaxed text-rose-100/90">
              En <strong className="font-medium text-rose-100/90">Netlify</strong>: Site configuration →
              Environment variables → crea{" "}
              <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-[11px] text-rose-50/95">
                GOOGLE_SERVICE_ACCOUNT_JSON
              </code>{" "}
              (pega el JSON completo de la cuenta de servicio de Google Cloud) y{" "}
              <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-[11px] text-rose-50/95">
                GOOGLE_CLOUD_PROJECT
              </code>
              . Las rutas locales al archivo no existen en el servidor; luego redeploy.
            </p>
          </div>
        ) : null}

        {/* Resumen cartera + grid de tarjetas por proyecto */}
        {portfolioSummary && !homeTrafficLoading ? (
          <div className="flex shrink-0 flex-col gap-1.5 rounded-md border border-zinc-800/70 bg-zinc-950/60 px-2 py-1 sm:flex-row sm:items-center sm:gap-2 sm:py-1.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[10px] leading-tight text-zinc-400 sm:text-[11px]">
              <span className="font-semibold uppercase tracking-wide text-zinc-500">
                Cartera · {portfolioSummary.days}d
              </span>
              <span>
                Visitas GA4{" "}
                <span className="font-mono font-semibold text-zinc-100">
                  {fmtTraffic(portfolioSummary.totalSessions)}
                </span>
                <span className={` ml-1.5 ${portfolioSummary.visitDelta.className}`}>
                  · {portfolioSummary.visitDelta.line}
                </span>
              </span>
              <span>
                Usuarios GA4{" "}
                <span className="font-mono font-semibold text-zinc-100">
                  {fmtTraffic(portfolioSummary.totalUsers)}
                </span>
              </span>
              <span>
                Inscritos Neon{" "}
                <span className="font-mono font-semibold text-cyan-200/95">
                  {portfolioSummary.neonTotal !== undefined
                    ? fmtTraffic(portfolioSummary.neonTotal)
                    : "—"}
                </span>
                <span className={` ml-1.5 ${portfolioSummary.neonDelta.className}`}>
                  · {portfolioSummary.neonDelta.line}
                </span>
              </span>
              {homeTraffic?.tvTopGrowth ? (
                <span className="text-emerald-400/95">
                  Top Δ visitas:{" "}
                  <span className="font-mono font-semibold">{homeTraffic.tvTopGrowth.brandShort}</span>{" "}
                  {homeTraffic.tvTopGrowth.sessionsChangePct >= 0 ? "+" : ""}
                  {homeTraffic.tvTopGrowth.sessionsChangePct.toFixed(0)}%
                </span>
              ) : null}
            </div>
            {homeTraffic?.tvVisitWeekStrip &&
            homeTraffic.tvVisitWeekStrip.labels.length >= 2 &&
            homeTraffic.tvVisitWeekStrip.labels.length === homeTraffic.tvVisitWeekStrip.values.length ? (
              <div className="h-[3.25rem] w-full shrink-0 sm:h-[3rem] sm:w-[min(100%,200px)]">
                <DashboardMiniLineChart
                  title="Visitas agregadas cartera GA4"
                  labels={homeTraffic.tvVisitWeekStrip.labels}
                  values={homeTraffic.tvVisitWeekStrip.values}
                  variant="visits"
                  micro
                  hideTitle
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {homeTrafficLoading && !homeTraffic ? (
          <DashboardProjectGridSkeleton gridClass={projectGridClass} />
        ) : homeTraffic && projectCardRows.length > 0 ? (
          <div className={projectGridClass}>
            {projectCardRows.map((r) => {
              const brand = inferBrandFromPropertyName(r.propertyDisplayName);
              const nw = homeTraffic.neonWeeklyByBrand?.[brand];
              const cardInsight =
                insightsByPropertyId.get(r.property) ?? { alert: null, action: null };
              const stripLabels = homeTraffic.timeStrip?.bucketLabels ?? null;
              const buckets = r.bucketSessions ?? null;
              const labelsForBuckets =
                stripLabels &&
                buckets &&
                stripLabels.length === buckets.length
                  ? stripLabels
                  : null;
              return (
                <DashboardProjectCard
                  key={r.property}
                  propertyId={r.property}
                  displayName={r.propertyDisplayName}
                  brand={brand}
                  days={homeTraffic.days}
                  sessions={r.sessions}
                  sessionsChangePct={r.sessionsChangePct}
                  compareActive={compareActive}
                  sessionsLast7Days={r.sessionsLast7Days}
                  sessionsWeekOverWeekPct={r.sessionsWeekOverWeekPct}
                  neonSubscriberCount={r.neonSubscriberCount ?? null}
                  neonSubscriberChangePct={r.neonSubscriberChangePct ?? null}
                  neonWeeklyValues={nw?.values ?? null}
                  neonWeeklyLabels={nw?.labels ?? null}
                  neonWeeklySynthetic={nw?.synthetic ?? false}
                  visitBucketLabels={labelsForBuckets}
                  visitBucketSessions={buckets}
                  insightAlert={cardInsight.alert}
                  insightAction={cardInsight.action}
                  insightsLoading={insightsLoading}
                  insightsUnavailableNote={insightsUnavailableNoteGlobal}
                />
              );
            })}
          </div>
        ) : null}

        {/* Alertas + próximos pasos (portafolio: una acción por marca) */}
        <div className="shrink-0 space-y-3">
          {insightsLoading ? <DashboardInsightsSkeleton /> : null}
          {!insightsLoading &&
          !canFilterInsightsByBrand &&
          (insightAlerts.length > 0 || insightActions.length > 0) &&
          homeTrafficLoading ? (
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              IA desde caché Neon · al cargar GA4 se enlazan alertas a cada propiedad
            </p>
          ) : null}
          {!insightsLoading && insightsSkipped && insightsSkipMessage ? (
            <div className="rounded-lg border border-zinc-800 px-3 py-2.5 text-sm text-zinc-400">
              {insightsSkipMessage}
            </div>
          ) : null}
          {!insightsLoading && insightsError ? (
            <div className="rounded-lg border border-rose-900/40 px-3 py-2.5 text-sm text-rose-300">
              {insightsError}
            </div>
          ) : null}
          {!insightsLoading && !insightsSkipped && !insightsError ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div
                className={`flex min-h-0 max-sm:max-h-none flex-col rounded-xl border px-3 py-2 ring-1 ring-inset max-sm:min-h-40 sm:max-h-[min(32vh,14rem)] sm:px-3.5 sm:py-2.5 ${portfolioInsightVisuals.cardShell} ${portfolioInsightVisuals.cardRing}`}
              >
                <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/50 pb-2">
                  <span
                    className={`max-w-[70%] truncate rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wide sm:text-[11px] ${portfolioInsightVisuals.pill}`}
                    title="Todas las marcas y propiedades"
                  >
                    Portafolio
                  </span>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-400 sm:text-[11px]">
                    Crecimiento (máx. 3)
                  </span>
                </div>
                <ul className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
                  {tvAlertItems.length === 0 ? (
                    <li className="text-sm text-zinc-500">
                      Sin alertas de crecimiento/caída en el periodo.
                    </li>
                  ) : (
                    tvAlertItems.map((item, idx) => {
                      const line = item.text;
                      const tt = trendTagTiny(item.trend);
                      const pid = homeTraffic
                        ? matchInsightLineToPropertyId(line, homeTraffic.rows)
                        : null;
                      const metricBadge = insightMetricBadgeForLine(line);
                      return (
                        <li
                          key={`${idx}-${line.slice(0, 24)}`}
                          className="flex items-start justify-between gap-2 rounded-lg border border-zinc-800/50 bg-black/25 px-2.5 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            {metricBadge ? (
                              <span className="mb-1 inline-block rounded border border-zinc-600/80 bg-zinc-900/80 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-teal-300/95">
                                {metricBadge}
                              </span>
                            ) : null}
                            <p className="text-xs leading-relaxed text-zinc-200 sm:text-sm">
                              {insightPlainText(line)}
                            </p>
                            {pid ? (
                              <a
                                href={ga4PropertyReportsUrl(pid)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-violet-400 hover:text-violet-300 hover:underline sm:text-sm"
                              >
                                Abrir en GA4
                                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                              </a>
                            ) : null}
                          </div>
                          <span className={`w-10 shrink-0 ${tt.className}`}>{tt.tag}</span>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
              <div
                className={`flex min-h-0 max-sm:max-h-none flex-col rounded-xl border px-3 py-2 ring-1 ring-inset max-sm:min-h-40 sm:max-h-[min(32vh,14rem)] sm:px-3.5 sm:py-2.5 ${portfolioInsightVisuals.cardShell} ${portfolioInsightVisuals.cardRing}`}
              >
                <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/50 pb-2">
                  <span
                    className={`max-w-[70%] truncate rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wide sm:text-[11px] ${portfolioInsightVisuals.pill}`}
                    title="Una acción prioritaria por marca"
                  >
                    Portafolio
                  </span>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-400 sm:text-[11px]">
                    Próximos pasos (1 por marca)
                  </span>
                </div>
                <ul className="min-h-0 flex-1 space-y-1.5 overflow-hidden py-0.5">
                  {tvActionLines.length === 0 ? (
                    <li className="text-sm text-zinc-500">
                      Sin acciones ligadas a incremento en el periodo.
                    </li>
                  ) : (
                    tvActionLines.map((line, i) => {
                      const metricBadge = insightMetricBadgeForLine(line);
                      return (
                        <li
                          key={`act-${i}-${line.slice(0, 16)}`}
                          className="flex gap-2.5 rounded-lg border border-zinc-800/50 bg-black/20 px-2.5 py-2"
                        >
                          <ListTodo
                            className="mt-0.5 h-4 w-4 shrink-0 text-violet-500/80"
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            {metricBadge ? (
                              <span className="mb-1 inline-block rounded border border-zinc-600/80 bg-zinc-900/80 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-violet-300/90">
                                {metricBadge}
                              </span>
                            ) : null}
                            <span className="text-xs leading-relaxed text-zinc-200 sm:text-sm">
                              {insightPlainText(line)}
                            </span>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>
          ) : null}
        </div>

        {!kiosk ? (
          <footer className="mt-1 shrink-0 border-t border-zinc-800/80 px-2 py-2 max-sm:pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] sm:mt-0 sm:px-3 sm:py-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-500 max-sm:text-sm">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="touch-manipulation font-mono min-h-10 px-1 hover:text-zinc-400 disabled:opacity-40 sm:min-h-0"
              >
                Cuentas
              </button>
              {meta.persistEnabled ? (
                <>
                  <button
                    type="button"
                    onClick={() => void load({ live: true })}
                    disabled={loading}
                    className="touch-manipulation font-mono min-h-10 px-1 hover:text-zinc-400 disabled:opacity-40 sm:min-h-0"
                  >
                    Live
                  </button>
                  <button
                    type="button"
                    onClick={() => void syncFromGoogle()}
                    disabled={syncing || loading}
                    className="touch-manipulation font-mono min-h-10 px-1 hover:text-zinc-400 disabled:opacity-40 sm:min-h-0"
                  >
                    Sync
                  </button>
                </>
              ) : null}
              <span className="font-mono leading-snug">
                {stats.properties} prop. · {meta.source === "database" ? "Neon" : "API"}
                {meta.syncedAt ? ` · ${formatUtcDateTimeForDisplay(meta.syncedAt)}` : ""}
              </span>
            </div>
            {error ? (
              <p className="mt-1 text-sm text-rose-400">{error.error}</p>
            ) : null}
          </footer>
        ) : error ? (
          <div className="mt-1 shrink-0 border-t border-rose-900/40 px-2 py-2 font-mono text-[9px] text-rose-400 sm:py-1">
            {error.error}
          </div>
        ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}
