/** IDs de User-ID de GA4 a excluir de informes (CSV en env, solo servidor). */
export function parseGa4ExcludedUserIds(): string[] {
  const raw = process.env.GA4_EXCLUDED_USER_IDS?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
