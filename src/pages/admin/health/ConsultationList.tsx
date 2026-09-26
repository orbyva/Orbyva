import { useCallback, useEffect, useMemo, useState, type ReactNode, Fragment } from "react";
import { Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { ConsultationQuickCreateDialog } from "@/pages/admin/tasks/ConsultationQuickCreateDialog";
import { fetchConsultationTasks } from "@/api/health";
import { deleteTask } from "@/api/tasks";
import { partitionConsultationHistory } from "@/domain/health/dashboard";
import { formatDateTimeBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import type { Task } from "@/types/tasks";

/**
 * Lista completa de consultas (hub de Saúde). O dashboard mostra a agenda imediata; aqui entram
 * todas as pendentes e o histórico das comparecidas — o equivalente de `/life/health/medications`.
 */
export default function ConsultationList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await fetchConsultationTasks());
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível carregar as consultas."
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

  const { upcoming, history } = useMemo(
    () => partitionConsultationHistory(tasks),
    [tasks]
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setDialogOpen(true);
  }

  async function handleDelete(task: Task) {
    setDeletingId(task.id);
    try {
      await deleteTask(task.id);
      toast({ title: "Consulta excluída", duration: 2000 });
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível excluir a consulta."
        ),
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <PageShell
      title="Consultas"
      eyebrow="Vida · Saúde"
      description="Próximas consultas e o histórico das que já aconteceram"
      actions={
        <div className={PAGE_HEADER_ACTIONS_CLASS}>
          <ModuleGuideButton moduleId="health" />
          {tasks.length > 0 ? (
            <Button onClick={openCreate}>Agendar consulta</Button>
          ) : null}
        </div>
      }
    >
      <ModuleGuide moduleId="health" />
      <section className="rounded-xl border bg-card shadow-sm">
        {loading ? (
          <TableLoadingSkeleton rows={3} columns={3} />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="Nenhuma consulta agendada"
            description="Agende uma consulta para vê-la aqui, no hub de Saúde e no calendário geral."
            action={<Button onClick={openCreate}>Agendar consulta</Button>}
          />
        ) : (
          <div>
            {upcoming.length > 0 ? (
              <ConsultationGroup title="Próximas" tasks={upcoming}>
                {(task) => (
                  <ConsultationRow
                    task={task}
                    deleting={deletingId === task.id}
                    onEdit={() => openEdit(task)}
                    onDelete={() => void handleDelete(task)}
                  />
                )}
              </ConsultationGroup>
            ) : null}
            {history.length > 0 ? (
              <ConsultationGroup
                title="Histórico"
                tasks={history}
                bordered={upcoming.length > 0}
              >
                {(task) => (
                  <ConsultationRow
                    task={task}
                    deleting={deletingId === task.id}
                    onEdit={() => openEdit(task)}
                    onDelete={() => void handleDelete(task)}
                  />
                )}
              </ConsultationGroup>
            ) : null}
          </div>
        )}
      </section>

      <ConsultationQuickCreateDialog
        key={editing?.id ?? "nova"}
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditing(null);
        }}
        onCreated={load}
        task={editing}
      />
    </PageShell>
  );
}

function ConsultationGroup({
  title,
  tasks,
  bordered = false,
  children,
}: {
  title: string;
  tasks: Task[];
  bordered?: boolean;
  children: (task: Task) => ReactNode;
}) {
  return (
    <div className={bordered ? "border-t" : undefined}>
      <h2 className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <ul className="divide-y">
        {tasks.map((task) => (
          <Fragment key={task.id}>{children(task)}</Fragment>
        ))}
      </ul>
    </div>
  );
}

function ConsultationRow({
  task,
  deleting,
  onEdit,
  onDelete,
}: {
  task: Task;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = task.status === "done";
  return (
    <li
      aria-label={task.title}
      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{task.title}</p>
          {done ? (
            <Badge variant="secondary">Compareceu</Badge>
          ) : (
            <Badge variant="outline">Pendente</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDateTimeBR(task.due_date, task.due_time)}
        </p>
        {task.description ? (
          <p className="text-xs text-muted-foreground">{task.description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Editar
        </Button>
        <ConfirmDeleteDialog
          title={`Excluir ${task.title}?`}
          description="Só esta ocorrência é removida. A série, se existir, continua."
          loading={deleting}
          onConfirm={onDelete}
        >
          <Button variant="outline" size="sm">
            Excluir
          </Button>
        </ConfirmDeleteDialog>
      </div>
    </li>
  );
}
