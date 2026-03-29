/** Orden fijo en UI (selector, inventario, foco mental). */
export const DASHBOARD_BRAND_ORDER = [
  "InstitutoAgentico",
  "LorsClub",
  "Bodados",
  "Lopeix",
  "PolyNews",
  "Otros",
] as const;

export type DashboardBrand = (typeof DASHBOARD_BRAND_ORDER)[number];

export type BrandVisuals = {
  pill: string;
  rowIdle: string;
  rowSelected: string;
  cardShell: string;
  cardRing: string;
};

const THEME: Record<DashboardBrand, BrandVisuals> = {
  InstitutoAgentico: {
    pill: "border border-emerald-600/45 bg-emerald-950/90 text-emerald-100",
    rowIdle: "bg-emerald-950/30 border-l-[3px] border-l-emerald-500/85",
    rowSelected: "ring-2 ring-emerald-400/45 ring-offset-1 ring-offset-[#07090c]",
    cardShell: "border-emerald-800/55 bg-emerald-950/25",
    cardRing: "ring-emerald-800/30",
  },
  LorsClub: {
    pill: "border border-sky-500/45 bg-sky-950/90 text-sky-100",
    rowIdle: "bg-sky-950/30 border-l-[3px] border-l-sky-500/85",
    rowSelected: "ring-2 ring-sky-400/45 ring-offset-1 ring-offset-[#07090c]",
    cardShell: "border-sky-800/55 bg-sky-950/25",
    cardRing: "ring-sky-800/30",
  },
  Bodados: {
    pill: "border border-rose-500/45 bg-rose-950/90 text-rose-100",
    rowIdle: "bg-rose-950/30 border-l-[3px] border-l-rose-500/85",
    rowSelected: "ring-2 ring-rose-400/45 ring-offset-1 ring-offset-[#07090c]",
    cardShell: "border-rose-800/55 bg-rose-950/25",
    cardRing: "ring-rose-800/30",
  },
  Lopeix: {
    pill: "border border-teal-500/45 bg-teal-950/90 text-teal-100",
    rowIdle: "bg-teal-950/30 border-l-[3px] border-l-teal-500/85",
    rowSelected: "ring-2 ring-teal-400/45 ring-offset-1 ring-offset-[#07090c]",
    cardShell: "border-teal-800/55 bg-teal-950/25",
    cardRing: "ring-teal-800/30",
  },
  PolyNews: {
    pill: "border border-violet-500/45 bg-violet-950/90 text-violet-100",
    rowIdle: "bg-violet-950/30 border-l-[3px] border-l-violet-500/85",
    rowSelected: "ring-2 ring-violet-400/45 ring-offset-1 ring-offset-[#07090c]",
    cardShell: "border-violet-800/55 bg-violet-950/25",
    cardRing: "ring-violet-800/30",
  },
  Otros: {
    pill: "border border-zinc-500/40 bg-zinc-900/90 text-zinc-200",
    rowIdle: "bg-zinc-900/45 border-l-[3px] border-l-zinc-500/75",
    rowSelected: "ring-2 ring-zinc-400/35 ring-offset-1 ring-offset-[#07090c]",
    cardShell: "border-zinc-700/55 bg-zinc-900/35",
    cardRing: "ring-zinc-700/30",
  },
};

export function getBrandVisuals(brand: string): BrandVisuals {
  if (brand in THEME) {
    return THEME[brand as DashboardBrand];
  }
  return THEME.Otros;
}

export function dashboardBrandSortIndex(brand: string): number {
  const i = DASHBOARD_BRAND_ORDER.indexOf(brand as DashboardBrand);
  return i === -1 ? 99 : i;
}
