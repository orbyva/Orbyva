import { cn } from "@/lib/utils";
import type { WeekStripDay } from "@/types/habits";

type HabitWeekStripProps = {
  days: WeekStripDay[];
  avoid?: boolean;
  onToggleDay?: (date: string, nextCompleted: boolean) => void;
  disabled?: boolean;
};

export function HabitWeekStrip({
  days,
  avoid = false,
  onToggleDay,
  disabled = false,
}: HabitWeekStripProps) {
  return (
    <div className="mt-2 flex items-center gap-1.5" role="list" aria-label="Semana Seg–Dom">
      {days.map((day) => {
        const interactive = Boolean(onToggleDay) && !disabled;
        const className = cn(
          "flex h-7 w-7 flex-col items-center justify-center rounded-md border text-[10px] font-medium transition-colors",
          day.completed
            ? avoid
              ? "border-teal-500/40 bg-teal-500/15 text-teal-800 dark:text-teal-200"
              : "border-success/40 bg-success/15 text-success"
            : "border-muted-foreground/20 text-muted-foreground",
          day.isToday && !day.completed && "ring-1 ring-primary/50",
          interactive && "cursor-pointer hover:border-primary/50"
        );

        if (!interactive) {
          return (
            <span key={day.date} role="listitem" className={className} title={day.date}>
              <span className="leading-none">{day.label}</span>
            </span>
          );
        }

        return (
          <button
            key={day.date}
            type="button"
            role="listitem"
            title={day.date}
            className={className}
            onClick={() => onToggleDay?.(day.date, !day.completed)}
          >
            <span className="leading-none">{day.label}</span>
          </button>
        );
      })}
    </div>
  );
}
