import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

type BrandLogoProps = {
  /** `full` = lockup completo; `mark` = ícone órbita */
  variant?: "full" | "mark";
  className?: string;
  alt?: string;
};

export function BrandLogo({
  variant = "full",
  className,
  alt = BRAND.name,
}: BrandLogoProps) {
  const src = variant === "mark" ? BRAND.logoMark : BRAND.logo;
  return (
    <img
      src={src}
      alt={alt}
      width={variant === "mark" ? 40 : 160}
      height={variant === "mark" ? 40 : 40}
      decoding="async"
      fetchPriority="low"
      className={cn(
        variant === "mark" ? "object-contain" : "object-contain",
        className
      )}
      draggable={false}
    />
  );
}
