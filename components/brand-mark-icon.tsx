import type { LucideIcon } from "lucide-react";
import { Fish, Gem, Newspaper, PenLine, Waves } from "lucide-react";

const BY_BRAND: Partial<Record<string, LucideIcon>> = {
  Bodados: Gem,
  InstitutoAgentico: PenLine,
  LorsClub: Waves,
  Lopeix: Fish,
  PolyNews: Newspaper,
};

const defaultIconClass = "h-4 w-4 shrink-0 text-zinc-400";

export function BrandMarkIcon({
  brand,
  className,
  "aria-hidden": ariaHidden = true,
}: {
  brand: string;
  className?: string;
  "aria-hidden"?: boolean;
}) {
  const Icon = BY_BRAND[brand];
  if (!Icon) return null;
  return (
    <Icon
      className={className ?? defaultIconClass}
      aria-hidden={ariaHidden}
      strokeWidth={2}
    />
  );
}
