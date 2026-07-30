import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

type BrandWordmarkProps = {
  className?: string;
  /** Linha sob o nome (padrão: wedge curto, não o slogan longo). */
  showSubtitle?: boolean;
  /** `sm` = sidebar; `md` = headers; `lg` = landing hero. */
  size?: "sm" | "md" | "lg";
};

/**
 * Wordmark tipográfico no estilo da logo:
 * O/A em sky, miolo claro/escuro conforme contraste; A aberta (Ʌ).
 */
export function BrandWordmark({
  className,
  showSubtitle = true,
  size = "sm",
}: BrandWordmarkProps) {
  const nameClass =
    size === "lg"
      ? "text-3xl font-bold tracking-[0.14em] sm:text-4xl"
      : size === "md"
        ? "text-lg font-semibold tracking-[0.12em]"
        : "text-sm font-semibold tracking-[0.1em]";
  const subtitleClass =
    size === "lg"
      ? "mt-1.5 text-sm tracking-wide text-zinc-500"
      : size === "md"
        ? "mt-0.5 text-xs tracking-wide"
        : "mt-0.5 text-[10px] leading-snug tracking-wide";

  return (
    <div className={cn("min-w-0 text-left leading-tight", className)}>
      <p
        className={cn("truncate uppercase", nameClass)}
        aria-label={BRAND.name}
      >
        <span className="text-sky-400">O</span>
        <span className={size === "lg" ? "text-zinc-100" : undefined}>RBYV</span>
        <span className="text-sky-400">Ʌ</span>
      </p>
      {showSubtitle ? (
        <p
          className={cn(
            "truncate",
            size === "lg"
              ? subtitleClass
              : cn("text-muted-foreground", subtitleClass)
          )}
        >
          {BRAND.wedge}
        </p>
      ) : null}
    </div>
  );
}
