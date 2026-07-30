import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EntertainmentInsightStat = {
  label: string;
  value: string | number;
};

type EntertainmentInsightsStripProps = {
  stats: EntertainmentInsightStat[];
  onSurprise?: () => void;
  surpriseLabel?: string;
  className?: string;
};

/** Faixa leve de KPIs + ação opcional (ex.: Surpreenda-me). */
export function EntertainmentInsightsStrip({
  stats,
  onSurprise,
  surpriseLabel = "Surpreenda-me",
  className,
}: EntertainmentInsightsStripProps) {
  if (!stats.length && !onSurprise) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <ul className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        {stats.map((stat) => (
          <li key={stat.label} className="text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">
              {stat.value}
            </span>{" "}
            {stat.label}
          </li>
        ))}
      </ul>
      {onSurprise ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full shrink-0 sm:w-auto"
          onClick={onSurprise}
        >
          <Shuffle className="mr-1.5 h-3.5 w-3.5" />
          {surpriseLabel}
        </Button>
      ) : null}
    </div>
  );
}
