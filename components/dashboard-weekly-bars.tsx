"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

const GRID = "#27272a";
const TICK = "#d4d4d8";

function barColors(values: number[]): string[] {
  return values.map((v, i) => {
    if (i === 0) return "rgba(113, 113, 122, 0.65)";
    const prev = values[i - 1] ?? 0;
    if (v > prev) return "rgba(52, 211, 153, 0.88)";
    if (v < prev) return "rgba(244, 63, 94, 0.82)";
    return "rgba(251, 191, 36, 0.78)";
  });
}

const baseOptions: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(24, 24, 27, 0.95)",
      titleColor: "#f4f4f5",
      bodyColor: "#d4d4d8",
      borderColor: GRID,
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      ticks: { color: TICK, font: { size: 11 } },
      grid: { color: GRID },
    },
    y: {
      ticks: { color: TICK },
      grid: { color: GRID },
    },
  },
};

export type WeeklyBarBlockProps = {
  title: string;
  subtitle?: string;
  labels: string[];
  values: number[];
};

function WeeklyBlock({
  title,
  subtitle,
  labels,
  values,
  accentClass,
}: WeeklyBarBlockProps & { accentClass: string }) {
  const data: ChartData<"bar"> = {
    labels,
    datasets: [
      {
        label: title,
        data: values,
        backgroundColor: barColors(values),
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };
  return (
    <div className="flex min-h-[200px] flex-col rounded-xl border border-zinc-800/90 bg-zinc-950/40 p-3 sm:min-h-[240px] sm:p-4">
      <p className={`text-xs font-medium uppercase tracking-wide ${accentClass}`}>{title}</p>
      {subtitle ? (
        <p className="mt-0.5 text-[10px] text-zinc-500">{subtitle}</p>
      ) : null}
      <div className="min-h-0 flex-1 pt-2">
        <Bar data={data} options={baseOptions} />
      </div>
    </div>
  );
}

export function DashboardWeeklyBarsPair(props: {
  visits: WeeklyBarBlockProps;
  subscribers: WeeklyBarBlockProps | null;
  subSyntheticNote?: string;
}) {
  const { visits, subscribers, subSyntheticNote } = props;
  return (
    <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
      <WeeklyBlock {...visits} accentClass="text-zinc-300" />
      {subscribers ? (
        <div className="flex flex-col">
          <WeeklyBlock {...subscribers} accentClass="text-cyan-400/95" />
          {subSyntheticNote ? (
            <p className="mt-1 px-1 text-[10px] text-zinc-500">{subSyntheticNote}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-950/30 px-4 text-center text-sm text-zinc-500 sm:min-h-[240px]">
          Suscriptores: sin serie histórica (activa{" "}
          <code className="mx-1 rounded bg-zinc-800 px-1 font-mono text-xs">subscriber_portfolio_daily</code>{" "}
          en Neon).
        </div>
      )}
    </div>
  );
}
