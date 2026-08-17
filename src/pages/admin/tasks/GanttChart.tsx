import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gantt, getDefaultColumns, Willow, WillowDark } from "@svar-ui/react-gantt";
import type { IApi, IColumnConfig } from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/all.css";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  buildGanttLinks,
  buildGanttNodes,
  GANTT_PROJECT_NODE_PREFIX,
  groupCalendarItemsByDay,
  jumpToGanttZoomLevel,
  resolveTaskDateUpdates,
  resolveTaskScheduleUpdate,
  type GanttDependencyInput,
  type GanttProjectInput,
  type GanttTaskInput,
  type GanttViewMode,
} from "@/domain/tasks";
import { createDependency, deleteDependency, updateTask } from "@/api/tasks";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { Project, Task, TaskPriority } from "@/types/tasks";
import { AgendaHourGrid } from "./AgendaHourGrid";
import { TaskIconBadge } from "./TaskIconBadge";
import type { TaskIconValue } from "./TaskIconPicker";
import { TaskQuickFields } from "./TaskQuickFields";

const monthYearFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("pt-BR", { day: "numeric" });
const monthShortFormatter = new Intl.DateTimeFormat("pt-BR", { month: "short" });
const yearFormatter = new Intl.DateTimeFormat("pt-BR", { year: "numeric" });

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function quarterLabel(date: Date): string {
  return `T${Math.floor(date.getMonth() / 3) + 1}`;
}

/** Espelha `IScaleConfig`/`IScaleLevel` de `@svar-ui/gantt-store` — definidos localmente porque o
 * pacote só re-exporta esses tipos via `@svar-ui/react-gantt` de forma incompleta (`IScaleLevel`
 * não está na lista curada de `export type {...}` de `gantt-store/dist/types/index.d.ts`, embora
 * exista em `types.d.ts`). Compatível estruturalmente com o que `<Gantt zoom={{levels}} />` espera. */
interface GanttScaleConfig {
  unit: string;
  step: number;
  format?: (date: Date, next?: Date) => string;
}
interface GanttZoomLevel {
  minCellWidth: number;
  maxCellWidth: number;
  scales: GanttScaleConfig[];
}

/** 4 presets de granularidade (feature 037) — cada um é um nível de `zoom.levels`, com sua própria
 * régua de cabeçalho (`scales`). A ordem aqui é a mesma usada nos botões abaixo e no índice
 * passado a `jumpToGanttZoomLevel`. */
const GANTT_ZOOM_PRESETS: { id: string; label: string; level: GanttZoomLevel }[] = [
  {
    id: "day",
    label: "Dia",
    level: {
      minCellWidth: 30,
      maxCellWidth: 120,
      scales: [
        { unit: "month", step: 1, format: (date) => capitalize(monthYearFormatter.format(date)) },
        { unit: "day", step: 1, format: (date) => dayFormatter.format(date) },
      ],
    },
  },
  {
    id: "week",
    label: "Semana",
    level: {
      minCellWidth: 40,
      maxCellWidth: 140,
      scales: [
        { unit: "month", step: 1, format: (date) => capitalize(monthYearFormatter.format(date)) },
        { unit: "week", step: 1, format: (date) => `Semana de ${dayFormatter.format(date)}` },
      ],
    },
  },
  {
    id: "month",
    label: "Mês",
    level: {
      minCellWidth: 60,
      maxCellWidth: 160,
      scales: [
        { unit: "year", step: 1, format: (date) => yearFormatter.format(date) },
        { unit: "month", step: 1, format: (date) => capitalize(monthShortFormatter.format(date)) },
      ],
    },
  },
  {
    id: "quarter",
    label: "Trimestre",
    level: {
      minCellWidth: 80,
      maxCellWidth: 200,
      scales: [
        { unit: "year", step: 1, format: (date) => yearFormatter.format(date) },
        { unit: "quarter", step: 1, format: (date) => quarterLabel(date) },
      ],
    },
  },
];

const GANTT_ZOOM_LEVELS: GanttZoomLevel[] = GANTT_ZOOM_PRESETS.map((preset) => preset.level);
const GANTT_DEFAULT_ZOOM_LEVEL = 0; // "Dia" — granularidade que a visão sempre teve até aqui.
/** Índice do preset "Dia" — só nesse nível de zoom faz sentido "focar" um dia específico (feature
 * 038): abaixo de "dia" não teria granularidade suficiente pra decidir qual dia focar, e acima
 * (semana/mês/trimestre) o Gantt já é a visão de alto nível que o zoom-out pediu. */
const GANTT_DAY_PRESET_INDEX = GANTT_ZOOM_PRESETS.findIndex((preset) => preset.id === "day");

/** Dados/handlers de quick actions (feature 039) fechados sobre o `id` de cada tarefa (repassados
 * como props opcionais em `GanttChart`, mesma convenção "ausência = sem regressão" de `TaskQuickFields`
 * nas features 033/035) — passados por closure pra `GanttTaskNameCell` porque a lib só invoca `cell`
 * com `{ api, row, column, onaction }` (`ICellProps`, `@svar-ui/react-grid`), sem espaço pra props
 * extras nossas; quem monta o `cell` (`columns`, abaixo) fecha sobre este objeto. */
interface GanttTaskQuickActionsData {
  /** `fullTasks` (recebida por `GanttChart`) indexada por `id` — a única forma de achar os campos
   * completos (prioridade, prazo, projeto) a partir do nó reduzido (`GanttNode`) que o `row` da lib
   * carrega. */
  taskById: Map<string, Task>;
  projects?: Project[];
  onIconChange?: (taskId: string, next: TaskIconValue) => void;
  onPriorityChange?: (taskId: string, priority: TaskPriority | null) => void;
  onDueChange?: (
    taskId: string,
    next: { due_date: string | null; due_time: string | null; estimated_duration: number | null }
  ) => void;
  onProjectChange?: (taskId: string, projectId: string | null) => void;
  /** Feature 045: qual tarefa (id) tem o popover de quick actions aberto — elevado pro componente
   * `GanttChart` (fora da célula virtualizada) em vez de cada `GanttTaskNameCell` gerenciar seu
   * próprio `open` local via `Popover` não-controlado do Radix. Necessário porque o grid da lib
   * (`@svar-ui/react-grid`) virtualiza linhas: assim que a linha sai da janela visível, React a
   * desmonta — inclusive o `Popover` (e qualquer popover aninhado aberto dentro dele), deixando o
   * `PopoverContent` portalizado em `document.body` num estado inconsistente. Com o estado elevado,
   * `GanttChart` consegue fechar o popover proativamente ao detectar scroll no grid, antes que a
   * virtualização desmonte a linha (ver listener de scroll em `GanttChart`, abaixo). */
  openTaskId: string | null;
  onOpenChangeTaskId: (taskId: string | null) => void;
}

/** Célula da coluna "text" (nome da tarefa) — a lib envolve isso com o ícone de
 * expandir/recolher e a indentação da árvore automaticamente (`column._cell`), então só
 * precisamos formatar o texto em si. Esmaece/risca tarefas concluídas (`progress === 100`).
 * `TaskIconBadge` (feature 035) aparece antes do texto pra nós de tarefa, nunca de projeto
 * (`type: "summary"` não tem `icon_key`/`icon_url`).
 *
 * Feature 039: quando `quickActions` está presente e a linha é uma tarefa de verdade
 * (`row.type === "task"` — nunca `summary`/`milestone`, mesma restrição que já vale pra
 * drag/edição via `api.intercept`), o nome vira um trigger que abre um `Popover` com
 * `TaskQuickFields` (prioridade/ícone/prazo/projeto), igual ao padrão de
 * `ProjectBadgeButton`/`TaskDueQuickEdit`/`TaskPriorityQuickPick`. */
function GanttTaskNameCell({
  row,
  quickActions,
}: {
  row: Record<string, unknown>;
  quickActions?: GanttTaskQuickActionsData;
}) {
  const done = row.type === "task" && row.progress === 100;
  const label = (
    <span className="flex min-w-0 items-center gap-1">
      {row.type === "task" && (
        <TaskIconBadge iconKey={row.icon_key as string | null} iconUrl={row.icon_url as string | null} />
      )}
      <span className={cn("truncate", done && "text-muted-foreground line-through")}>
        {row.text as string}
      </span>
    </span>
  );

  const task =
    row.type === "task" && quickActions ? quickActions.taskById.get(row.id as string) : undefined;
  if (!task || !quickActions) return label;

  const taskId = row.id as string;
  const isOpen = quickActions.openTaskId === taskId;

  const fields = TaskQuickFields({
    task,
    onIconChange: quickActions.onIconChange
      ? (next) => quickActions.onIconChange?.(task.id, next)
      : undefined,
    onPriorityChange: quickActions.onPriorityChange
      ? (priority) => quickActions.onPriorityChange?.(task.id, priority)
      : undefined,
    onDueChange: quickActions.onDueChange
      ? (next) => quickActions.onDueChange?.(task.id, next)
      : undefined,
    onProjectChange:
      quickActions.onProjectChange && quickActions.projects
        ? (projectId) => quickActions.onProjectChange?.(task.id, projectId)
        : undefined,
    projects: quickActions.projects,
  });

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => quickActions.onOpenChangeTaskId(open ? taskId : null)}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex min-w-0 items-center gap-1 truncate rounded-sm text-left hover:underline"
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 space-y-2 p-2.5"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {fields.icon}
          {fields.priority}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {fields.due}
          {fields.project}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains("dark"));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function isProjectNodeId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith(GANTT_PROJECT_NODE_PREFIX);
}

/** Célula da barra no gráfico (não confundir com `GanttTaskNameCell`, que é a coluna de texto da
 * grade à esquerda): tarefas sem `start_date`/`due_date` reais ganham uma data-âncora (hoje, 1 dia)
 * pra terem uma barra arrastável, mas precisam continuar visualmente distintas de uma data real —
 * senão o usuário não sabe que ainda precisa "confirmar" arrastando.
 *
 * Marco (`type: "milestone"`, feature 037) e rollup de projeto (`type: "summary"` no modo
 * "by-project") não precisam de markup extra aqui: confirmado lendo o bundle da lib
 * (`@svar-ui/react-gantt/dist/index.es.js`) que — (a) pra `milestone`, a lib sempre renderiza um
 * `<div class="wx-content">` vazio *antes* do slot deste `taskTemplate`, e é esse `wx-content`
 * (não o nosso) que o CSS (`.wx-milestone .wx-content`) gira 45° e pinta como losango; nosso branch
 * abaixo só substitui o rótulo de texto (`wx-text-out`), igual ao default; (b) pra `summary`, o
 * preenchimento proporcional a `data.progress` (`.wx-progress-wrapper`/`.wx-progress-percent`,
 * cor via `--wx-gantt-summary-fill-color`) também é desenhado pela lib como irmão deste template,
 * automaticamente, sempre que o nó tem `progress` definido — não algo que `taskTemplate` precise
 * desenhar. Só precisamos garantir que o nó carregue `progress`/`type` corretos
 * (`buildGanttNodes`/`computeProjectRollup`, `gantt.ts`). */
export function GanttBarContent({
  data,
}: {
  data: { type?: string; text?: string; hasPlannedDate?: boolean };
}) {
  if (data.type === "milestone") {
    return <div className="wx-text-out">{data.text}</div>;
  }
  const isAnchor = data.type === "task" && data.hasPlannedDate === false;
  return (
    <div
      className={cn("wx-content", isAnchor && "rounded-sm border border-dashed border-current opacity-70")}
      title={isAnchor ? "Sem prazo definido — arraste para definir" : undefined}
    >
      {data.text || ""}
    </div>
  );
}

export function GanttChart({
  tasks,
  projects = [],
  dependencies = [],
  fullTasks = [],
  fullProjects = [],
  onOpenTask,
  onDataChanged,
  onIconChange,
  onPriorityChange,
  onDueChange,
  onProjectChange,
  quickActionProjects,
}: {
  tasks: GanttTaskInput[];
  projects?: GanttProjectInput[];
  dependencies?: GanttDependencyInput[];
  /** Tarefas completas (`due_time`, `linked_recurring_id`, `icon_key` etc.) — mesma lista lógica
   * de `tasks` (feature 038), só que sem reduzir os campos, porque a grade de horas do dia focado
   * (`AgendaHourGrid`) precisa deles. `tasks` já aceita objetos `Task` estruturalmente (é um
   * superset de `GanttTaskInput`), então os dois call sites passam o mesmo array pras duas props —
   * ver Notas da feature 038 sobre por que isso não virou uma prop obrigatória única. Feature 039
   * reaproveita esta mesma lista (via `taskById`) pra achar os campos completos da tarefa clicada
   * no popover de quick actions. */
  fullTasks?: Task[];
  /** Projetos completos (com `color`, usado pelos chips/blocos da grade de horas) — `projects`
   * (acima) só carrega `id`/`name`, o suficiente pra árvore do Gantt. */
  fullProjects?: Project[];
  /** Abre o fluxo completo de edição de uma tarefa (mesmo usado pela Lista/Agenda) — chamado ao
   * clicar num bloco/chip dentro da grade de horas do dia focado (feature 038). */
  onOpenTask?: (task: Task) => void;
  /** Chamado depois que uma edição direto no Gantt (arrastar data, criar/remover dependência) é
   * persistida — quem usa `GanttChart` decide se/como recarregar sua própria lista de tarefas. */
  onDataChanged?: () => void;
  /** Quick actions no card do Gantt (feature 039) — mesma convenção "ausência = sem regressão" de
   * `TaskQuickFields` (033/035): sem essas props, `GanttTaskNameCell` continua exatamente como
   * antes (só o nome da tarefa, sem trigger de popover). Assinatura recebe o `id` da tarefa como
   * primeiro argumento (diferente de `TaskQuickFields`, que já fecha sobre uma tarefa só) porque
   * `GanttChart` lida com várias tarefas ao mesmo tempo — os handlers de `TaskList`/`ProjectDetail`
   * (`handleIconChange` etc.) já têm essa assinatura `(taskId, ...)`, então passam direto. */
  onIconChange?: (taskId: string, next: TaskIconValue) => void;
  onPriorityChange?: (taskId: string, priority: TaskPriority | null) => void;
  onDueChange?: (
    taskId: string,
    next: { due_date: string | null; due_time: string | null; estimated_duration: number | null }
  ) => void;
  onProjectChange?: (taskId: string, projectId: string | null) => void;
  /** Catálogo de projetos (já ordenado por atividade) pro `ProjectBadgeButton` do popover de quick
   * actions — obrigatório junto com `onProjectChange` (mesma regra de `TaskQuickFields`). Nomeada
   * `quickActionProjects`, não `projects` (como em `TaskQuickFields`), porque este componente já
   * tem uma prop `projects` com outro formato e outro propósito (`GanttProjectInput[]`, só
   * `id`/`name`, usada pra montar a árvore do Gantt) — reusar o nome colidiria. Ver Notas. */
  quickActionProjects?: Project[];
}) {
  const isDark = useIsDarkMode();
  const { toast } = useToast();
  // "Por projeto" (rollup colapsado + indicador de progresso) é o padrão — visão de alto nível é
  // o motivo desta feature; "Por tarefa" mantém o comportamento anterior (tudo expandido).
  const [viewMode, setViewMode] = useState<GanttViewMode>("by-project");
  const [zoomLevelIndex, setZoomLevelIndex] = useState(GANTT_DEFAULT_ZOOM_LEVEL);
  // Dia "focado" (feature 038) — enquanto setado, substitui o canvas do Gantt pela grade de horas
  // (`AgendaHourGrid`, mesma usada na Agenda/034). Só faz sentido no preset "Dia"; trocar de
  // granularidade enquanto focado não teria pra onde apontar, então volta pro Gantt normal (efeito
  // abaixo).
  const [focusedDay, setFocusedDay] = useState<Date | null>(null);
  useEffect(() => {
    if (zoomLevelIndex !== GANTT_DAY_PRESET_INDEX) setFocusedDay(null);
  }, [zoomLevelIndex]);
  // Feature 045: qual tarefa tem o popover de quick actions aberto, elevado pra cá (fora da célula
  // virtualizada) — ver comentário de `GanttTaskQuickActionsData.openTaskId` sobre o porquê
  // (virtualização de linhas do grid da lib quebra o `Popover` não-controlado do Radix).
  const [openQuickActionsTaskId, setOpenQuickActionsTaskId] = useState<string | null>(null);
  const { nodes } = buildGanttNodes(projects, tasks, viewMode);
  const links = buildGanttLinks(dependencies, nodes);
  const ThemeWrapper = isDark ? WillowDark : Willow;

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const project of fullProjects) map.set(project.id, project);
    return map;
  }, [fullProjects]);

  // Feature 039: `fullTasks` indexada por `id` — a única forma de achar os campos completos
  // (prioridade, prazo, projeto) a partir do nó reduzido (`GanttNode`) que `GanttTaskNameCell`
  // recebe da lib.
  const taskById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of fullTasks) map.set(task.id, task);
    return map;
  }, [fullTasks]);

  // `undefined` (não um objeto com todos os handlers `undefined`) quando nenhuma quick action foi
  // passada — mantém a convenção "ausência = sem regressão": sem isso, `GanttTaskNameCell` nunca
  // tenta montar o popover, nem quando `quickActionProjects` sozinho é passado sem handler nenhum.
  const quickActionsData = useMemo<GanttTaskQuickActionsData | undefined>(() => {
    if (!onIconChange && !onPriorityChange && !onDueChange && !onProjectChange) return undefined;
    return {
      taskById,
      projects: quickActionProjects,
      onIconChange,
      onPriorityChange,
      onDueChange,
      onProjectChange,
      openTaskId: openQuickActionsTaskId,
      onOpenChangeTaskId: setOpenQuickActionsTaskId,
    };
  }, [
    taskById,
    quickActionProjects,
    onIconChange,
    onPriorityChange,
    onDueChange,
    onProjectChange,
    openQuickActionsTaskId,
  ]);

  // Agrupa todas as tarefas por dia (não só o dia focado) — `groupCalendarItemsByDay` é barato o
  // bastante pra isso, e olhar só a chave do dia focado no mapa evita reimplementar o agrupamento.
  // Sem eventos de projeto nesta primeira versão (`GanttChart` não recebe `ProjectEvent[]` hoje).
  const itemsByDay = useMemo(() => groupCalendarItemsByDay(fullTasks, []), [fullTasks]);

  const noopOpenEvent = useCallback(() => {}, []);

  // `init` (abaixo, `handleInit`) só é chamado uma vez pela lib, na montagem — o handler de
  // "update-task" registrado ali fecha sobre `tasks` só daquele momento. Sem essa ref, qualquer
  // edição depois da primeira recarregaria `tasks` no componente mas o handler continuaria
  // comparando contra os dados antigos (bug real, achado ao ligar o cálculo de duração ao
  // "original" da tarefa arrastada — ver Notas da feature 032).
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Mesmo motivo/padrão de `tasksRef` acima, mas pra `fullTasks` — o handler de "show-editor"
  // (abaixo) precisa de um `Task` completo pra `onOpenTask` (o dialog de edição usa campos que
  // `GanttTaskInput`/`tasksRef` não carrega), não só o nó reduzido do Gantt.
  const fullTasksRef = useRef(fullTasks);
  useEffect(() => {
    fullTasksRef.current = fullTasks;
  }, [fullTasks]);

  // Guarda o `api` recebido em `handleInit` (chamado uma vez, na montagem) pra que os botões de
  // zoom (fora do `<Gantt>`) consigam chamar `jumpToGanttZoomLevel` depois.
  const apiRef = useRef<IApi | null>(null);

  // Feature 045: elemento que envolve o `<Gantt>` (`div h-[600px] overflow-hidden`, abaixo). Não é
  // ele mesmo que rola de fato — a lib (`@svar-ui/react-grid`) cria seu próprio elemento interno
  // com scroll real (`div.wx-scroll`, `overflowY: scroll`, confirmado lendo
  // `node_modules/@svar-ui/react-grid/dist/index.es.js`), dinamicamente, sem expor uma ref/seletor
  // estável via `IApi`. Escutar o evento `scroll` aqui com `capture: true` funciona mesmo assim:
  // eventos de `scroll` não fazem bubbling, mas a fase de captura (topo → alvo) sempre acontece
  // para listeners registrados com `capture: true` em qualquer ancestral do elemento que rolou de
  // verdade, independente do `bubbles` do evento — padrão comum pra detectar scroll em containers
  // internos de bibliotecas de terceiros sem depender de detalhes de implementação (nome de classe,
  // estrutura do DOM) que podem mudar em qualquer atualização da lib.
  const ganttScrollContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = ganttScrollContainerRef.current;
    if (!container) return;
    // Fecha proativamente ao detectar scroll, em vez de deixar a virtualização desmontar a linha
    // com o popover aberto (ver comentário de `GanttTaskQuickActionsData.openTaskId`). Fechar o
    // popover externo (quick actions) também fecha qualquer popover aninhado (prazo → duração,
    // até 3 níveis, feature 039) — são filhos dele na árvore.
    const handleScroll = () => setOpenQuickActionsTaskId(null);
    container.addEventListener("scroll", handleScroll, { capture: true });
    return () => container.removeEventListener("scroll", handleScroll, { capture: true });
  }, [focusedDay]); // reanexa quando o container volta a existir (alterna com `AgendaHourGrid`, feature 038)

  const handleZoomPresetClick = useCallback((index: number) => {
    setZoomLevelIndex(index);
    const api = apiRef.current;
    if (api) void jumpToGanttZoomLevel(api, index);
  }, []);

  const columns = useMemo<IColumnConfig[]>(() => {
    const cols = getDefaultColumns() as IColumnConfig[];
    const textColumn = cols.find((c) => c.id === "text");
    if (textColumn) {
      // Fecha sobre `quickActionsData` (feature 039) — a lib só invoca `cell` com
      // `{ api, row, column, onaction }`, sem espaço pra props extras nossas.
      textColumn.cell = ({ row }: { row: Record<string, unknown> }) => (
        <GanttTaskNameCell row={row} quickActions={quickActionsData} />
      );
    }
    return cols;
  }, [quickActionsData]);

  const handleInit = useCallback(
    (api: IApi) => {
      apiRef.current = api;
      // Projeto/summary é uma linha calculada, não uma tarefa real — não pode virar editável só
      // por estar na mesma árvore que tarefas e subtarefas.
      api.intercept("drag-task", ({ id }: { id: unknown }) => {
        if (isProjectNodeId(id)) return false;
      });
      api.intercept("update-task", ({ id }: { id: unknown }) => {
        if (isProjectNodeId(id)) return false;
      });
      api.intercept("add-link", ({ link }: { link: { source?: unknown; target?: unknown } }) => {
        if (isProjectNodeId(link.source) || isProjectNodeId(link.target)) return false;
      });
      // Reconectar uma ponta de um link existente arrastando fica fora de escopo — exclui e cria
      // de novo em vez disso (mais simples que reconciliar com `task_dependency`, que não modela
      // o "tipo" do link, só o par task/depends_on).
      api.intercept("update-link", () => false);

      // A lib dispara sua própria ação interna `show-editor` (`{ id }`) em duplo-clique numa barra
      // ou numa linha da grade — confirmado lendo `@svar-ui/gantt-store/dist/types/DataStore.d.ts`
      // (`["show-editor"]: { id: TID }`) e o bundle (`index.es.js`, `i.exec("show-editor", { id: c
      // })` no clique de linha, `n.exec("show-editor", { id: T, ... })` no duplo-clique de barra).
      // O app nunca monta o `<Editor>` nativo da lib (tem o próprio dialog de edição), então sem
      // este listener "abrir tarefa" não fazia nada em quase todo o Gantt — só funcionava dentro do
      // drill-down "Focar dia" (`AgendaHourGrid`, feature 038), que chama `onOpenTask` direto.
      api.on("show-editor", ({ id }: { id: unknown }) => {
        if (typeof id !== "string" || isProjectNodeId(id)) return;
        const task = fullTasksRef.current.find((t) => t.id === id);
        if (task) onOpenTask?.(task);
      });

      api.on(
        "update-task",
        async ({
          id,
          task,
          inProgress,
        }: {
          id: unknown;
          task: { start?: Date; end?: Date };
          inProgress?: boolean;
        }) => {
          if (inProgress || typeof id !== "string" || isProjectNodeId(id)) return;
          const dateUpdates = resolveTaskDateUpdates(task);
          if (!dateUpdates) {
            toast({
              title: "Erro",
              description: "Não foi possível calcular uma data válida para essa alteração. Tente novamente.",
              variant: "destructive",
            });
            return;
          }
          if (!dateUpdates.start_date && !dateUpdates.due_date) return;

          // Mover a barra inteira desloca as duas pontas pelo mesmo delta e preserva a duração;
          // redimensionar uma ponta só (ou as duas por deltas diferentes) muda a duração —
          // `resolveTaskScheduleUpdate` (função pura, testada em `gantt.test.ts`) decide isso
          // comparando contra a agenda "efetiva" da tarefa original.
          const original = tasksRef.current.find((t) => t.id === id);
          const updates: { id: string; start_date?: string; due_date?: string; estimated_duration?: number } = {
            id,
            ...(original ? resolveTaskScheduleUpdate(original, dateUpdates) : dateUpdates),
          };

          try {
            await updateTask(updates);
          } catch (error) {
            toast({
              title: "Erro",
              description: getErrorMessage(error, "Não foi possível salvar a nova data."),
              variant: "destructive",
            });
          } finally {
            onDataChanged?.();
          }
        }
      );

      api.on("add-link", async ({ link }: { link: { source?: unknown; target?: unknown } }) => {
        const source = typeof link.source === "string" ? link.source : null;
        const target = typeof link.target === "string" ? link.target : null;
        if (!source || !target) return;
        try {
          await createDependency(target, source);
        } catch (error) {
          toast({
            title: "Erro",
            description: getErrorMessage(error, "Não foi possível criar a dependência."),
            variant: "destructive",
          });
        } finally {
          onDataChanged?.();
        }
      });

      api.on("delete-link", async ({ id }: { id: unknown }) => {
        const [dependsOnTaskId, taskId] = String(id).split("->");
        if (!taskId || !dependsOnTaskId) return;
        try {
          await deleteDependency(taskId, dependsOnTaskId);
        } catch (error) {
          toast({
            title: "Erro",
            description: getErrorMessage(error, "Não foi possível remover a dependência."),
            variant: "destructive",
          });
        } finally {
          onDataChanged?.();
        }
      });
    },
    [onDataChanged, toast]
  );

  if (nodes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma tarefa para mostrar no Gantt.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Modo de visualização do Gantt">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "by-project" ? "secondary" : "outline"}
            className={cn("h-7 px-2.5 text-xs", viewMode === "by-project" && "border border-primary/40")}
            onClick={() => setViewMode("by-project")}
          >
            Por projeto
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "by-task" ? "secondary" : "outline"}
            className={cn("h-7 px-2.5 text-xs", viewMode === "by-task" && "border border-primary/40")}
            onClick={() => setViewMode("by-task")}
          >
            Por tarefa
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Granularidade do Gantt">
          {GANTT_ZOOM_PRESETS.map((preset, index) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={zoomLevelIndex === index ? "secondary" : "outline"}
              className={cn(
                "h-7 px-2.5 text-xs",
                zoomLevelIndex === index && "border border-primary/40"
              )}
              onClick={() => handleZoomPresetClick(index)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        {zoomLevelIndex === GANTT_DAY_PRESET_INDEX && !focusedDay && (
          <div className="flex items-center gap-1.5">
            <label htmlFor="gantt-focus-day" className="text-xs text-muted-foreground">
              Focar dia
            </label>
            <input
              id="gantt-focus-day"
              type="date"
              className="h-7 rounded-md border bg-background px-2 text-xs"
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                setFocusedDay(new Date(`${value}T12:00:00`));
              }}
            />
          </div>
        )}
      </div>
      {focusedDay ? (
        <div className="space-y-2 rounded-lg border p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium capitalize">
              {format(focusedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </span>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setFocusedDay(null)}>
              Voltar ao Gantt
            </Button>
          </div>
          <AgendaHourGrid
            days={[focusedDay]}
            itemsByDay={itemsByDay}
            projectById={projectById}
            taskById={taskById}
            onOpenTask={(task) => onOpenTask?.(task)}
            onOpenEvent={noopOpenEvent}
          />
        </div>
      ) : (
        <div ref={ganttScrollContainerRef} className="h-[600px] overflow-hidden rounded-lg border">
          <ThemeWrapper>
            <Gantt
              tasks={nodes}
              links={links}
              columns={columns}
              zoom={{ levels: GANTT_ZOOM_LEVELS, level: GANTT_DEFAULT_ZOOM_LEVEL }}
              init={handleInit}
              taskTemplate={GanttBarContent}
            />
          </ThemeWrapper>
        </div>
      )}
    </div>
  );
}
