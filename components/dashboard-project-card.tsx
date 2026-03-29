"use client";

import {
  Activity,
  Bot,
  ExternalLink,
  ListTodo,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { DashboardMiniLineChart } from "@/components/dashboard-mini-chart";
import { PropertyNameWithBrandIcon } from "@/components/property-name-with-brand-icon";
import {
  insightMetricBadgeForLine,
} from "@/lib/dashboard/growth-insights-filter";
import { formatInsightLineForDisplay } from "@/lib/dashboard/pick-card-insights";
import { ga4PropertyReportsUrl } from "@/lib/ga/ga4-web-url";
import { getBrandVisuals } from "@/lib/ga/brand-theme";
import type { InsightAlertItem, InsightTrend } from "@/lib/together/summarize-traffic";

function fmtTraffic(n: number) {
  return new Intl.NumberFormat("es-ES").format(Math.round(n));
}

/** Δ% compacto para la UI (una línea). */
function fmtPctDeltaShort(p: number | null | undefined, compareOn: boolean): string {
  if (!compareOn) return "—";
  if (p === null || p === undefined) return "—";
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(0)}%`;
}

function fmtPctWow(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(0)}%`;
}

export type DashboardProjectCardProps = {
  propertyId: string;
  displayName: string;
  brand: string;
  days: number;
  sessions: number;
  sessionsChangePct: number | null | undefined;
  compareActive: boolean;
  sessionsLast7Days: number | null | undefined;
  sessionsWeekOverWeekPct: number | null | undefined;
  neonSubscriberCount: number | null | undefined;
  neonSubscriberChangePct: number | null | undefined;
  neonWeeklyValues: number[] | null;
  neonWeeklyLabels: string[] | null;
  neonWeeklySynthetic: boolean;
  /** Tramos de sesiones GA4 (mismas etiquetas que el periodo global). */
  visitBucketLabels?: string[] | null;
  visitBucketSessions?: number[] | null;
  /** Resumen IA (caché Together) para esta propiedad. */
  insightAlert?: InsightAlertItem | null;
  insightAction?: string | null;
  insightsLoading?: boolean;
  /** Mensaje global (error / IA omitida) cuando no hay líneas por propiedad. */
  insightsUnavailableNote?: string | null;
};

function InsightTrendBadge({ trend }: { trend: InsightTrend }) {
  switch (trend) {
    case "up":
      return (
        <span className="shrink-0 rounded border border-emerald-800/50 bg-emerald-950/90 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-emerald-300/95">
          UP
        </span>
      );
    case "down":
      return (
        <span className="shrink-0 rounded border border-rose-800/50 bg-rose-950/90 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-rose-300/95">
          DOWN
        </span>
      );
    case "nodata":
      return (
        <span className="shrink-0 rounded border border-zinc-700 bg-zinc-900/90 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          N/D
        </span>
      );
    default:
      return (
        <span className="shrink-0 rounded border border-amber-800/50 bg-amber-950/90 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-amber-300/95">
          FLAT
        </span>
      );
  }
}

export function DashboardProjectCard(props: DashboardProjectCardProps) {
  const v = getBrandVisuals(props.brand);
  const neonW = props.neonWeeklyValues;
  const weeklyNeonDelta =
    neonW && neonW.length >= 4 ? (neonW[3] ?? 0) - (neonW[2] ?? 0) : null;
  const neonLabels =
    props.neonWeeklyLabels?.length === (neonW?.length ?? 0)
      ? props.neonWeeklyLabels
      : neonW?.map((_, i) => `P${i + 1}`) ?? null;

  const visitBuckets = props.visitBucketSessions;
  const visitLabels = props.visitBucketLabels;
  const showVisitChart =
    visitBuckets &&
    visitBuckets.length >= 2 &&
    visitLabels &&
    visitLabels.length === visitBuckets.length;
  const showNeonChart = neonW && neonW.length >= 2 && neonLabels && neonLabels.length === neonW.length;
  const neonVals = neonW ?? [];
  const neonChartIsEmpty =
    neonVals.length > 0 && neonVals.every((v) => Number(v) === 0);
  const showNeonChartUseful = showNeonChart && !neonChartIsEmpty;
  const alertMetricBadge = props.insightAlert
    ? insightMetricBadgeForLine(props.insightAlert.text)
    : null;
  const actionMetricBadge = props.insightAction
    ? insightMetricBadgeForLine(props.insightAction)
    : null;

  return (
    <article
      className={`flex min-h-0 max-w-full flex-col gap-1.5 overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/90 p-2 ${v.rowIdle}`}
    >
      <header className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug text-zinc-100 sm:text-[15px]">
          <PropertyNameWithBrandIcon
            displayName={props.displayName}
            iconClassName="h-4 w-4 shrink-0 text-zinc-400"
          />
        </h2>
        <span className="shrink-0 font-mono text-[10px] text-zinc-500">{props.brand}</span>
        <span className="hidden text-[10px] text-zinc-600 sm:inline">{props.days}d</span>
        <a
          href={ga4PropertyReportsUrl(props.propertyId)}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-teal-800/50 bg-teal-950/40 px-1.5 py-1 text-[10px] font-semibold text-teal-200 transition-colors hover:border-teal-600 hover:bg-teal-950/70"
          target="_blank"
          rel="noopener noreferrer"
        >
          GA4
          <ExternalLink className="h-3 w-3 opacity-90" aria-hidden />
        </a>
      </header>

      {/* KPI: 4 columnas equilibradas, sin recortes (min-w-0), copy corto */}
      <div className="grid min-w-0 grid-cols-2 rounded-lg border border-zinc-800/50 bg-zinc-900/40 sm:grid-cols-4">
        <div
          className="flex min-h-[5.5rem] min-w-0 flex-col gap-1 border-b border-zinc-800/50 p-2.5 sm:border-b-0 sm:border-r"
          title="Sesiones GA4 en el periodo seleccionado y variación vs el periodo anterior."
        >
          <div className="flex items-center gap-1.5 text-zinc-500">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/15">
              <Activity className="h-4 w-4 text-emerald-400" aria-hidden />
            </span>
            <span className="min-w-0 truncate text-[11px] font-medium leading-tight text-zinc-400">
              Período
            </span>
          </div>
          <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-zinc-50">
            {fmtTraffic(props.sessions)}
          </p>
          <p className="mt-auto text-[11px] leading-none text-zinc-500">
            <span className="text-zinc-600">vs ant. </span>
            <span className="font-mono text-zinc-300">
              {fmtPctDeltaShort(props.sessionsChangePct, props.compareActive)}
            </span>
          </p>
        </div>
        <div
          className="flex min-h-[5.5rem] min-w-0 flex-col gap-1 border-b border-zinc-800/50 p-2.5 sm:border-b-0 sm:border-r"
          title="Sesiones últimos 7 días y variación semana a semana."
        >
          <div className="flex items-center gap-1.5 text-zinc-500">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-500/15">
              <Users className="h-4 w-4 text-sky-400" aria-hidden />
            </span>
            <span className="min-w-0 truncate text-[11px] font-medium leading-tight text-zinc-400">
              7 días
            </span>
          </div>
          <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-zinc-50">
            {props.sessionsLast7Days != null ? fmtTraffic(props.sessionsLast7Days) : "—"}
          </p>
          <p className="mt-auto text-[11px] leading-none text-zinc-500">
            <span className="text-zinc-600">WoW </span>
            <span
              className={`font-mono ${
                props.sessionsWeekOverWeekPct != null && props.sessionsWeekOverWeekPct < 0
                  ? "text-rose-400"
                  : props.sessionsWeekOverWeekPct != null && props.sessionsWeekOverWeekPct > 0
                    ? "text-emerald-400"
                    : "text-zinc-300"
              }`}
            >
              {fmtPctWow(props.sessionsWeekOverWeekPct)}
            </span>
          </p>
        </div>
        <div
          className="flex min-h-[5.5rem] min-w-0 flex-col gap-1 border-b border-zinc-800/50 bg-cyan-500/[0.06] p-2.5 sm:border-b-0 sm:border-r"
          title="Suscriptores en Neon y variación en el periodo."
        >
          <div className="flex items-center gap-1.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-500/20">
              <Sparkles className="h-4 w-4 text-cyan-400" aria-hidden />
            </span>
            <span className="min-w-0 truncate text-[11px] font-medium leading-tight text-cyan-200/90">
              Neon
            </span>
          </div>
          <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-cyan-50">
            {props.neonSubscriberCount != null ? fmtTraffic(props.neonSubscriberCount) : "—"}
          </p>
          <p className="mt-auto text-[11px] leading-none text-cyan-700/90">
            <span className="text-cyan-800/80">Δ </span>
            <span className="font-mono text-cyan-200/90">
              {fmtPctDeltaShort(props.neonSubscriberChangePct, true)}
            </span>
          </p>
        </div>
        <div
          className="flex min-h-[5.5rem] min-w-0 flex-col gap-1 p-2.5"
          title="Diferencia neto entre los dos últimos puntos de la lista Neon."
        >
          <div className="flex items-center gap-1.5 text-zinc-500">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-500/15">
              <Wallet className="h-4 w-4 text-zinc-300" aria-hidden />
            </span>
            <span className="min-w-0 truncate text-[11px] font-medium leading-tight text-zinc-400">
              Neto
            </span>
          </div>
          <p
            className={`font-mono text-2xl font-bold tabular-nums tracking-tight ${
              weeklyNeonDelta != null && weeklyNeonDelta > 0
                ? "text-emerald-400"
                : weeklyNeonDelta != null && weeklyNeonDelta < 0
                  ? "text-rose-400"
                  : "text-zinc-100"
            }`}
          >
            {weeklyNeonDelta != null
              ? `${weeklyNeonDelta >= 0 ? "+" : ""}${fmtTraffic(weeklyNeonDelta)}`
              : "—"}
          </p>
          <p className="mt-auto text-[11px] leading-none text-zinc-500">
            {props.neonWeeklySynthetic ? (
              <span className="text-amber-500/90">Datos provisionales</span>
            ) : (
              <span className="text-zinc-600">Entre snapshots</span>
            )}
          </p>
        </div>
      </div>

      {(showVisitChart || showNeonChartUseful) && (
        <div className="flex min-h-0 w-full min-w-0 max-w-full gap-1.5 overflow-hidden">
          {showVisitChart && visitBuckets && visitLabels ? (
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <DashboardMiniLineChart
                title="Tramos de sesiones GA4"
                labels={visitLabels}
                values={visitBuckets}
                variant="visits"
                micro
                hideTitle
              />
            </div>
          ) : null}
          {showNeonChartUseful && neonW && neonLabels ? (
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <DashboardMiniLineChart
                title="Lista Neon en el tiempo"
                labels={neonLabels}
                values={neonW}
                variant="subscribers"
                micro
                hideTitle
              />
            </div>
          ) : null}
        </div>
      )}

      <div className="rounded-md bg-violet-950/12 px-2 py-1.5">
        <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">
          <Bot className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
          IA
        </p>
        {props.insightsLoading ? (
          <p className="text-xs text-zinc-500">…</p>
        ) : props.insightsUnavailableNote ? (
          <p className="line-clamp-2 text-xs leading-snug text-zinc-500">
            {props.insightsUnavailableNote}
          </p>
        ) : !props.insightAlert && !props.insightAction ? (
          <p className="text-xs text-zinc-600">Sin resumen</p>
        ) : (
          <div className="space-y-1.5 text-xs leading-snug text-zinc-300">
            {props.insightAlert ? (
              <p className="flex flex-wrap items-start gap-1.5">
                {alertMetricBadge ? (
                  <span className="shrink-0 rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-teal-400/90">
                    {alertMetricBadge}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  {formatInsightLineForDisplay(props.insightAlert.text)}
                </span>
                <InsightTrendBadge trend={props.insightAlert.trend} />
              </p>
            ) : null}
            {props.insightAction ? (
              <p className="flex items-start gap-1.5 text-zinc-400">
                <ListTodo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400/90" aria-hidden />
                {actionMetricBadge ? (
                  <span className="shrink-0 rounded bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-violet-400/90">
                    {actionMetricBadge}
                  </span>
                ) : null}
                <span className="min-w-0 text-zinc-300">
                  {formatInsightLineForDisplay(props.insightAction)}
                </span>
              </p>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}
