import { insightLineBrand } from "@/lib/dashboard/insight-line-brand";
import type { InsightAlertItem } from "@/lib/together/summarize-traffic";

type TrafficLike = { property: string; propertyDisplayName: string };

export function isGrowthRelatedInsightText(line: string): boolean {
  return /\d\s*%|[±+\-]\s*\d|creci|ca[ií]da|subi[oó]|baj[aó]|visitas?|usuarios|suscriptor|inscrit|tr[aá]fico|semanal/i.test(
    line,
  );
}

export type InsightMetricBadge = "VISITAS" | "SUSCRITOS";

export function insightMetricBadgeForLine(line: string): InsightMetricBadge | null {
  if (/suscriptor|lista|lead|newsletter|apuntad|registro|inscrit|cta|formulario/i.test(line)) {
    return "SUSCRITOS";
  }
  if (/visita|sesi[oó]n|tr[aá]fico|usuarios|p[aá]gina|org[aá]nico/i.test(line)) {
    return "VISITAS";
  }
  return null;
}

export function filterTvAlerts(items: InsightAlertItem[], max = 3): InsightAlertItem[] {
  const growth = items.filter((x) => isGrowthRelatedInsightText(x.text));
  return growth.slice(0, max);
}

/**
 * Una acción por marca (proyecto lógico), priorizando líneas con métrica explícita.
 */
export function filterTvActions(
  lines: string[],
  rows: TrafficLike[],
  maxLines = 6,
): string[] {
  const growth = lines.filter(isGrowthRelatedInsightText);
  const withMetric = growth.filter((l) => insightMetricBadgeForLine(l) !== null);
  const pool = withMetric.length > 0 ? [...withMetric, ...growth.filter((l) => !withMetric.includes(l))] : growth;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of pool) {
    const b = insightLineBrand(line, rows);
    if (seen.has(b)) continue;
    seen.add(b);
    out.push(line);
    if (out.length >= maxLines) break;
  }
  return out;
}
