import { Link } from "react-router-dom";
import { MODULE_LABELS } from "@/api/timeline";
import type { TimelineItem } from "@/types/timeline";
import { cn } from "@/lib/utils";
import { MODULE_DOT, formatShortDate } from "../hubMeta";

type HubUpcomingProps = {
  upcoming: TimelineItem[];
};

export function HubUpcoming({ upcoming }: HubUpcomingProps) {
  return (
    <section className="space-y-3 lg:col-span-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight sm:text-lg">
          Próximos 7 dias
        </h2>
      </div>
      {upcoming.length > 0 ? (
        <ul className="overflow-hidden rounded-[1.25rem] border bg-card/80 shadow-sm divide-y backdrop-blur">
          {upcoming.slice(0, 5).map((item) => {
            const body = (
              <span className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-3 sm:px-4 sm:py-3">
                <span
                  className={cn(
                    "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                    MODULE_DOT[item.module] ?? "bg-muted-foreground"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium line-clamp-1">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {MODULE_LABELS[item.module] ?? item.module}
                    {item.subtitle ? ` · ${item.subtitle}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {formatShortDate(item.date)}
                  </span>
                  {item.status === "overdue" || item.status === "today" ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        item.status === "overdue"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      )}
                    >
                      {item.status === "overdue" ? "Atrasado" : "Hoje"}
                    </span>
                  ) : null}
                </span>
              </span>
            );
            return (
              <li key={item.id}>
                {item.link ? <Link to={item.link}>{body}</Link> : body}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-[1.25rem] border border-dashed px-4 py-8 text-center">
          <p className="text-sm font-medium">Agenda leve</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nada nos próximos 7 dias.
          </p>
        </div>
      )}
    </section>
  );
}
