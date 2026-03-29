"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TrafficCharts, type TrafficChartRow } from "@/components/traffic-charts";
import type { AccountRow } from "@/lib/ga/account-summaries";
import { formatUtcDateTimeForDisplay } from "@/lib/format-datetime";

type HomeTrafficOk = {
  days: number;
  rows: TrafficChartRow[];
  totals: { sessions: number; totalUsers: number; screenPageViews: number };
  propertyCount: number;
  userIdFilterActive?: boolean;
  excludedUserIdCount?: number;
};

type ApiOk = {
  accounts: AccountRow[];
  source?: "database" | "google";
  syncedAt?: string | null;
  persistEnabled?: boolean;
};

type ApiErr = { error: string; code?: string; hint?: string };

const TRAFFIC_DAY_OPTIONS = [
  { value: 7, label: "7 días" },
  { value: 14, label: "14 días" },
  { value: 28, label: "28 días" },
  { value: 30, label: "30 días" },
] as const;

function fmtTraffic(n: number) {
  return new Intl.NumberFormat("es-ES").format(Math.round(n));
}

/** Parte la respuesta de la IA en ítems (líneas que empiezan por -, •, * o 1. 2. …). */
function parseInsightBullets(raw: string): string[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n").map((l) => l.trimEnd());
  const items: string[] = [];
  let current = "";

  const isBulletStart = (line: string) => {
    const t = line.trim();
    return /^[-*•]\s+/.test(t) || /^\d+[.)]\s+/.test(t);
  };

  const stripBullet = (line: string) => {
    const t = line.trim();
    const sym = /^[-*•]\s+(.+)$/.exec(t);
    if (sym) return sym[1];
    const num = /^\d+[.)]\s+(.+)$/.exec(t);
    if (num) return num[1];
    return t;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isBulletStart(trimmed)) {
      if (current) items.push(current.trim());
      current = stripBullet(trimmed);
    } else if (current) {
      current += " " + trimmed;
    } else {
      current = trimmed;
    }
  }
  if (current) items.push(current.trim());

  return items.length > 0 ? items : [text];
}

function softenInsightJargon(s: string): string {
  return s
    .replace(/\buserIdFilterActive\s+es\s+false\b/gi, "No hay filtro User-ID activo")
    .replace(/\buserIdFilterActive\s+es\s+true\b/gi, "Hay filtro User-ID activo")
    .replace(/\buserIdFilterActive\b/gi, "filtro User-ID");
}

function insightItemRichText(text: string): ReactNode {
  const t = softenInsightJargon(text);
  const parts = t.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) {
      return (
        <strong key={i} className="font-semibold text-zinc-100">
          {m[1]}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function insightItemIsNote(item: string): boolean {
  return /User-ID|filtro User-ID|GA4|tráfico interno|entre propiedades/i.test(softenInsightJargon(item));
}

function InsightHighlights({ text }: { text: string }) {
  const items = useMemo(() => parseInsightBullets(text), [text]);

  return (
    <ul className="mt-4 space-y-0">
      {items.map((item, idx) => {
        const note = insightItemIsNote(item);
        return (
          <li
            key={`${idx}-${item.slice(0, 24)}`}
            className={`relative border-t border-zinc-800/90 py-4 first:border-t-0 first:pt-0 sm:py-4 ${
              note ? "rounded-xl border border-amber-900/35 !border-t-amber-900/35 bg-amber-950/15 px-4 py-4 sm:px-5" : ""
            }`}
          >
            <div className="flex gap-3 sm:gap-4">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold ${
                  note
                    ? "bg-amber-900/40 text-amber-200/95"
                    : "bg-violet-900/45 text-violet-200/95"
                }`}
                aria-hidden
              >
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                {note ? (
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-amber-500/90">
                    Nota sobre datos
                  </p>
                ) : null}
                <p className="text-sm leading-relaxed text-zinc-300 sm:text-[15px] sm:leading-7">
                  {insightItemRichText(item)}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function HomePageClient() {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const [homeTraffic, setHomeTraffic] = useState<HomeTrafficOk | null>(null);
  const [homeTrafficLoading, setHomeTrafficLoading] = useState(true);
  const [homeTrafficError, setHomeTrafficError] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsText, setInsightsText] = useState<string | null>(null);
  const [insightsSkipped, setInsightsSkipped] = useState(false);
  const [insightsSkipMessage, setInsightsSkipMessage] = useState<string | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [trafficDays, setTrafficDays] = useState(7);
  const [useStoredTraffic, setUseStoredTraffic] = useState(false);
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

  const loadTrafficAndInsights = useCallback(async () => {
    setHomeTrafficLoading(true);
    setInsightsLoading(true);
    setHomeTrafficError(null);
    setInsightsError(null);
    setInsightsSkipped(false);
    setInsightsSkipMessage(null);
    setInsightsText(null);
    try {
      const q = new URLSearchParams({ days: String(trafficDays) });
      if (useStoredTraffic) {
        q.set("source", "stored");
      }
      const tr = await fetch(`/api/analytics/traffic?${q}`, { cache: "no-store" });
      const tj = (await tr.json()) as HomeTrafficOk & { error?: string };
      if (!tr.ok) {
        setHomeTraffic(null);
        setHomeTrafficError(tj.error ?? tr.statusText);
        return;
      }
      setHomeTraffic(tj);

      const ins = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tj),
      });
      const ij = (await ins.json()) as {
        skipped?: boolean;
        message?: string;
        error?: string;
        text?: string;
      };
      if (ins.status === 503 && ij.skipped) {
        setInsightsSkipped(true);
        setInsightsSkipMessage(ij.message ?? null);
        return;
      }
      if (!ins.ok) {
        setInsightsError(ij.error ?? "No se pudo generar el resumen");
        return;
      }
      setInsightsText(ij.text ?? null);
    } catch (e) {
      setHomeTrafficError(e instanceof Error ? e.message : "Error de red (tráfico)");
      setInsightsError(e instanceof Error ? e.message : "Error de red (IA)");
    } finally {
      setHomeTrafficLoading(false);
      setInsightsLoading(false);
    }
  }, [trafficDays, useStoredTraffic]);

  useEffect(() => {
    void loadTrafficAndInsights();
  }, [loadTrafficAndInsights]);

  const stats = useMemo(() => {
    if (!accounts?.length) {
      return { accounts: 0, properties: 0 };
    }
    const properties = accounts.reduce((n, a) => n + a.propertySummaries.length, 0);
    return { accounts: accounts.length, properties };
  }, [accounts]);

  const sourceLabel =
    meta.source === "database"
      ? "Neon"
      : meta.source === "google"
        ? "Google en vivo"
        : "—";

  return (
    <div className="min-h-full bg-[#0f1419] text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <div className="mb-10 flex flex-col gap-6 border-b border-zinc-800/80 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-teal-500/90">Metrics</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Panel Google Analytics 4
            </h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-500">
              Inventario de cuentas y propiedades, sincronización con Neon y análisis de visitas con gráficos.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Secciones">
            <span className="inline-flex items-center rounded-full border border-teal-600/50 bg-teal-950/40 px-4 py-2 text-sm font-medium text-teal-100">
              Inventario
            </span>
            <Link
              href="/traffic"
              className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/60 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-violet-500/60 hover:bg-violet-950/30 hover:text-violet-200"
            >
              Tráfico y gráficos
            </Link>
          </nav>
        </div>

        <Link
          href="/traffic"
          className="group mb-10 block rounded-2xl border border-violet-800/40 bg-gradient-to-br from-violet-950/35 via-zinc-900/40 to-zinc-950 p-6 shadow-lg shadow-black/20 transition hover:border-violet-600/50 hover:from-violet-950/50 sm:p-8"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-violet-400/90">Análisis</p>
              <h2 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
                Ver visitas en todos los sites
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
                Barras por propiedad, reparto de sesiones, tabla detallada y opción de desglose por{" "}
                <span className="text-zinc-300">país</span> (más lento).
              </p>
            </div>
            <span className="shrink-0 self-start rounded-lg bg-violet-600/20 px-4 py-2.5 text-sm font-medium text-violet-200 transition group-hover:bg-violet-600/35 sm:self-center">
              Abrir tráfico →
            </span>
          </div>
        </Link>

        <section className="mb-12 rounded-2xl border border-emerald-900/30 bg-zinc-950/40 p-5 sm:p-7">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-emerald-500/90">
                Últimos {trafficDays} días
              </p>
              <h2 className="mt-1 text-xl font-semibold text-white">Resumen de visitas en el panel</h2>
              <p className="mt-2 max-w-2xl text-sm text-zinc-500">
                Misma consulta que{" "}
                <Link href="/traffic" className="text-emerald-400/90 underline-offset-2 hover:underline">
                  Tráfico
                </Link>{" "}
                (sin países aquí; el desglose por país y la tabla detallada están en esa página). Los destacados los
                genera Together con{" "}
                <code className="rounded bg-zinc-800/60 px-1 font-mono text-[11px] text-zinc-300">TOGETHER_API_KEY</code>{" "}
                en{" "}
                <code className="rounded bg-zinc-800/60 px-1 font-mono text-[11px] text-zinc-300">.env.local</code>;
                reinicia{" "}
                <code className="rounded bg-zinc-800/60 px-1 font-mono text-[11px] text-zinc-300">npm run dev</code>{" "}
                tras guardarla.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {homeTraffic?.userIdFilterActive ? (
                <span className="rounded-full border border-amber-800/50 bg-amber-950/40 px-3 py-1 text-xs text-amber-200/90">
                  Filtro User-ID activo ({homeTraffic.excludedUserIdCount ?? 0} id)
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void loadTrafficAndInsights()}
                disabled={homeTrafficLoading || insightsLoading}
                className="rounded-lg border border-emerald-700/50 bg-emerald-950/40 px-3 py-1.5 text-sm font-medium text-emerald-100 hover:border-emerald-500 disabled:opacity-50"
              >
                {homeTrafficLoading || insightsLoading ? "Actualizando…" : "Actualizar gráficos e IA"}
              </button>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-zinc-800/80 pb-6">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <span>Rango</span>
              <select
                value={trafficDays}
                onChange={(e) => setTrafficDays(Number(e.target.value))}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
              >
                {TRAFFIC_DAY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label
              className={`flex items-center gap-2 text-sm ${meta.persistEnabled ? "cursor-pointer text-zinc-400" : "cursor-not-allowed text-zinc-600"}`}
            >
              <input
                type="checkbox"
                checked={useStoredTraffic}
                disabled={!meta.persistEnabled}
                onChange={(e) => setUseStoredTraffic(e.target.checked)}
                className="rounded border-zinc-600 disabled:opacity-50"
              />
              Lista de propiedades desde Neon
            </label>
            {!meta.persistEnabled ? (
              <span className="text-xs text-zinc-600">Neon requiere DATABASE_URL</span>
            ) : null}
          </div>

          {homeTrafficError ? (
            <p className="mb-4 text-sm text-rose-400/90">{homeTrafficError}</p>
          ) : null}

          {homeTrafficLoading && !homeTraffic ? (
            <p className="animate-pulse text-zinc-500">Cargando métricas de tráfico…</p>
          ) : null}

          {homeTraffic && homeTraffic.rows.length > 0 ? (
            <>
              <div className="mb-6 flex flex-wrap gap-3 text-sm">
                <span className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-zinc-300">
                  <span className="text-zinc-500">Sesiones</span>{" "}
                  <span className="font-mono tabular-nums text-emerald-200/90">
                    {fmtTraffic(homeTraffic.totals.sessions)}
                  </span>
                </span>
                <span className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-zinc-300">
                  <span className="text-zinc-500">Usuarios</span>{" "}
                  <span className="font-mono tabular-nums text-emerald-200/90">
                    {fmtTraffic(homeTraffic.totals.totalUsers)}
                  </span>
                </span>
                <span className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-zinc-300">
                  <span className="text-zinc-500">Vistas</span>{" "}
                  <span className="font-mono tabular-nums text-emerald-200/90">
                    {fmtTraffic(homeTraffic.totals.screenPageViews)}
                  </span>
                </span>
                <span className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-zinc-500">
                  {homeTraffic.propertyCount} propiedades
                </span>
              </div>
              <TrafficCharts rows={homeTraffic.rows} days={homeTraffic.days} compact />
            </>
          ) : null}

          {homeTraffic && homeTraffic.rows.length === 0 && !homeTrafficLoading ? (
            <p className="text-sm text-zinc-500">Sin propiedades para mostrar en el resumen de tráfico.</p>
          ) : null}

          <div className="mt-8 overflow-hidden rounded-2xl border border-violet-900/30 bg-gradient-to-b from-violet-950/20 via-zinc-950/50 to-zinc-950/80 shadow-lg shadow-black/20">
            <div className="border-b border-violet-900/25 bg-violet-950/25 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-white">Destacados (IA)</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Resumen automático a partir de tus métricas; revisa cifras en los gráficos de arriba.
                  </p>
                </div>
                <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-violet-700/40 bg-violet-950/50 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-violet-300/90">
                  Together
                </span>
              </div>
            </div>
            <div className="px-4 pb-2 pt-1 sm:px-6 sm:pb-4">
              {insightsLoading ? (
                <div className="py-8">
                  <div className="mx-auto h-1 max-w-xs overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-violet-500/60" />
                  </div>
                  <p className="mt-4 text-center text-sm text-zinc-500">Generando resumen…</p>
                </div>
              ) : null}
              {!insightsLoading && insightsSkipped && insightsSkipMessage ? (
                <p className="py-6 text-sm leading-relaxed text-zinc-400">{insightsSkipMessage}</p>
              ) : null}
              {!insightsLoading && insightsError ? (
                <p className="py-6 text-sm text-rose-400/90">{insightsError}</p>
              ) : null}
              {!insightsLoading && insightsText ? <InsightHighlights text={insightsText} /> : null}
              {!insightsLoading && !insightsSkipped && !insightsError && !insightsText && homeTraffic?.rows.length ? (
                <p className="py-6 text-sm text-zinc-500">Sin texto de IA.</p>
              ) : null}
            </div>
          </div>
        </section>

        <section id="inventario" className="mb-10">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Inventario</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Cuentas y propiedades visibles para tu cuenta de servicio. Con Neon guardas una copia local.
              </p>
            </div>
            {!loading && accounts && accounts.length > 0 ? (
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-zinc-300">
                  <span className="font-mono text-teal-400/90">{stats.accounts}</span> cuentas
                </span>
                <span className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-zinc-300">
                  <span className="font-mono text-teal-400/90">{stats.properties}</span> propiedades
                </span>
                <span className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-zinc-400">
                  Origen: <span className="text-zinc-200">{sourceLabel}</span>
                </span>
                {meta.syncedAt ? (
                  <span className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-zinc-500">
                    Sync BD:{" "}
                    <span className="font-mono text-xs text-zinc-400">
                      {formatUtcDateTimeForDisplay(meta.syncedAt)}
                    </span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 sm:p-5">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-lg border border-teal-700/60 bg-teal-950/40 px-4 py-2 text-sm font-medium text-teal-100 transition hover:border-teal-500 hover:bg-teal-900/50 disabled:opacity-50"
              >
                {loading ? "Cargando…" : meta.persistEnabled ? "Recargar (Neon)" : "Recargar"}
              </button>
              {meta.persistEnabled ? (
                <button
                  type="button"
                  onClick={() => void load({ live: true })}
                  disabled={loading}
                  className="rounded-lg border border-zinc-600 bg-zinc-900/60 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 disabled:opacity-50"
                >
                  Ver en vivo (Google)
                </button>
              ) : null}
              {meta.persistEnabled ? (
                <button
                  type="button"
                  onClick={() => void syncFromGoogle()}
                  disabled={syncing || loading}
                  className="rounded-lg border border-violet-700/50 bg-violet-950/40 px-4 py-2 text-sm font-medium text-violet-100 transition hover:border-violet-500 hover:bg-violet-900/40 disabled:opacity-50"
                >
                  {syncing ? "Sincronizando…" : "Sincronizar → Neon"}
                </button>
              ) : null}
              <Link
                href="/traffic"
                className="inline-flex items-center rounded-lg border border-violet-600/40 bg-transparent px-4 py-2 text-sm font-medium text-violet-300/90 transition hover:border-violet-500 hover:bg-violet-950/25"
              >
                Ir a tráfico
              </Link>
            </div>
            {!meta.persistEnabled && !loading ? (
              <p className="mt-3 text-xs text-zinc-500">
                Sin <code className="rounded bg-zinc-800 px-1 font-mono text-zinc-400">DATABASE_URL</code> solo se
                consulta Google en vivo; añade Neon en <code className="font-mono text-zinc-400">.env.local</code> para
                guardar inventario.
              </p>
            ) : null}
          </div>
        </section>

        {loading && accounts === null && !error && (
          <p className="animate-pulse text-zinc-500">Cargando cuentas…</p>
        )}

        {error && (
          <div
            className="mb-8 rounded-xl border border-rose-900/60 bg-rose-950/30 p-6 text-rose-100"
            role="alert"
          >
            <p className="font-medium text-rose-200">Error al obtener datos</p>
            <p className="mt-2 font-mono text-sm text-rose-100/90">{error.error}</p>
            {error.code ? (
              <p className="mt-1 font-mono text-xs text-rose-300/80">Código: {error.code}</p>
            ) : null}
            {error.hint ? (
              <p className="mt-4 text-sm leading-relaxed text-rose-200/80">{error.hint}</p>
            ) : null}
          </div>
        )}

        {!loading &&
          accounts &&
          accounts.length === 0 &&
          meta.persistEnabled &&
          meta.source === "database" && (
            <p className="mb-8 rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/90">
              La base de datos aún no tiene filas. Usa <strong>Sincronizar → Neon</strong> (requiere credenciales de
              Google Analytics) o revisa que hayas ejecutado{" "}
              <code className="font-mono text-xs text-amber-200">db/schema.sql</code> en Neon.
            </p>
          )}

        {!loading &&
          accounts &&
          accounts.length === 0 &&
          !(meta.persistEnabled && meta.source === "database") && (
            <div className="mb-8 rounded-xl border border-sky-900/50 bg-sky-950/20 px-5 py-4 text-sm leading-relaxed text-sky-100/90">
              <p className="font-medium text-sky-200">No hay cuentas visibles para esta identidad</p>
              <p className="mt-2 text-sky-100/80">
                La conexión a la API de Google suele estar bien; el resultado vacío casi siempre significa que la{" "}
                <strong>cuenta de servicio</strong> no tiene acceso en la interfaz de Analytics.
              </p>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sky-100/75">
                <li>
                  En{" "}
                  <a
                    href="https://analytics.google.com/"
                    className="text-sky-300 underline decoration-sky-600 underline-offset-2 hover:text-sky-200"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Analytics
                  </a>
                  , abre <strong>Administrador</strong> (engranaje) y elige la cuenta donde quieres dar acceso.
                </li>
                <li>
                  Ve a <strong>Administración de acceso a la cuenta</strong> (o acceso a la propiedad) →{" "}
                  <strong>+ Añadir usuarios</strong>.
                </li>
                <li>
                  Pega el correo que aparece en tu JSON de credenciales, campo{" "}
                  <code className="rounded bg-sky-950 px-1 font-mono text-xs text-sky-200">client_email</code> (termina
                  en <span className="font-mono text-xs text-sky-300">@...iam.gserviceaccount.com</span>).
                </li>
                <li>
                  Asigna rol <strong>Lector</strong> (o superior), guarda y espera unos segundos.
                </li>
              </ol>
              <p className="mt-4 text-sky-100/70">
                Luego pulsa <strong>Ver en vivo (Google)</strong> o <strong>Sincronizar → Neon</strong>. Cuando haya
                datos, usa <Link href="/traffic" className="font-medium text-sky-300 underline">Tráfico</Link> para
                visitas.
              </p>
            </div>
          )}

        {accounts && accounts.length > 0 && (
          <ul className="space-y-4">
            {accounts.map((acc) => (
              <li
                key={acc.account || acc.name}
                className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 shadow-lg shadow-black/20"
              >
                <div className="border-b border-zinc-800 bg-zinc-900/80 px-5 py-4">
                  <h3 className="text-lg font-medium text-white">{acc.displayName || "(Sin nombre)"}</h3>
                  <p className="mt-1 font-mono text-xs text-zinc-500">{acc.account}</p>
                </div>
                {acc.propertySummaries.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-zinc-500">Sin propiedades en el resumen.</p>
                ) : (
                  <ul className="divide-y divide-zinc-800/80">
                    {acc.propertySummaries.map((p) => (
                      <li key={p.property} className="px-5 py-3.5">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                          <span className="font-medium text-zinc-200">{p.displayName}</span>
                          {p.propertyType ? (
                            <span className="font-mono text-xs text-teal-500/90">{p.propertyType}</span>
                          ) : null}
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-zinc-600">{p.property}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
