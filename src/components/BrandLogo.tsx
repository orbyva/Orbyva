import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

type BrandLogoProps = {
  /** `full` = lockup completo; `mark` = ícone órbita; `favicon` = desenho transparente do favicon (WebP 128px) */
  variant?: "full" | "mark" | "favicon";
  className?: string;
  alt?: string;
};

const SOURCES = {
  full: BRAND.logo,
  mark: BRAND.logoMark,
  favicon: BRAND.faviconSmall,
} as const;

export function BrandLogo({
  variant = "full",
  className,
  alt = BRAND.name,
}: BrandLogoProps) {
  const square = variant !== "full";
  return (
    <img
      src={SOURCES[variant]}
      alt={alt}
      width={square ? 40 : 160}
      height={40}
      decoding="async"
      fetchPriority="low"
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}
