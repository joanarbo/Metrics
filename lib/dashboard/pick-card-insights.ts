import { isGrowthRelatedInsightText } from "@/lib/dashboard/growth-insights-filter";
import { matchInsightLineToPropertyId } from "@/lib/dashboard/match-insight-property";
import type { InsightAlertItem } from "@/lib/together/summarize-traffic";

type TrafficLike = { property: string; propertyDisplayName: string };

/**
 * Texto tras el primer "NombrePropiedad:" (y limpieza básica de markdown).
 */
export function formatInsightLineForDisplay(line: string): string {
  const i = line.indexOf(":");
  const body = i >= 0 ? line.slice(i + 1).trim() : line.trim();
  return body.replace(/\*\*([^*]+)\*\*/g, "$1");
}

/**
 * Alerta y acción de IA asociadas a una propiedad GA4 (por prefijo "Nombre:" en el texto).
 */
export function pickCardInsights(
  propertyId: string,
  rows: TrafficLike[],
  alerts: InsightAlertItem[],
  actions: string[],
): { alert: InsightAlertItem | null; action: string | null } {
  const alertMatches = alerts.filter(
    (a) => matchInsightLineToPropertyId(a.text, rows) === propertyId,
  );
  const alert =
    alertMatches.find((a) => isGrowthRelatedInsightText(a.text)) ?? alertMatches[0] ?? null;
  const actionMatches = actions.filter(
    (line) => matchInsightLineToPropertyId(line, rows) === propertyId,
  );
  const action =
    actionMatches.find((l) => isGrowthRelatedInsightText(l)) ?? actionMatches[0] ?? null;
  return { alert, action };
}
