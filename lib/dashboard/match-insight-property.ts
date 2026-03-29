/** Empareja la primera parte "Nombre:" de una línea de IA con una fila de tráfico. */
export function matchInsightLineToPropertyId(
  line: string,
  rows: Array<{ property: string; propertyDisplayName: string }>,
): string | null {
  const head = line.split(":")[0]?.trim() ?? "";
  if (!head) return null;
  const h = head.toLowerCase();
  for (const r of rows) {
    const n = r.propertyDisplayName.toLowerCase();
    if (n === h || n.includes(h) || h.includes(n)) {
      return r.property;
    }
  }
  return null;
}
