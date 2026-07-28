import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  heatmapRateLabel,
  monthHeatmapHeaders,
  monthLabel,
} from "@/domain/habits/heatmap";
import type { HabitHeatCell, MonthHeatmap } from "@/types/habits";
import { cn } from "@/lib/utils";

type HabitMonthHeatmapProps = {
  map: MonthHeatmap;
  onPrev?: () => void;
  onNext?: () => void;
  /** Impede avançar além do mês atual. */
  canGoNext?: boolean;
  title?: string;
  avoid?: boolean;
  compact?: boolean;
  showNav?: boolean;
  className?: string;
};

function cellTitle(cell: HabitHeatCell): string {
  const base = cell.date;
  if (cell.total <= 0) return base;
  if (cell.status === "future") return `${base} · futuro`;
  if (cell.status === "missed") return `${base} · não concluído`;
  if (cell.status === "empty") return `${base} · sem registro`;
  if (cell.status === "partial") {
    return `${base} · ${cell.done}/${cell.total}`;
  }
  if (cell.status === "done") {
    return cell.total > 1
      ? `${base} · ${cell.done}/${cell.total}`
      : `${base} · concluído`;
  }
  // today
  return cell.done > 0
    ? `${base} · hoje · ${cell.done}/${cell.total}`
    : `${base} · hoje`;
}

function cellStatusWord(cell: HabitHeatCell): string {
  switch (cell.status) {
    case "future":
      return "futuro";
    case "missed":
      return "falhou";
    case "empty":
      return "sem registro";
    case "partial":
      return `parcial ${cell.done} de ${cell.total}`;
    case "done":
      return cell.total > 1 ? `feito ${cell.done} de ${cell.total}` : "feito";
    case "today":
      return cell.rate >= 1
        ? "hoje, concluído"
        : cell.done > 0
          ? `hoje, parcial ${cell.done} de ${cell.total}`
          : "hoje, pendente";
    default:
      return "";
  }
}

function cellClass(
  cell: HabitHeatCell,
  avoid: boolean,
  compact: boolean
): string {
  const size = compact ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-4 w-4 sm:h-5 sm:w-5";
  const base = cn(
    size,
    "rounded-[3px] border transition-colors",
    cell.status === "today" && "ring-1 ring-primary/60 ring-offset-1 ring-offset-background"
  );

  if (cell.status === "future") {
    return cn(base, "border-transparent bg-muted/40");
  }
  if (cell.status === "empty") {
    return cn(base, "border-muted-foreground/15 bg-muted/30");
  }
  if (cell.status === "missed") {
    return cn(
      base,
      "border-destructive/35 bg-destructive/15",
      // Traço visual além da cor (daltonismo / alto contraste).
      "bg-[repeating-linear-gradient(-45deg,transparent,transparent_1.5px,hsl(var(--destructive)/0.35)_1.5px,hsl(var(--destructive)/0.35)_3px)]",
      "dark:bg-destructive/25 dark:bg-[repeating-linear-gradient(-45deg,transparent,transparent_1.5px,hsl(var(--destructive)/0.45)_1.5px,hsl(var(--destructive)/0.45)_3px)]"
    );
  }
  if (cell.status === "partial") {
    const opacity =
      cell.rate < 0.34 ? "bg-success/25" : cell.rate < 0.67 ? "bg-success/45" : "bg-success/65";
    return cn(base, "border-success/30", opacity);
  }
  if (cell.status === "done" || (cell.status === "today" && cell.rate >= 1)) {
    return cn(
      base,
      avoid
        ? "border-teal-500/40 bg-teal-500/70"
        : "border-success/40 bg-success"
    );
  }
  // today incomplete
  if (cell.status === "today" && cell.rate > 0) {
    return cn(
      base,
      avoid
        ? "border-teal-500/30 bg-teal-500/35"
        : "border-success/30 bg-success/40"
    );
  }
  return cn(base, "border-muted-foreground/25 bg-background");
}

export function HabitMonthHeatmap({
  map,
  onPrev,
  onNext,
  canGoNext = true,
  title,
  avoid = false,
  compact = false,
  showNav = true,
  className,
}: HabitMonthHeatmapProps) {
  const headers = monthHeatmapHeaders();

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {title ? (
            <p className="text-xs font-semibold tracking-tight">{title}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {showNav ? (
              <>
                {monthLabel(map.year, map.month)}
                {" · "}
              </>
            ) : null}
            {heatmapRateLabel(map)}
          </p>
        </div>
        {showNav ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onPrev}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onNext}
              disabled={!canGoNext}
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <div
        className="grid grid-cols-7 gap-1"
        role="grid"
        aria-label={`Calendário ${monthLabel(map.year, map.month)}`}
      >
        {headers.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="text-center text-[9px] font-medium text-muted-foreground"
            aria-hidden
          >
            {label}
          </span>
        ))}
        {map.cells.map((cell, i) => {
          if (!cell) {
            return <span key={`pad-${i}`} className="block" aria-hidden />;
          }
          const label = `${cell.dayOfMonth}, ${cellStatusWord(cell)}`;
          return (
            <span
              key={cell.date}
              role="gridcell"
              title={cellTitle(cell)}
              aria-label={label}
              className={cn("mx-auto block", cellClass(cell, avoid, compact))}
            />
          );
        })}
      </div>

      {!compact ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-success" aria-hidden />
              Feito
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-[2px] bg-success/45"
                aria-hidden
              />
              Parcial
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-[2px] border border-destructive/35 bg-[repeating-linear-gradient(-45deg,transparent,transparent_1.5px,hsl(var(--destructive)/0.35)_1.5px,hsl(var(--destructive)/0.35)_3px)] bg-destructive/15"
                aria-hidden
              />
              Falhou
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-muted/40" aria-hidden />
              Futuro
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Diário: vazio no passado = falhou · Semanal: vazio fica neutro
          </p>
        </div>
      ) : null}
    </div>
  );
}
