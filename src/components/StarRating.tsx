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
  size: string;
}) {
  if (fill === "full") {
    return <Star className={cn(size, "fill-warning text-warning")} />;
  }

  if (fill === "half") {
    return (
      <span className="relative inline-flex">
        <Star className={cn(size, "text-muted-foreground/30")} />
        <span className="absolute inset-0 w-1/2 overflow-hidden">
          <Star className={cn(size, "fill-warning text-warning")} />
        </span>
      </span>
    );
  }

  return <Star className={cn(size, "text-muted-foreground/30")} />;
}

export function StarRating({
  value,
  onChange,
  size = "md",
  readonly = false,
  allowHalf = true,
}: StarRatingProps) {
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

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
              <StarIcon fill={fill} size={iconSize} />
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
            <StarIcon fill={fill} size={iconSize} />
          </button>
        );
      })}
    </div>
  );
}
