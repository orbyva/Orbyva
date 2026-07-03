import { useState } from "react";
import { Link } from "react-router-dom";
import { RecurringDueAlert } from "@/types/recurring";
import { groupDueAlertsByDate } from "@/domain/recurring";
import { AlertTriangle, ChevronDown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RecurringDueAlertsProps {
  alerts: RecurringDueAlert[];
  showRecurringLink?: boolean;
}

function CompactAlertSection({
  title,
  icon: Icon,
  alerts,
  tone,
}: {
  title: string;
  icon: typeof Clock;
  alerts: RecurringDueAlert[];
  tone: "warning" | "danger";
}) {
  const [expanded, setExpanded] = useState(false);
  const groups = groupDueAlertsByDate(alerts);
  const totalAccounts = alerts.length;

  if (totalAccounts === 0) return null;

  const summaryText =
    groups.length === 1
      ? `${totalAccounts} ${totalAccounts === 1 ? "conta vence" : "contas vencem"} em ${groups[0].dateLabel}`
      : `${totalAccounts} ${totalAccounts === 1 ? "conta" : "contas"} em ${groups.length} datas`;

  const previewNames = groups
    .flatMap((g) => g.accountNames)
    .slice(0, 4)
    .join(" · ");

  const toneStyles =
    tone === "danger"
      ? {
          container: "border-red-500/25 bg-red-500/5",
          title: "text-red-400",
          text: "text-red-300/90",
          icon: "text-red-400",
        }
      : {
          container: "border-yellow-500/25 bg-yellow-500/5",
          title: "text-yellow-400",
          text: "text-yellow-300/80",
          icon: "text-yellow-400",
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
          <p className={cn("text-sm", toneStyles.text)}>{summaryText}</p>
          {!expanded && (
            <p className={cn("truncate text-xs", toneStyles.text)}>
              {previewNames}
              {totalAccounts > 4 && " · ..."}
            </p>
          )}
          {expanded && (
            <div className={cn("space-y-2 pt-1 text-xs", toneStyles.text)}>
              {groups.map((group) => (
                <div key={group.date}>
                  <span className="font-medium">{group.dateLabel}:</span>{" "}
                  {group.accountNames.join(" · ")}
                </div>
              ))}
            </div>
          )}
        </div>

        {totalAccounts > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-7 shrink-0 px-2 text-xs", toneStyles.text)}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? "Ocultar" : "Ver detalhes"}
            <ChevronDown
              className={cn(
                "ml-1 h-3 w-3 transition-transform",
                expanded && "rotate-180"
              )}
            />
          </Button>
        )}
      </div>
    </section>
  );
}

export function RecurringDueAlerts({
  alerts,
  showRecurringLink = false,
}: RecurringDueAlertsProps) {
  if (alerts.length === 0) return null;

  const overdueAlerts = alerts.filter((alert) => alert.status === "overdue");
  const upcomingAlerts = alerts.filter((alert) => alert.status === "upcoming");

  return (
    <div className="space-y-2">
      <CompactAlertSection
        title="Contas atrasadas"
        icon={AlertTriangle}
        alerts={overdueAlerts}
        tone="danger"
      />
      <CompactAlertSection
        title="Vencimentos próximos"
        icon={Clock}
        alerts={upcomingAlerts}
        tone="warning"
      />
      {showRecurringLink ? (
        <div className="text-right">
          <Link
            to="/finance/recurring"
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            Ver todas as recorrências →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
