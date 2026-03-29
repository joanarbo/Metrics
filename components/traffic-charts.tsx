"use client";

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

export type TrafficChartRow = {
  property: string;
  propertyDisplayName: string;
  accountDisplayName: string;
  sessions: number;
  totalUsers: number;
  screenPageViews: number;
  error?: string;
};

const CHART_TEXT = "#a1a1aa";
const GRID = "#27272a";
const TICK = "#71717a";

const BAR_PURPLE = "rgba(139, 92, 246, 0.75)";
const BAR_TEAL = "rgba(45, 212, 191, 0.7)";
const BAR_AMBER = "rgba(251, 191, 36, 0.65)";

const DOUGHNUT_COLORS = [
  "rgba(139, 92, 246, 0.85)",
  "rgba(45, 212, 191, 0.85)",
  "rgba(251, 191, 36, 0.85)",
  "rgba(244, 114, 182, 0.85)",
  "rgba(56, 189, 248, 0.85)",
  "rgba(167, 139, 250, 0.85)",
  "rgba(52, 211, 153, 0.85)",
  "rgba(251, 146, 60, 0.85)",
];

function shortLabel(s: string, max = 26): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const baseOptions: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: CHART_TEXT },
    },
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
      ticks: { color: TICK, maxRotation: 45, minRotation: 0 },
      grid: { color: GRID },
    },
    y: {
      ticks: { color: TICK },
      grid: { color: GRID },
    },
  },
};

const horizontalOptions: ChartOptions<"bar"> = {
  ...baseOptions,
  indexAxis: "y" as const,
  scales: {
    x: {
      ticks: { color: TICK },
      grid: { color: GRID },
    },
    y: {
      ticks: { color: TICK },
      grid: { display: false },
    },
  },
};

type Props = {
  rows: TrafficChartRow[];
  locations?: Array<{ country: string; sessions: number }>;
  days: number;
  /** Alturas menores para embebido en home */
  compact?: boolean;
};

export function TrafficCharts({ rows, locations, days, compact }: Props) {
  const ok = rows.filter((r) => !r.error);
  const labels = ok.map((r) => shortLabel(r.propertyDisplayName));

  const groupedData = {
    labels,
    datasets: [
      {
        label: "Sesiones",
        data: ok.map((r) => r.sessions),
        backgroundColor: BAR_PURPLE,
        borderRadius: 4,
      },
      {
        label: "Usuarios",
        data: ok.map((r) => r.totalUsers),
        backgroundColor: BAR_TEAL,
        borderRadius: 4,
      },
      {
        label: "Vistas",
        data: ok.map((r) => r.screenPageViews),
        backgroundColor: BAR_AMBER,
        borderRadius: 4,
      },
    ],
  };

  const sessionTotal = ok.reduce((s, r) => s + r.sessions, 0) || 1;
  const doughnutData = {
    labels: ok.map((r) => shortLabel(r.propertyDisplayName, 20)),
    datasets: [
      {
        data: ok.map((r) => r.sessions),
        backgroundColor: ok.map((_, i) => DOUGHNUT_COLORS[i % DOUGHNUT_COLORS.length]),
        borderColor: "#18181b",
        borderWidth: 2,
      },
    ],
  };

  const doughnutOptions: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right",
        labels: { color: CHART_TEXT, boxWidth: 12 },
      },
      tooltip: {
        backgroundColor: "rgba(24, 24, 27, 0.95)",
        titleColor: "#f4f4f5",
        bodyColor: "#d4d4d8",
        borderColor: GRID,
        borderWidth: 1,
        callbacks: {
          label(ctx) {
            const v = ctx.raw as number;
            const pct = ((v / sessionTotal) * 100).toFixed(1);
            return ` ${ctx.label}: ${v.toLocaleString("es-ES")} sesiones (${pct}%)`;
          },
        },
      },
      title: {
        display: true,
        text: `Reparto de sesiones · últimos ${days} días`,
        color: CHART_TEXT,
        font: { size: compact ? 11 : 13 },
      },
    },
  };

  const loc = locations?.length
    ? {
        labels: locations.map((l) => l.country),
        datasets: [
          {
            label: "Sesiones",
            data: locations.map((l) => l.sessions),
            backgroundColor: "rgba(56, 189, 248, 0.65)",
            borderRadius: 4,
          },
        ],
      }
    : null;

  const hBar = compact ? "h-56 sm:h-64" : "h-80";
  const hCountry = compact ? "h-64 max-w-2xl" : "h-[min(28rem,70vh)] max-w-3xl";

  return (
    <div className={compact ? "space-y-6" : "space-y-10"}>
      <div className={`grid gap-8 ${compact ? "lg:grid-cols-2" : "lg:grid-cols-2"}`}>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <h2 className="mb-2 text-sm font-medium text-zinc-300">
            Métricas por propiedad (agrupadas)
          </h2>
          <p className="mb-4 text-xs text-zinc-500">Sesiones, usuarios y vistas en el mismo rango temporal.</p>
          <div className={hBar}>
            <Bar
              data={groupedData}
              options={{
                ...baseOptions,
                plugins: {
                  ...baseOptions.plugins,
                  title: {
                    display: false,
                  },
                },
              }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <h2 className="mb-2 text-sm font-medium text-zinc-300">Sesiones por site</h2>
          <p className="mb-4 text-xs text-zinc-500">Proporción respecto al total de sesiones del periodo.</p>
          <div className={hBar}>
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
        </div>
      </div>

      {loc ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <h2 className="mb-2 text-sm font-medium text-zinc-300">Países (agregado entre propiedades)</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Suma de sesiones por país en todas las propiedades consultadas. Requiere dimensiones de
            geografía en GA4.
          </p>
          <div className={hCountry}>
            <Bar data={loc} options={horizontalOptions} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
