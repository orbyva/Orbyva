import type { MouseEvent } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: "sm" | "md";
  readonly?: boolean;
  allowHalf?: boolean;
}

function getStarFill(value: number, star: number): "empty" | "half" | "full" {
  if (value >= star) return "full";
  if (value >= star - 0.5) return "half";
  return "empty";
}

function StarIcon({
  fill,
  size,
}: {
  fill: "empty" | "half" | "full";
  size: "sm" | "md";
}) {
  const box = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  const stroke = size === "sm" ? 1.75 : 2;

  if (fill === "full") {
    return (
      <Star
        className={cn(box, "fill-warning text-warning")}
        strokeWidth={stroke}
      />
    );
  }

  return (
    <span className={cn("relative inline-flex shrink-0", box)}>
      {/* Contorno completo — metade direita fica vazia */}
      <Star
        className={cn(
          box,
          "fill-transparent text-muted-foreground/35"
        )}
        strokeWidth={stroke}
      />
      {fill === "half" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 overflow-hidden"
        >
          {/* Mesma estrela inteira, recortada na metade esquerda */}
          <Star
            className={cn(box, "fill-warning text-warning")}
            strokeWidth={stroke}
          />
        </span>
      )}
    </span>
  );
}

export function StarRating({
  value,
  onChange,
  size = "md",
  readonly = false,
  allowHalf = true,
}: StarRatingProps) {
  function handleStarClick(star: number, event: MouseEvent<HTMLButtonElement>) {
    if (readonly || !onChange) return;

    if (!allowHalf) {
      onChange(star);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const isLeftHalf = event.clientX - rect.left < rect.width / 2;
    onChange(isLeftHalf ? star - 0.5 : star);
  }

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = getStarFill(value, star);

        if (readonly || !onChange) {
          return (
            <span key={star} className="inline-flex">
              <StarIcon fill={fill} size={size} />
            </span>
          );
        }

        return (
          <button
            key={star}
            type="button"
            onClick={(e) => handleStarClick(star, e)}
            className="inline-flex transition-transform hover:scale-110"
            aria-label={`${star} estrelas`}
          >
            <StarIcon fill={fill} size={size} />
          </button>
        );
      })}
    </div>
  );
}
