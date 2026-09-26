import { useCallback, useEffect, useMemo, useState } from "react";
import { Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { RecordMetricDialog } from "@/pages/admin/life/RecordMetricDialog";
import { deleteHealthMetric, fetchHealthMetrics } from "@/api/health";
import {
  METRIC_LABEL,
  METRIC_TYPES,
  METRIC_UNIT,
  bmiCategory,
  computeBmi,
  formatMetricValue,
  latestByType,
  seriesByType,
} from "@/domain/health/metrics";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import type { HealthMetric, MetricType } from "@/types/health";

/** Janela da tela de histórico — maior que a do hub, que só precisa da última e da anterior. */
const METRICS_HISTORY_LIMIT = 200;

/**
 * Histórico de medições corporais. O hub de Saúde mostra só o último valor de cada tipo; aqui a
 * série inteira fica visível — o equivalente de `/life/health/medications` para o Progresso.
 */
export default function ProgressList() {
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HealthMetric | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMetrics(await fetchHealthMetrics(null, METRICS_HISTORY_LIMIT));
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível carregar o progresso."
        ),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const latest = useMemo(() => latestByType(metrics), [metrics]);
  const bmi = computeBmi(latest.weight?.value, latest.height?.value);
  const groups = useMemo(
    () =>
      METRIC_TYPES.map((type) => ({
        type,
        rows: seriesByType(metrics, type),
      })).filter((group) => group.rows.length > 0),
    [metrics]
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(metric: HealthMetric) {
    setEditing(metric);
    setDialogOpen(true);
  }

  async function handleDelete(metric: HealthMetric) {
    setDeletingId(metric.id);
    try {
      await deleteHealthMetric(metric.id);
      toast({ title: "Medição excluída", duration: 2000 });
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível excluir a medição."
        ),
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <PageShell
      title="Progresso"
      eyebrow="Vida · Saúde"
      description="Histórico de peso, altura e medidas"
      actions={
        <div className={PAGE_HEADER_ACTIONS_CLASS}>
          <ModuleGuideButton moduleId="health" />
          {metrics.length > 0 ? (
            <Button onClick={openCreate}>Registrar medição</Button>
          ) : null}
        </div>
      }
    >
      <ModuleGuide moduleId="health" />
      <section className="rounded-xl border bg-card shadow-sm">
        {loading ? (
          <TableLoadingSkeleton rows={3} columns={3} />
        ) : metrics.length === 0 ? (
          <EmptyState
            icon={Ruler}
            title="Nenhuma medição registrada"
            description="Registre peso, altura e medidas para acompanhar a evolução ao longo do tempo."
            action={<Button onClick={openCreate}>Registrar medição</Button>}
          />
        ) : (
          <div>
            {bmi != null ? (
              <div className="border-b px-4 py-3">
                <p className="text-xs text-muted-foreground">IMC atual</p>
                <p className="text-lg font-semibold">
                  {formatMetricValue(bmi)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {bmiCategory(bmi)}
                  </span>
                </p>
              </div>
            ) : null}
            {groups.map((group, index) => (
              <MetricGroup
                key={group.type}
                type={group.type}
                rows={group.rows}
                bordered={index > 0 || bmi != null}
                deletingId={deletingId}
                onEdit={openEdit}
                onDelete={(metric) => void handleDelete(metric)}
              />
            ))}
          </div>
        )}
      </section>

      <RecordMetricDialog
        key={editing?.id ?? "nova"}
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditing(null);
        }}
        onRecorded={load}
        metric={editing}
      />
    </PageShell>
  );
}

function MetricGroup({
  type,
  rows,
  bordered,
  deletingId,
  onEdit,
  onDelete,
}: {
  type: MetricType;
  rows: HealthMetric[];
  bordered: boolean;
  deletingId: string | null;
  onEdit: (metric: HealthMetric) => void;
  onDelete: (metric: HealthMetric) => void;
}) {
  return (
    <div className={bordered ? "border-t" : undefined}>
      <h2 className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {METRIC_LABEL[type]}
      </h2>
      <ul className="divide-y">
        {rows.map((row, index) => {
          const older = rows[index + 1];
          const delta =
            older == null
              ? null
              : Math.round((row.value - older.value) * 100) / 100;
          return (
            <li
              key={row.id}
              aria-label={`${METRIC_LABEL[type]} em ${formatDateBR(row.recorded_date)}`}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {formatMetricValue(row.value)} {METRIC_UNIT[type]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateBR(row.recorded_date)}
                  {delta != null ? (
                    <span className="ml-2 font-medium text-foreground">
                      {delta === 0
                        ? "sem variação"
                        : `${delta > 0 ? "+" : "−"}${formatMetricValue(
                            Math.abs(delta)
                          )} ${METRIC_UNIT[type]}`}
                    </span>
                  ) : null}
                </p>
                {row.notes ? (
                  <p className="text-xs text-muted-foreground">{row.notes}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(row)}
                >
                  Editar
                </Button>
                <ConfirmDeleteDialog
                  title={`Excluir medição de ${METRIC_LABEL[type]}?`}
                  loading={deletingId === row.id}
                  onConfirm={() => onDelete(row)}
                >
                  <Button variant="outline" size="sm">
                    Excluir
                  </Button>
                </ConfirmDeleteDialog>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
