import { useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import type { DocumentAlert, MaintenanceAlert } from "@/types/car";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CarAlertsProps {
  maintenanceAlerts: MaintenanceAlert[];
  documentAlerts: DocumentAlert[];
}

function AlertSection({
  title,
  icon: Icon,
  messages,
  tone,
}: {
  title: string;
  icon: typeof Clock;
  messages: string[];
  tone: "warning" | "danger";
}) {
  const [expanded, setExpanded] = useState(false);

  if (messages.length === 0) return null;

  const toneStyles =
    tone === "danger"
      ? {
          container: "border-destructive/25 bg-destructive/5",
          title: "text-destructive",
          text: "text-destructive/90",
          icon: "text-destructive",
        }
      : {
          container: "border-warning/25 bg-warning/5",
          title: "text-warning",
          text: "text-warning/90",
          icon: "text-warning",
        };

  return (
    <section
      className={cn("rounded-lg border px-4 py-3", toneStyles.container)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              toneStyles.title
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", toneStyles.icon)} />
            {title}
          </h2>
          <p className={cn("text-sm", toneStyles.text)}>
            {messages.length}{" "}
            {messages.length === 1 ? "item pendente" : "itens pendentes"}
          </p>
          {!expanded && (
            <p className={cn("truncate text-xs", toneStyles.text)}>
              {messages.slice(0, 2).join(" · ")}
              {messages.length > 2 && " · ..."}
            </p>
          )}
          {expanded && (
            <ul className={cn("space-y-1 pt-1 text-xs", toneStyles.text)}>
              {messages.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-7 shrink-0 px-2 text-xs", toneStyles.text)}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Ocultar" : "Ver detalhes"}
        </Button>
      </div>
    </section>
  );
}

export function CarAlerts({
  maintenanceAlerts,
  documentAlerts,
}: CarAlertsProps) {
  const overdueMaintenance = maintenanceAlerts
    .filter((a) => a.status === "overdue")
    .map((a) => a.message);
  const upcomingMaintenance = maintenanceAlerts
    .filter((a) => a.status === "upcoming")
    .map((a) => a.message);

  const overdueDocs = documentAlerts
    .filter((a) => a.status === "overdue")
    .map((a) => a.message);
  const upcomingDocs = documentAlerts
    .filter((a) => a.status === "upcoming")
    .map((a) => a.message);

  const overdue = [...overdueMaintenance, ...overdueDocs];
  const upcoming = [...upcomingMaintenance, ...upcomingDocs];

  if (overdue.length === 0 && upcoming.length === 0) return null;

  return (
    <div className="space-y-2">
      <AlertSection
        title="Manutenções e documentos atrasados"
        icon={AlertTriangle}
        messages={overdue}
        tone="danger"
      />
      <AlertSection
        title="Próximas trocas e vencimentos"
        icon={Clock}
        messages={upcoming}
        tone="warning"
      />
    </div>
  );
}
