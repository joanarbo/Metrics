/**
 * SELECT por defecto por marca cuando `countSql` se omite en NEON_SUBSCRIBER_SOURCES
 * o en variables NEON_PROJECT_ID_* (ver `parseNeonSubscriberSources`).
 * Las claves deben coincidir con `inferBrandFromPropertyName` (lib/ga/infer-brand.ts).
 */
export const DEFAULT_SUBSCRIBER_COUNT_SQL_BY_BRAND = {
  Bodados: "SELECT count(*)::int AS c FROM public.subscribers",
  InstitutoAgentico:
    "SELECT count(*)::int AS c FROM public.form_submissions",
  Lopeix: "SELECT count(*)::int AS c FROM public.guide_subscribers",
  PolyNews: "SELECT count(*)::int AS c FROM public.subscribers",
} as const;

export type SubscriberBrandWithDefaultSql =
  keyof typeof DEFAULT_SUBSCRIBER_COUNT_SQL_BY_BRAND;
