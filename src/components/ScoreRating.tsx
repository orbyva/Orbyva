import { cn } from "@/lib/utils";
import { formatMovieRating } from "@/domain/movies";

interface ScoreRatingProps {
  value: number | null;
  onChange?: (value: number | null) => void;
  readonly?: boolean;
  /** Máximo da escala (padrão 10). */
  max?: number;
  size?: "sm" | "md";
}

/**
 * Nota em escala 0–10 com meias notas (clique esquerdo = .5, direito = inteiro).
 * Espelha o padrão visual do StarRating dos lugares, mas na escala de cinema.
 */
export function ScoreRating({
  value,
  onChange,
  readonly = false,
  max = 10,
  size = "md",
}: ScoreRatingProps) {
  const scores = Array.from({ length: max }, (_, i) => i + 1);
  const current = value ?? 0;

  function handleClick(score: number, clientX: number, width: number) {
    if (readonly || !onChange) return;
    const isLeftHalf = clientX < width / 2;
    const next = isLeftHalf ? score - 0.5 : score;
    // Toggle off if clicking the same value again
    onChange(value === next ? null : next);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {scores.map((score) => {
        const fill =
          current >= score ? "full" : current >= score - 0.5 ? "half" : "empty";
        const box =
          size === "sm"
            ? "h-7 w-7 text-[11px]"
            : "h-9 w-9 text-xs sm:h-10 sm:w-10 sm:text-sm";

        const content = (
          <span
            className={cn(
              "relative inline-flex items-center justify-center rounded-md border font-semibold transition-colors",
              box,
              fill === "full" &&
                "border-warning bg-warning/20 text-warning-foreground",
              fill === "half" &&
                "border-warning/70 bg-warning/10 text-foreground",
              fill === "empty" &&
                "border-border bg-muted/40 text-muted-foreground"
            )}
          >
            {fill === "half" && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1/2 rounded-l-md bg-warning/25"
              />
            )}
            <span className="relative z-10">{score}</span>
          </span>
        );

        if (readonly || !onChange) {
          return (
            <span key={score} className="inline-flex">
              {content}
            </span>
          );
        }

        return (
          <button
            key={score}
            type="button"
            aria-label={`${score} de ${max}`}
            className="inline-flex transition-transform hover:scale-105"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              handleClick(score, e.clientX - rect.left, rect.width);
            }}
          >
            {content}
          </button>
        );
      })}
      {value != null && value > 0 && (
        <span className="ml-1 text-sm text-muted-foreground">
          {formatMovieRating(value)}/10
        </span>
      )}
    </div>
  );
}
