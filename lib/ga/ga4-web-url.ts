/** Enlace a la vista principal de informes GA4 para una propiedad `properties/123`. */
export function ga4PropertyReportsUrl(propertyResource: string): string {
  const id = propertyResource.replace(/^properties\//, "").trim();
  if (!/^\d+$/.test(id)) {
    return "https://analytics.google.com/analytics/web/";
  }
  return `https://analytics.google.com/analytics/web/#/p${id}/reports/intelligenthome`;
}
