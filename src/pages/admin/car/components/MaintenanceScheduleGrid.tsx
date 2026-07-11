import type { MaintenanceScheduleItem } from "@/types/car";
import { statusBadgeStyles } from "@/lib/design-tokens";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface MaintenanceScheduleGridProps {
  items: MaintenanceScheduleItem[];
}

function statusLabel(status: MaintenanceScheduleItem["status"]): string {
  switch (status) {
    case "overdue":
      return "ATRASADO";
    case "upcoming":
      return "ATENÇÃO";
    case "ok":
      return "OK";
    default:
      return "SEM REGISTRO";
  }
}

export function MaintenanceScheduleGrid({
  items,
}: MaintenanceScheduleGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <article
          key={item.type}
          className="rounded-lg border bg-card p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold">{item.label}</h3>
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 text-[10px] font-semibold",
                item.status === "none"
                  ? "border-muted-foreground/30 text-muted-foreground"
                  : statusBadgeStyles[statusLabel(item.status)]
              )}
            >
              {statusLabel(item.status)}
            </Badge>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">{item.message}</p>

          {item.nextKm != null && (
            <p className="mt-1 text-xs">
              Próxima troca:{" "}
              <span className="font-medium">
                {item.nextKm.toLocaleString("pt-BR")} km
              </span>
            </p>
          )}
          {item.nextDate && (
            <p className="mt-1 text-xs">
              Ou em:{" "}
              <span className="font-medium">
                {formatDateBR(item.nextDate)}
              </span>
            </p>
          )}
          {item.lastServiceDate && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Última: {formatDateBR(item.lastServiceDate)}
              {item.lastKm != null &&
                ` · ${item.lastKm.toLocaleString("pt-BR")} km`}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
