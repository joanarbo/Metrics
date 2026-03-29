"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PropertyNameWithBrandIcon } from "@/components/property-name-with-brand-icon";
import { TrafficCharts } from "@/components/traffic-charts";

type TrafficRow = {
  property: string;
  propertyDisplayName: string;
  accountDisplayName: string;
  sessions: number;
  totalUsers: number;
  screenPageViews: number;
  error?: string;
  neonSubscriberCount?: number | null;
};

type ApiOk = {
  days: number;
  rows: TrafficRow[];
  totals: { sessions: number; totalUsers: number; screenPageViews: number };
  propertyCount: number;
  userIdFilterActive?: boolean;
  excludedUserIdCount?: number;
  locations?: Array<{ country: string; sessions: number }>;
  neonSubscribers?: {
    byBrand: Record<string, number>;
    errors?: Array<{ brand: string; message: string }>;
  };
};

type ApiErr = { error: string; code?: string; hint?: string };

const DAY_OPTIONS = [
  { value: 7, label: "7 días" },
  { value: 14, label: "14 días" },
  { value: 28, label: "28 días" },
  { value: 30, label: "30 días" },
];

function fmt(n: number) {
  return new Intl.NumberFormat("es-ES").format(Math.round(n));
}

export default function TrafficPage() {
  const [days, setDays] = useState(7);
  const [useStored, setUseStored] = useState(false);
  const [includeLocations, setIncludeLocations] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiOk | null>(null);
  const [error, setError] = useState<ApiErr | null>(null);

  const load = useCallback(async (forceRefresh?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ days: String(days) });
      if (useStored) {
        q.set("source", "stored");
      }
      if (includeLocations) {
        q.set("locations", "1");
      }
      if (forceRefresh) {
        q.set("refresh", "1");
      }
      const res = await fetch(`/api/analytics/traffic?${q}`, { cache: "no-store" });
      const body = (await res.json()) as ApiOk & ApiErr;
      if (!res.ok) {
        setData(null);
        setError({
          error: body.error ?? res.statusText,
          code: body.code,
          hint: body.hint,
        });
        return;
      }
      setData(body);
    } catch (e) {
      setData(null);
      setError({
        error: e instanceof Error ? e.message : "Error de red",
      });
    } finally {
      setLoading(false);
    }
  }, [days, useStored, includeLocations]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-full bg-[#0f1419] text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="mb-10 flex flex-col gap-6 border-b border-zinc-800/80 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="text-sm text-zinc-500 hover:text-teal-400/90">
            ← Volver al panel
          </Link>
          <nav className="flex flex-wrap gap-2" aria-label="Secciones">
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/60 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-teal-600/50 hover:text-teal-200"
            >
              Inventario
            </Link>
            <span className="inline-flex items-center rounded-full border border-violet-600/50 bg-violet-950/40 px-4 py-2 text-sm font-medium text-violet-100">
              Tráfico y gráficos
            </span>
          </nav>
        </div>

        <header className="mb-10 border-b border-violet-900/40 pb-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-violet-400/90">
            GA4 · Data API
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Visitas en todos los sites
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400">
            Vista principal con <strong className="text-zinc-300">gráficos</strong>; la tabla queda en
            detalle abajo. Los totales siguen siendo la suma por propiedad (usuarios pueden repetirse entre
            sites).
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <span>Rango</span>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
              >
                {DAY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={useStored}
                onChange={(e) => setUseStored(e.target.checked)}
                className="rounded border-zinc-600"
              />
              Lista de propiedades desde Neon
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-sky-300/90">
              <input
                type="checkbox"
                checked={includeLocations}
                onChange={(e) => setIncludeLocations(e.target.checked)}
                className="rounded border-zinc-600"
              />
              Incluir países (más lento, 1 informe extra por propiedad)
            </label>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading}
              className="rounded-lg border border-violet-600/60 bg-violet-950/50 px-4 py-2 text-sm font-medium text-violet-100 hover:border-violet-400 disabled:opacity-50"
            >
              {loading ? "Cargando…" : "Actualizar"}
            </button>
          </div>
          {data?.userIdFilterActive ? (
            <p className="mt-4 text-xs text-amber-400/85">
              Métricas excluyen los User-ID definidos en{" "}
              <code className="rounded bg-zinc-800 px-1 font-mono text-amber-200/90">GA4_EXCLUDED_USER_IDS</code> (
              {data.excludedUserIdCount ?? 0} valores). Requiere que los sites envíen User-ID a GA4.
            </p>
          ) : null}
        </header>

        {error && (
          <div
            className="mb-8 rounded-xl border border-rose-900/60 bg-rose-950/30 p-5 text-rose-100"
            role="alert"
          >
            <p className="font-medium text-rose-200">{error.error}</p>
            {error.code ? <p className="mt-1 font-mono text-xs">{error.code}</p> : null}
            {error.hint ? <p className="mt-3 text-sm text-rose-200/80">{error.hint}</p> : null}
          </div>
        )}

        {loading && !data && !error && (
          <p className="animate-pulse text-zinc-500">Consultando todas las propiedades…</p>
        )}

        {data && data.rows.length === 0 && (
          <p className="text-zinc-500">No hay propiedades GA4 en el resumen. Sincroniza cuentas o quita “Neon”.</p>
        )}

        {data && data.rows.length > 0 && (
          <>
            {data.neonSubscribers ? (
              <p className="mb-4 font-mono text-xs text-cyan-400/90">
                Suscriptores Neon (por marca):{" "}
                {Object.entries(data.neonSubscribers.byBrand)
                  .map(([b, n]) => `${b} ${fmt(n)}`)
                  .join(" · ")}
                {data.neonSubscribers.errors?.length ? (
                  <span className="ml-2 text-rose-400/90">
                    ({data.neonSubscribers.errors.length} error(es))
                  </span>
                ) : null}
              </p>
            ) : null}

            <TrafficCharts
              rows={data.rows}
              days={data.days}
              locations={includeLocations ? data.locations : undefined}
            />

            <details className="mt-12 rounded-xl border border-zinc-800 bg-zinc-950/30 open:bg-zinc-950/40">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-200">
                Ver tabla numérica detallada
              </summary>
              <div className="overflow-x-auto border-t border-zinc-800">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-4 py-3 font-medium">Cuenta</th>
                      <th className="px-4 py-3 font-medium">Propiedad</th>
                      <th className="px-4 py-3 text-right font-medium">Sesiones</th>
                      <th className="px-4 py-3 text-right font-medium">Usuarios</th>
                      <th className="px-4 py-3 text-right font-medium">Vistas</th>
                      {data.neonSubscribers ? (
                        <th className="px-4 py-3 text-right font-medium text-cyan-500/90" title="Neon">
                          Sus.
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/90">
                    {data.rows.map((r) => (
                      <tr key={r.property} className="bg-zinc-950/40 hover:bg-zinc-900/50">
                        <td className="px-4 py-3 text-zinc-400">{r.accountDisplayName}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-100">
                            <PropertyNameWithBrandIcon displayName={r.propertyDisplayName} />
                          </div>
                          <div className="font-mono text-[11px] text-zinc-600">{r.property}</div>
                          {r.error ? (
                            <div className="mt-1 text-xs text-amber-400/90">{r.error}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-200">
                          {fmt(r.sessions)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-200">
                          {fmt(r.totalUsers)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-200">
                          {fmt(r.screenPageViews)}
                        </td>
                        {data.neonSubscribers ? (
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-cyan-300/90">
                            {r.neonSubscriberCount != null ? fmt(r.neonSubscriberCount) : "—"}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-violet-900/50 bg-violet-950/20 font-semibold text-violet-100">
                      <td className="px-4 py-4" colSpan={2}>
                        Total ({data.propertyCount} propiedades · últimos {data.days} días)
                      </td>
                      <td className="px-4 py-4 text-right font-mono tabular-nums">
                        {fmt(data.totals.sessions)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono tabular-nums">
                        {fmt(data.totals.totalUsers)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono tabular-nums">
                        {fmt(data.totals.screenPageViews)}
                      </td>
                      {data.neonSubscribers ? <td className="px-4 py-4" aria-hidden /> : null}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
