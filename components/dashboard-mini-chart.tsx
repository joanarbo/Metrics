"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineController,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  LineController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
);

const GRID = "rgba(63, 63, 70, 0.45)";

const lineOptions = (
  suggestedMax: number,
  compact?: boolean,
  micro?: boolean,
): ChartOptions<"line"> => ({
  responsive: true,
  maintainAspectRatio: false,
  /** Evita que la línea toque los bordes del canvas */
  layout: {
    padding: micro
      ? { left: 6, right: 8, top: 4, bottom: 2 }
      : compact
        ? { left: 4, right: 6, top: 4, bottom: 4 }
        : { left: 2, right: 4, top: 4, bottom: 4 },
  },
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(24, 24, 27, 0.96)",
      titleColor: "#f4f4f5",
      bodyColor: "#d4d4d8",
      borderColor: GRID,
      borderWidth: 1,
      padding: micro ? 4 : compact ? 6 : 10,
      callbacks: {
        label(ctx) {
          const v = ctx.parsed.y;
          if (v === null || v === undefined) return "";
          return `${ctx.dataset.label ?? ""}: ${Math.round(v).toLocaleString("es-ES")}`;
        },
      },
    },
  },
  scales: {
    x: {
      ticks: {
        color: "#a1a1aa",
        maxRotation: 0,
        font: { size: micro ? 9 : compact ? 10 : 11 },
      },
      grid: { color: GRID, display: !micro },
    },
    y: {
      beginAtZero: true,
      suggestedMax: suggestedMax > 0 ? suggestedMax : undefined,
      ticks: {
        color: "#71717a",
        font: { size: micro ? 9 : compact ? 10 : 11 },
        maxTicksLimit: micro ? 2 : compact ? 3 : 4,
        callback(value) {
          return typeof value === "number" ? value.toLocaleString("es-ES") : value;
        },
      },
      grid: { color: GRID, display: !micro },
    },
  },
});

export type DashboardMiniLineChartProps = {
  title: string;
  subtitle?: string;
  labels: string[];
  values: number[];
  /** Colores: visitas GA4 vs lista Neon */
  variant: "visits" | "subscribers";
  /** Menos alto: tarjetas del dashboard */
  compact?: boolean;
  /** Sparkline (Geckoboard): altura mínima, sin subtítulo */
  micro?: boolean;
  /** Solo curva (ahorra altura en tarjetas) */
  hideTitle?: boolean;
};

export function DashboardMiniLineChart({
  title,
  subtitle,
  labels,
  values,
  variant,
  compact = false,
  micro = false,
  hideTitle = false,
}: DashboardMiniLineChartProps) {
  const maxVal = Math.max(...values, 1);
  const stroke =
    variant === "visits"
      ? "rgb(52, 211, 153)"
      : "rgb(34, 211, 238)";
  const fill =
    variant === "visits"
      ? "rgba(52, 211, 153, 0.12)"
      : "rgba(34, 211, 238, 0.12)";
  const pointBg =
    variant === "visits"
      ? "rgb(16, 185, 129)"
      : "rgb(6, 182, 212)";

  const data: ChartData<"line"> = {
    labels,
    datasets: [
      {
        label: title,
        data: values,
        borderColor: stroke,
        backgroundColor: fill,
        borderWidth: micro ? 1 : compact ? 1.5 : 2,
        fill: true,
        tension: micro ? 0.25 : 0.35,
        pointRadius: micro ? 0 : compact ? 2 : 3,
        pointHoverRadius: micro ? 3 : compact ? 4 : 5,
        pointBackgroundColor: pointBg,
        pointBorderColor: "rgba(255,255,255,0.9)",
        pointBorderWidth: 1,
      },
    ],
  };

  return (
    <div
      className={`flex max-w-full flex-col overflow-hidden ${
        micro && hideTitle
          ? "h-full min-h-0 rounded-md border border-zinc-800/50 bg-zinc-950/40 px-1.5 py-1"
          : micro
            ? "h-full min-h-0 rounded-md border border-zinc-800/70 bg-zinc-950/50 p-1.5"
            : compact
              ? "min-h-24 rounded-lg border border-zinc-800/70 bg-zinc-950/50 p-1.5"
              : "min-h-[7.5rem] rounded-lg border border-zinc-800/70 bg-zinc-950/50 p-2"
      }`}
    >
      {!hideTitle ? (
        <p
          className={`shrink-0 font-semibold leading-none text-zinc-200 ${
            micro ? "text-[9px]" : compact ? "text-[10px] leading-tight" : "text-[11px]"
          }`}
        >
          {title}
        </p>
      ) : (
        <span className="sr-only">{title}</span>
      )}
      {subtitle && !micro && !hideTitle ? (
        <p
          className={`leading-snug text-zinc-500 ${
            compact ? "mt-px line-clamp-1 text-[9px]" : "mt-0.5 text-[10px]"
          }`}
        >
          {subtitle}
        </p>
      ) : null}
      <div
        className={
          micro
            ? `${hideTitle ? "mt-0" : "mt-0.5"} min-h-[2rem] w-full min-w-0 max-w-full flex-1 sm:min-h-[2.25rem]`
            : `mt-0.5 w-full min-w-0 max-w-full flex-1 ${compact ? "min-h-[3.25rem]" : "min-h-[5.5rem]"}`
        }
      >
        <div className="relative h-full min-h-0 w-full min-w-0 max-w-full overflow-hidden">
          <Line
            data={data}
            options={lineOptions(Math.max(maxVal * 1.12, 1), compact, micro)}
          />
        </div>
      </div>
    </div>
  );
}
