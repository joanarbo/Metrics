import { BrandMarkIcon } from "@/components/brand-mark-icon";
import { inferBrandFromPropertyName } from "@/lib/ga/infer-brand";

export function PropertyNameWithBrandIcon({
  displayName,
  iconClassName,
}: {
  displayName: string;
  /** Tamaño/color del SVG (p. ej. en tarjeta Líder sobre fondo esmeralda). */
  iconClassName?: string;
}) {
  const brand = inferBrandFromPropertyName(displayName);
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5" title={brand}>
      <BrandMarkIcon brand={brand} className={iconClassName} />
      <span className="min-w-0 truncate">{displayName}</span>
    </span>
  );
}
