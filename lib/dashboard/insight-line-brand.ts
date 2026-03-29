import { matchInsightLineToPropertyId } from "@/lib/dashboard/match-insight-property";
import { inferBrandFromPropertyName } from "@/lib/ga/infer-brand";

type TrafficLike = { property: string; propertyDisplayName: string };

/**
 * Marca de una línea de alerta/acción según la propiedad emparejada; si no hay match, "Otros".
 */
export function insightLineBrand(line: string, rows: TrafficLike[]): string {
  const pid = matchInsightLineToPropertyId(line, rows);
  if (!pid) return "Otros";
  const row = rows.find((r) => r.property === pid);
  if (!row) return "Otros";
  return inferBrandFromPropertyName(row.propertyDisplayName);
}
