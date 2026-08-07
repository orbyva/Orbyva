import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

type QuickAddToggleIconProps = {
  open: boolean;
  className?: string;
  /** Tamanho do ícone Lucide (ex.: h-6 w-6). */
  iconClassName?: string;
};

/** + ↔ X com rotação/fade curtos. */
export function QuickAddToggleIcon({
  open,
  className,
  iconClassName = "h-5 w-5",
}: QuickAddToggleIconProps) {
  return (
    <span
      className={cn("relative inline-flex size-[1.25em] items-center justify-center", className)}
      aria-hidden
    >
      <Plus
        className={cn(
          iconClassName,
          "absolute transition-[opacity,transform] duration-200 ease-out",
          open
            ? "rotate-90 scale-75 opacity-0"
            : "rotate-0 scale-100 opacity-100"
        )}
      />
      <X
        className={cn(
          iconClassName,
          "absolute transition-[opacity,transform] duration-200 ease-out",
          open
            ? "rotate-0 scale-100 opacity-100"
            : "-rotate-90 scale-75 opacity-0"
        )}
      />
    </span>
  );
}
