const BRAND_RULES: Array<{ label: string; test: (s: string) => boolean }> = [
  { label: "Bodados", test: (s) => /bodados/i.test(s) },
  { label: "InstitutoAgentico", test: (s) => /instituto\s*agentico|agentico/i.test(s) },
  { label: "LorsClub", test: (s) => /lors\s*club|lorsclub/i.test(s) },
  { label: "Lopeix", test: (s) => /lopeix/i.test(s) },
  { label: "PolyNews", test: (s) => /polynews|poly\s*news/i.test(s) },
];

/** Agrupa por marca conocida; el resto va a "Otros". */
export function inferBrandFromPropertyName(displayName: string): string {
  const s = displayName.trim();
  for (const b of BRAND_RULES) {
    if (b.test(s)) return b.label;
  }
  return "Otros";
}
