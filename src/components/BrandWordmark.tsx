import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

type BrandWordmarkProps = {
  className?: string;
  /** Linha sob o nome (padrão: wedge curto, não o slogan longo). */
  showSubtitle?: boolean;
  /** `sm` = sidebar; `md` = headers. */
  size?: "sm" | "md";
};

/**
 * Wordmark tipográfico no estilo da logo:
 * O/A em sky, miolo escuro; A aberta (sem trave).
 */
export function BrandWordmark({
  className,
  showSubtitle = true,
  size = "sm",
}: BrandWordmarkProps) {
  const nameClass =
    size === "md"
      ? "text-lg font-semibold tracking-[0.12em]"
      : "text-sm font-semibold tracking-[0.1em]";
  const subtitleClass =
    size === "md"
      ? "mt-0.5 text-xs tracking-wide"
      : "mt-0.5 text-[10px] leading-snug tracking-wide";

  return (
    <div className={cn("min-w-0 text-left leading-tight", className)}>
      <p className={cn("truncate uppercase", nameClass)} aria-label={BRAND.name}>
        <span className="text-sky-500">O</span>
        <span>RBYV</span>
        <span className="text-sky-500">Ʌ</span>
      </p>
      {showSubtitle ? (
        <p className={cn("truncate text-muted-foreground", subtitleClass)}>
          {BRAND.wedge}
        </p>
      ) : null}
    </div>
  );
}
