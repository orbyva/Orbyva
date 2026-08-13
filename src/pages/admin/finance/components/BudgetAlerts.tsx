import { useState } from "react";
import { AlertTriangle, ChevronDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { MonthlyBudgetSummary } from "@/types/finance";

interface BudgetAlertItem {
  parent: MonthlyBudgetSummary;
  mainCause?: MonthlyBudgetSummary;
}

interface BudgetAlertsProps {
  exceededExpenses: BudgetAlertItem[];
  exceededIncome: MonthlyBudgetSummary[];
}

function AlertBlock({
  title,
  icon: Icon,
  tone,
  summary,
  preview,
  details,
}: {
  title: string;
  icon: typeof AlertTriangle;
  tone: "danger" | "success";
  summary: string;
  preview: string;
  details: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  const styles =
    tone === "danger"
      ? {
          container: "border-destructive/25 bg-destructive/5",
          title: "text-destructive",
          text: "text-destructive/90",
        }
      : {
          container: "border-success/25 bg-success/5",
          title: "text-success",
          text: "text-success/90",
        };

  return (
    <section className={cn("rounded-lg border px-4 py-3", styles.container)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              styles.title
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {title}
          </h2>
          <p className={cn("text-sm", styles.text)}>{summary}</p>
          {!expanded && (
            <p className={cn("truncate text-xs", styles.text)}>{preview}</p>
          )}
          {expanded && (
            <div className={cn("space-y-2 pt-1 text-xs", styles.text)}>
              {details}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-7 shrink-0 px-2 text-xs", styles.text)}
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
      </div>
    </section>
  );
}

export function BudgetAlerts({
  exceededExpenses,
  exceededIncome,
}: BudgetAlertsProps) {
  if (exceededExpenses.length === 0 && exceededIncome.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {exceededExpenses.length > 0 && (
        <AlertBlock
          title="Orçamento estourado"
          icon={AlertTriangle}
          tone="danger"
          summary={`${exceededExpenses.length} ${
            exceededExpenses.length === 1 ? "categoria estourou" : "categorias estouraram"
          } o limite`}
          preview={exceededExpenses
            .map(({ parent }) => parent.type_name)
            .slice(0, 4)
            .join(" · ")}
          details={
            <>
              {exceededExpenses.map(({ parent, mainCause }) => (
                <div key={parent.id}>
                  <span className="font-medium">{parent.type_name}</span> , {" "}
                  {formatBRL(Math.abs(Number(parent.remaining_value || 0)))} acima
                  {mainCause && (
                    <span className="block text-[11px] opacity-80">
                      Principal causa: {mainCause.class_name} (
                      {formatBRL(Math.abs(Number(mainCause.remaining_value || 0)))})
                    </span>
                  )}
                </div>
              ))}
            </>
          }
        />
      )}

      {exceededIncome.length > 0 && (
        <AlertBlock
          title="Receita acima do previsto"
          icon={TrendingUp}
          tone="success"
          summary={`${exceededIncome.length} ${
            exceededIncome.length === 1
              ? "categoria superou"
              : "categorias superaram"
          } a meta`}
          preview={exceededIncome
            .map((item) => item.type_name)
            .slice(0, 4)
            .join(" · ")}
          details={
            <>
              {exceededIncome.map((item) => (
                <div key={item.id}>
                  <span className="font-medium">{item.type_name}</span>, +{" "}
                  {formatBRL(
                    Number(item.income_value || 0) -
                      Number(item.planned_value || 0)
                  )}
                </div>
              ))}
            </>
          }
        />
      )}
    </div>
  );
}
