import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteTask, fetchProjects, fetchTasks, updateTask } from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { fetchMedications } from "@/api/health/medications";
import { Link } from "react-router-dom";
import { List, Pencil, Repeat, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  formatRecurrenceSummary,
  groupTaskSeries,
  normalizeProjectFilter,
  PROJECT_FILTER_ALL,
  PROJECT_FILTER_NONE,
  type TaskSeriesSummary,
} from "@/domain/tasks";
import { formatPosology } from "@/domain/health/medication";
import { useToast } from "@/hooks/use-toast";
import { formatDateTimeBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { readTaskProjectFilter, writeTaskProjectFilter } from "@/lib/taskProjectFilterPreference";
import { SeriesOccurrencesDialog } from "./SeriesOccurrencesDialog";
import { TaskDeleteDialog } from "./TaskDeleteDialog";
import { TaskIconBadge } from "./TaskIconBadge";
import { TaskRecurrenceDialog } from "./TaskRecurrenceDialog";
import { useTaskRecurrenceEditor, type TaskRecurrenceValue } from "./useTaskRecurrenceEditor";
import { runScopedTaskDelete } from "./scopedDelete";
import { useDimensions } from "@/hooks/useDimensions";
import type { TaskDeleteOption } from "@/domain/tasks";
import type { Medication } from "@/types/health";
import type { Recurring } from "@/types/recurring";
import type { Project, Task } from "@/types/tasks";

/**
 * Feature 101 — "Tarefas recorrentes" (`/tasks/recurrences`), alcançada pelo botão "Recorrências"
 * do cabeçalho de `/tasks`.
 *
 * O título diverge do rótulo do botão de propósito: já existe **Finanças → Recorrências**
 * (`/finance/recurring`), que é outra coisa, e duas páginas com o mesmo `title` em módulos
 * diferentes é como se erra a tela na próxima sessão.
 *
 * A tela mostra **uma linha por série**, não por ocorrência: o que o usuário quer ver é a *regra*
 * ("A cada 2 semanas, seg e qua"), com as ocorrências a um clique. E, ao contrário da Lista — que
 * colapsa a série na próxima ocorrência em aberto e **esconde** a série sem nenhuma —, aqui a
 * recorrência encerrada continua visível: "acabou" é informação, não motivo para sumir.
 */

/**
 * O eixo desta tela é a **série** estar viva ou não — não a ocorrência estar concluída. Por isso
 * não reaproveita `TaskStatusView` (`pending`/`done`/`all`), que fala de outra coisa: uma série
 * "ativa" pode ter dezenas de ocorrências concluídas atrás dela.
 */
export type SeriesStatusFilter = "active" | "ended" | "all";

/**
 * O rótulo do `Badge` da linha. São **quatro** vocábulos para três `kind`: "Consulta" (feature 061)
 * é um recorte de exibição sobre uma série simples, não uma quarta chave de agrupamento — no
 * vocabulário do usuário, porém, "consulta de 3 em 3 meses" e "reunião semanal" não são a mesma
 * coisa, e a linha teria de ser lida pelo título para distinguir.
 */
export function seriesBadgeLabel(series: TaskSeriesSummary): string {
  if (series.kind === "medication") return "Medicação";
  if (series.kind === "linked") return "Financeira";
  if (series.origin.is_consultation) return "Consulta";
  return "Repetição";
}

/** "12 ocorrências · 5 concluídas" — série de uma ocorrência só não pode falar no plural. */
export function occurrencesLabel(series: TaskSeriesSummary): string {
  const total = series.occurrenceCount;
  const unit = total === 1 ? "ocorrência" : "ocorrências";
  return `${total} ${unit} · ${series.doneCount} ${series.doneCount === 1 ? "concluída" : "concluídas"}`;
}

/**
 * O texto da regra da linha. Para tratamento a regra **não** mora na tarefa: a origem backfillada
 * pode ter uma `recurrence_rule` que já não descreve a posologia atual, e uma série cuja origem foi
 * apagada (só doses, sem regra nenhuma) cairia num "Não se repete" que é falso — a verdade está no
 * registro de `medication` (`formatPosology`: "2 comprimidos · 08:00, 20:00 · todos os dias").
 */
export function seriesRuleText(
  series: TaskSeriesSummary,
  linkedDescription: string | null,
  medication: Medication | null
): string {
  if (series.kind === "medication" && medication) return formatPosology(medication);
  return formatRecurrenceSummary(series.origin, linkedDescription);
}

/**
 * "Editar repetição" — o `TaskRecurrenceDialog` do formulário completo, aberto sozinho sobre a
 * **tarefa-origem** da série.
 *
 * Monta só quando abre (e é remontado por `key` a cada série) porque `useTaskRecurrenceEditor`
 * semeia o estado interno — frequência, intervalo, dias, término — a partir do `value` inicial:
 * reaproveitar a instância entre duas séries traria a configuração da anterior.
 *
 * A página **não** vira um quarto dono do `TaskFormFields`: aqui se edita só a repetição, que é o
 * assunto da tela. Título, prazo, tags e o resto continuam no formulário completo, em
 * Lista/Projeto/Agenda.
 */
function EditRecurrenceDialog({
  origin,
  recurrings,
  onRecurringCreated,
  onSaved,
  onClose,
}: {
  origin: Task;
  recurrings: Recurring[];
  onRecurringCreated: (recurring: Recurring) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { dimensions } = useDimensions();
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<TaskRecurrenceValue>({
    due_date: origin.due_date,
    due_time: origin.due_time ?? null,
    start_date: origin.start_date ?? null,
    estimated_duration: origin.estimated_duration ?? null,
    is_quick: origin.is_quick,
    recurrence_rule: origin.recurrence_rule,
    linked_recurring_id: origin.linked_recurring_id,
  });
  const editor = useTaskRecurrenceEditor({ value, onChange: setValue });

  async function handleSave() {
    setSaving(true);
    try {
      // Só os campos que este dialog governa. Título, tags e o resto da tarefa-origem não passam
      // por aqui — não são o assunto da tela, e mandá-los de volta seria reescrever à toa.
      await updateTask({
        id: origin.id,
        due_date: value.due_date,
        due_time: value.due_time ?? null,
        recurrence_rule: value.recurrence_rule,
        linked_recurring_id: value.linked_recurring_id,
      });
      toast({ title: "Repetição salva!", duration: 2000 });
      onClose();
      onSaved();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar a repetição."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <TaskRecurrenceDialog
      open
      onOpenChange={(next) => !next && onClose()}
      value={value}
      editor={editor}
      recurrings={recurrings}
      dimensions={dimensions}
      onRecurringCreated={onRecurringCreated}
      onChange={setValue}
      footer={
        <div className="space-y-2">
          {/* Não é regressão nova — `materializeRecurringInstances` sempre só criou o que faltava,
              nunca apagou o que sobrava. Mas aqui o usuário está justamente olhando a lista de
              ocorrências, então supor o contrário é fácil demais. */}
          <p className="text-xs text-muted-foreground">
            Mudar a regra vale para as próximas ocorrências: as que já foram criadas continuam como
            estão.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar repetição"}
            </Button>
          </div>
        </div>
      }
    />
  );
}

function SeriesRow({
  series,
  projectName,
  linkedDescription,
  medication,
  onOpenOccurrences,
  onEditRecurrence,
  onDelete,
  onDeleteScoped,
}: {
  series: TaskSeriesSummary;
  projectName: string | null;
  linkedDescription: string | null;
  medication: Medication | null;
  onOpenOccurrences: () => void;
  onEditRecurrence: (() => void) | null;
  onDelete: () => void;
  onDeleteScoped: (option: TaskDeleteOption) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <TaskIconBadge iconKey={series.origin.icon_key} iconUrl={series.origin.icon_url} />
          <span className="font-medium">{series.origin.title}</span>
          <Badge variant="outline" className="text-[10px]">
            {seriesBadgeLabel(series)}
          </Badge>
          {!series.active && (
            <Badge variant="secondary" className="text-[10px]">
              Encerrada
            </Badge>
          )}
        </div>
        {/* A regra é o assunto da tela: hoje ela só é legível *dentro* do formulário da tarefa. */}
        <p className="text-sm text-muted-foreground">
          {seriesRuleText(series, linkedDescription, medication)}
        </p>
        {projectName && <p className="text-xs text-muted-foreground">{projectName}</p>}
      </div>
      <div className="shrink-0 space-y-1 text-right">
        <p className="text-sm">
          {series.nextOpen
            ? `Próxima: ${formatDateTimeBR(series.nextOpen.due_date, series.nextOpen.due_time)}`
            : `Última: ${formatDateTimeBR(series.lastOccurrence?.due_date, series.lastOccurrence?.due_time)}`}
        </p>
        <p className="text-xs text-muted-foreground">{occurrencesLabel(series)}</p>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenOccurrences}
            aria-label={`Ver ocorrências de "${series.origin.title}"`}
          >
            <List className="h-4 w-4" />
            Ver ocorrências
          </Button>
          {/* Tratamento não entra: a regra dele mora na `medication` (posologia, intervalo, fim
              programado), não na `recurrence_rule` da tarefa — editar a regra da tarefa-origem não
              mudaria dose nenhuma, e `materializeMedicationDoses` recriaria tudo pela `medication`
              na carga seguinte. Quem edita tratamento é Saúde → Medicações. */}
          {onEditRecurrence && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onEditRecurrence}
              aria-label={`Editar repetição de "${series.origin.title}"`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {/*
            O mesmo dialog das outras três telas, alimentado pela **origem**: é ele quem escolhe a
            variante (série simples → "todas as ocorrências"; tratamento → o "Encerrar o tratamento"
            da 075, a única exclusão que de fato funciona para medicação, porque sem desativar a
            `medication` as doses voltam na carga seguinte).

            Série **financeira** cai na variante de tarefa comum, sem "excluir todas": é a decisão
            da feature 028 — o vínculo com a Recorrência tem sync bidirecional próprio, e exclusão
            em massa dele nunca foi pedida. A `description` diz isso em vez de deixar o usuário
            supor que a série inteira vai embora.
          */}
          <TaskDeleteDialog
            task={series.origin}
            onConfirm={onDelete}
            onConfirmScoped={onDeleteScoped}
            description={
              series.kind === "linked"
                ? "Esta série é vinculada a uma Recorrência Financeira: sai só esta ocorrência, e a Recorrência continua existindo em Finanças."
                : undefined
            }
          >
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              aria-label={`Excluir "${series.origin.title}"`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TaskDeleteDialog>
        </div>
      </div>
    </div>
  );
}

export default function TaskRecurrences() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SeriesStatusFilter>("active");
  /** Mesma preferência das quatro visões de `/tasks` (feature 097): o recorte "estou trabalhando
   * no projeto X" é do usuário, não da tela. */
  const [projectFilter, setProjectFilter] = useState<string>(() => readTaskProjectFilter());
  /** A série cujo "Ocorrências de…" está aberto, ou `null`. */
  const [openSeries, setOpenSeries] = useState<TaskSeriesSummary | null>(null);
  /** A série cuja repetição está sendo editada, ou `null`. */
  const [editingSeries, setEditingSeries] = useState<TaskSeriesSummary | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [taskList, projectList, recurringList, medicationList] = await Promise.all([
        fetchTasks(),
        fetchProjects(),
        // As duas cargas abaixo só dão **nome** à regra de uma parte das linhas (a descrição da
        // Recorrência Financeira e a posologia do tratamento). Uma falha nelas não pode zerar a
        // página inteira — sem elas a linha cai no resumo que sai da própria tarefa, que é o que a
        // tela mostrava antes de existirem. Mesmo `.catch` tolerante do `AgendaGrid.load`.
        fetchRecurringTransactions().catch((error) => {
          console.error("Falha ao carregar as Recorrências Financeiras:", error);
          return [] as Recurring[];
        }),
        // **Sem** `activeOnly`: um tratamento encerrado continua sendo uma série (encerrada) desta
        // tela, e sem o registro dele a linha perderia a posologia justamente no caso em que o
        // usuário está olhando para o que já acabou.
        fetchMedications().catch((error) => {
          console.error("Falha ao carregar os tratamentos:", error);
          return [] as Medication[];
        }),
      ]);
      setTasks(taskList);
      setProjects(projectList);
      setRecurrings(recurringList);
      setMedications(medicationList);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar as recorrências."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  /** A preferência salva pode apontar para um projeto apagado desde a última sessão — mesma
   * conferência que `TaskList`/`AgendaGrid` fazem (feature 097). Só depois de `loading`: lista de
   * projetos vazia com a carga em voo não é prova de projeto apagado. */
  useEffect(() => {
    if (loading) return;
    const valid = normalizeProjectFilter(
      projectFilter,
      projects.map((p) => p.id)
    );
    if (valid !== projectFilter) {
      setProjectFilter(valid);
      writeTaskProjectFilter(valid);
    }
  }, [loading, projects, projectFilter]);

  const handleProjectFilterChange = useCallback((value: string) => {
    setProjectFilter(value);
    writeTaskProjectFilter(value);
  }, []);

  /** Exclusão de uma ocorrência só (o botão "Excluir somente esta" / "Apagar só esta dose"). */
  const handleDelete = useCallback(
    async (task: Task) => {
      try {
        await deleteTask(task.id);
        toast({ title: "Tarefa excluída", duration: 2000 });
        load();
      } catch (error) {
        toast({
          title: "Erro",
          description: getErrorMessage(error, "Não foi possível excluir a tarefa."),
          variant: "destructive",
        });
      }
    },
    [load, toast]
  );

  /** Série inteira / doses do tratamento — a mesma rotina compartilhada das outras três telas. */
  const handleDeleteScoped = useCallback(
    async (task: Task, option: TaskDeleteOption) => {
      await runScopedTaskDelete(task, option, { reload: load, notify: toast });
    },
    [load, toast]
  );

  /** Volta aos dois padrões de fábrica — e **grava** o de projeto, que é persistido: sair do
   * recorte na tela e reencontrá-lo na sessão seguinte seria o mesmo susto de novo. */
  const clearFilters = useCallback(() => {
    setStatusFilter("all");
    setProjectFilter(PROJECT_FILTER_ALL);
    writeTaskProjectFilter(PROJECT_FILTER_ALL);
  }, []);

  const allSeries = useMemo(() => groupTaskSeries(tasks), [tasks]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const recurringById = useMemo(() => new Map(recurrings.map((r) => [r.id, r])), [recurrings]);
  const medicationById = useMemo(() => new Map(medications.map((m) => [m.id, m])), [medications]);

  /**
   * O recorte de projeto olha a **origem** da série, não cada ocorrência: quem tem projeto é a
   * recorrência ("Reunião do projeto Casa"), e uma ocorrência solta em outro projeto não faz a
   * série inteira mudar de dono.
   */
  const series = useMemo(() => {
    return allSeries.filter((s) => {
      if (statusFilter === "active" && !s.active) return false;
      if (statusFilter === "ended" && s.active) return false;
      if (projectFilter === PROJECT_FILTER_ALL) return true;
      if (projectFilter === PROJECT_FILTER_NONE) return s.origin.project_id === null;
      return s.origin.project_id === projectFilter;
    });
  }, [allSeries, statusFilter, projectFilter]);

  /**
   * Quantas séries encerradas o padrão "Ativas" está escondendo. O pedido que originou a tela é
   * "veja **todas** as tarefas com recorrência", e a queixa é justamente a recorrência encerrada
   * ser invisível — abrir a página num recorte que a esconde de novo, sem dizer, reproduziria o
   * problema numa tela nova. O padrão continua "Ativas" (é o que o usuário quer ver na maioria das
   * vezes); o que muda é ele saber que há mais.
   */
  const hiddenEndedCount = useMemo(
    () => (statusFilter === "active" ? allSeries.filter((s) => !s.active).length : 0),
    [allSeries, statusFilter]
  );

  return (
    <PageShell
      title="Tarefas recorrentes"
      description="Tudo que se repete na sua rotina, com a regra de cada série — inclusive as que já terminaram."
      eyebrow="Produtividade"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as SeriesStatusFilter)}
        >
          {/* Com um valor escolhido o `placeholder` some e o gatilho ficaria sem nome acessível —
              o `aria-label` é o nome estável do controle (mesmo padrão da feature 097). */}
          <SelectTrigger className="w-40" aria-label="Status da série">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="ended">Encerradas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={handleProjectFilterChange}>
          <SelectTrigger className="w-44" aria-label="Projeto">
            <SelectValue placeholder="Projeto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PROJECT_FILTER_ALL}>Todos os projetos</SelectItem>
            <SelectItem value={PROJECT_FILTER_NONE}>Sem projeto</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!loading && hiddenEndedCount > 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          {hiddenEndedCount === 1
            ? "1 série encerrada está fora deste recorte."
            : `${hiddenEndedCount} séries encerradas estão fora deste recorte.`}{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => setStatusFilter("all")}
          >
            Mostrar todas
          </button>
        </p>
      )}
      {loading ? (
        <TableLoadingSkeleton rows={5} columns={4} />
      ) : allSeries.length === 0 ? (
        /* Base sem série nenhuma × filtro que zerou a lista são estados **diferentes**: um texto só
           para os dois faria o usuário de "Encerradas" achar que perdeu as recorrências. */
        <EmptyState
          icon={Repeat}
          title="Nenhuma tarefa recorrente ainda"
          description="Toda tarefa que se repete — semanal, mensal, vinculada a uma conta ou a um tratamento — aparece aqui, com a regra dela."
          action={
            <Button asChild>
              <Link to="/tasks">Ir para Tarefas</Link>
            </Button>
          }
        />
      ) : series.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Nenhuma série neste recorte"
          description="Você tem recorrências — elas só estão fora do filtro atual."
          action={
            <Button variant="outline" onClick={clearFilters}>
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {series.map((s) => (
            <SeriesRow
              key={s.key}
              series={s}
              projectName={
                s.origin.project_id ? (projectById.get(s.origin.project_id)?.name ?? null) : null
              }
              linkedDescription={
                s.origin.linked_recurring_id
                  ? (recurringById.get(s.origin.linked_recurring_id)?.description ?? null)
                  : null
              }
              medication={
                s.origin.medication_id
                  ? (medicationById.get(s.origin.medication_id) ?? null)
                  : null
              }
              onOpenOccurrences={() => setOpenSeries(s)}
              onEditRecurrence={s.kind === "medication" ? null : () => setEditingSeries(s)}
              onDelete={() => handleDelete(s.origin)}
              onDeleteScoped={(option) => handleDeleteScoped(s.origin, option)}
            />
          ))}
        </div>
      )}
      {/*
        As ocorrências vêm de `series.tasks` (o grupo que `groupTaskSeries` já montou), e **não** de
        `findSeriesTasks(tasks, origem)` como o plano previa. `findSeriesTasks` delega a
        `taskSeriesKey`, que não conhece medicação: para um tratamento ela devolveria só a
        tarefa-origem, porque as doses materializadas nascem sem `recurrence_rule` e sem
        `recurrence_origin_id`. Nas séries simples e financeiras os dois conjuntos são idênticos —
        `taskSeriesGroupKey` delega a `taskSeriesKey` justamente nesses casos.
      */}
      <SeriesOccurrencesDialog
        seriesTask={openSeries?.origin ?? null}
        seriesTasks={openSeries?.tasks ?? []}
        onClose={() => setOpenSeries(null)}
      />
      {editingSeries && (
        <EditRecurrenceDialog
          key={editingSeries.key}
          origin={editingSeries.origin}
          recurrings={recurrings}
          onRecurringCreated={(recurring) => setRecurrings((prev) => [...prev, recurring])}
          onSaved={load}
          onClose={() => setEditingSeries(null)}
        />
      )}
    </PageShell>
  );
}
