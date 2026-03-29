/** Nombre corto para tarjetas TV (top crecimiento, etc.). */
export function brandShortLabelForTv(brand: string): string {
  switch (brand) {
    case "InstitutoAgentico":
      return "Instituto";
    case "LorsClub":
      return "Lors";
    case "PolyNews":
      return "PolyNews";
    case "Bodados":
      return "Bodados";
    case "Lopeix":
      return "Lopeix";
    default:
      return brand.length > 14 ? `${brand.slice(0, 13)}…` : brand;
  }
}
