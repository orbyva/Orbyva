import { Link } from "react-router-dom";
import type { TimelineItem, TimelineModule } from "@/types/timeline";
import { MODULE_LABELS } from "@/api/timeline";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const moduleStyles: Record<TimelineModule, string> = {
  finance: "border-primary/30 text-primary bg-primary/5",
  car: "border-car/30 text-car bg-car/5",
  travel: "border-travel/30 text-travel bg-travel/5",
  goals: "border-success/30 text-success bg-success/5",
  habits: "border-life/30 text-life bg-life/5",
  places: "border-life/30 text-life bg-life/10",
  cinema: "border-cinema/30 text-cinema bg-cinema/5",
};

const statusStyles: Record<string, string> = {
  overdue: "border-destructive/40",
  today: "border-warning/40",
  upcoming: "",
};

interface TimelineListProps {
  items: TimelineItem[];
  compact?: boolean;
}

export function TimelineList({ items, compact = false }: TimelineListProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Nenhum evento no período.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-2", compact && "space-y-1.5")}>
      {items.map((item) => {
        const content = (
          <li
            key={item.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border bg-card p-3",
              statusStyles[item.status]
            )}
          >
            <Badge
              variant="outline"
              className={cn("shrink-0 text-[10px]", moduleStyles[item.module])}
            >
              {MODULE_LABELS[item.module]}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium", compact && "text-sm")}>
                {item.title}
              </p>
              {item.subtitle && (
                <p className="text-xs text-muted-foreground">{item.subtitle}</p>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {item.date.split("-").reverse().join("/")}
            </span>
          </li>
        );

        return item.link ? (
          <Link key={item.id} to={item.link} className="block hover:opacity-90">
            {content}
          </Link>
        ) : (
          content
        );
      })}
    </ul>
  );
}
