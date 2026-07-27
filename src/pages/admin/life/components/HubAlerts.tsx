import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { AppAlert } from "@/api/alerts";
import { cn } from "@/lib/utils";
import { severityAccent, severityIcon } from "../hubMeta";

type HubAlertsProps = {
  priorityAlerts: AppAlert[];
  urgentAlertExtra: number;
};

export function HubAlerts({
  priorityAlerts,
  urgentAlertExtra,
}: HubAlertsProps) {
  return (
    <section className="space-y-3 lg:col-span-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight sm:text-lg">
          Atenção
        </h2>
        {urgentAlertExtra > 0 ? (
          <span className="text-xs text-muted-foreground">
            +{urgentAlertExtra} no sino
          </span>
        ) : null}
      </div>

      {priorityAlerts.length > 0 ? (
        <ul className="space-y-2.5">
          {priorityAlerts.map((a) => (
            <li key={a.id}>
              <Link
                to={a.href}
                className={cn(
                  "group flex gap-2.5 rounded-xl border px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3.5",
                  severityAccent(a.severity)
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/60",
                    severityIcon(a.severity)
                  )}
                >
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{a.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {a.message}
                  </span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed px-4 py-8 text-center">
          <p className="text-sm font-medium">Tudo em dia</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nenhum alerta urgente agora.
          </p>
        </div>
      )}
    </section>
  );
}
