import { useEffect, useRef } from "react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DollarSign } from "lucide-react";
import {
  groupPointItems,
  layoutTimedItems,
  resolveEventProjectId,
  splitTimedItems,
  type CalendarItem,
  type PointItemGroup,
} from "@/domain/tasks";
import type { Project, ProjectEvent, Task } from "@/types/tasks";
import { cn } from "@/lib/utils";
import {
  ConsultationMarker,
  dayKey,
  EventChip,
  isVirtualTask,
  STATUS_DOT_CLASS,
  SubtaskLinkIcon,
  TaskChip,
} from "./AgendaGrid";
import { PointTaskDots } from "./PointTaskDots";
import { TaskIconBadge } from "./TaskIconBadge";

/** Altura de cada linha de hora, em px — 24 linhas = altura total do canvas rolável. */
const HOUR_ROW_PX = 56;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
/** Hora pra onde a grade rola automaticamente quando a hora atual está fora da janela "útil"
 * (bem cedo ou bem tarde) — mesma ideia de calendários que abrem perto do início do dia útil. */
const FALLBACK_SCROLL_HOUR = 7;
/** Altura da fileira de bolinhas posicionada no canvas — fixa em px (não proporcional à duração,
 * que é 0 por definição numa tarefa pontual, feature 072). */
const POINT_ROW_PX = 16;
const MINUTES_PER_DAY = 24 * 60;

interface AgendaHourGridProps {
  /** 1 dia (visão "day") ou 7 dias (visão "week") — a grade se adapta ao número de colunas. */
  days: Date[];
  itemsByDay: Map<string, CalendarItem<Task, ProjectEvent>[]>;
  projectById: Map<string, Project>;
  /** Mapa id -> tarefa, usado só pra resolver o título da tarefa-mãe no tooltip do indicador de
   * vínculo de subtarefa (feature 048). */
  taskById: Map<string, Task>;
  onOpenTask: (task: Task) => void;
  onOpenEvent: (event: ProjectEvent) => void;
  /** Clique numa linha de hora vazia (feature 067) — `hour` é a hora cheia clicada naquele dia.
   * Opcional: sem ela a grade continua sendo só leitura, como era até a 066. */
  onCreateAt?: (day: Date, hour: number) => void;
  /** Clique numa bolinha de tarefa pontual (feature 072) — alterna `todo`/`done`. Opcional: o
   * Gantt (`GanttChart.tsx`, "Focar dia") não passa, e lá as bolinhas ficam só de leitura. */
  onToggleTaskDone?: (task: Task) => void;
}

/** As tarefas de um grupo pontual — `groupPointItems` só põe tarefa em grupo (evento nunca é
 * pontual), então o `flatMap` é um estreitamento de tipo, não um filtro de verdade. */
function pointTasksOf(group: PointItemGroup<Task, ProjectEvent>): Task[] {
  return group.items.flatMap((item) => (item.kind === "task" ? [item.task] : []));
}

/** Rótulo `HH:mm` de um horário em minutos desde a meia-noite. */
function minutesLabel(startMinutes: number): string {
  const h = Math.floor(startMinutes / 60);
  const m = startMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function itemKey(item: CalendarItem<Task, ProjectEvent>): string {
  return item.kind === "task" ? item.task.id : item.event.id;
}

/** Título da tarefa-mãe de `task`, quando ela é uma subtarefa (`parent_task_id` presente) — só
 * pra alimentar o tooltip do `SubtaskLinkIcon`, não afeta o layout/posicionamento (feature 048). */
function parentTitleFor(task: Task, taskById: Map<string, Task>): string | undefined {
  return task.parent_task_id ? taskById.get(task.parent_task_id)?.title : undefined;
}

/** Cor do projeto a que o evento pertence: o evento de tarefa deriva o projeto da tarefa e o
 * avulso não tem projeto nenhum (feature 066) — nos dois casos sem cor, e o bloco cai no cinza
 * neutro que já era o fallback. */
function eventProjectColor(
  event: ProjectEvent,
  projectById: Map<string, Project>,
  taskById: Map<string, Task>
): string | null {
  const projectId = resolveEventProjectId(event, taskById);
  return projectId ? (projectById.get(projectId)?.color ?? null) : null;
}

function TimedTaskBlock({
  task,
  parentTitle,
  onClick,
}: {
  task: Task;
  parentTitle?: string;
  onClick: () => void;
}) {
  const virtual = isVirtualTask(task);
  const done = task.status === "done";
  const isSubtask = !!task.parent_task_id;
  // Consulta médica (feature 061): estetoscópio na cor de Saúde no lugar do ponto de status, e a
  // borda do bloco na mesma cor — no canvas de horas a borda é o que dá a "faixa" de cor do item.
  const isConsultation = !!task.is_consultation;
  const titleAttr = virtual
    ? "Próxima ocorrência — ainda não criada, aparece automaticamente nesse dia"
    : isSubtask
      ? `${task.title} — Subtarefa de "${parentTitle ?? "…"}"`
      : task.title;
  return (
    <button
      type="button"
      disabled={virtual}
      onClick={onClick}
      title={titleAttr}
      className={cn(
        "flex h-full w-full flex-col items-start gap-0.5 overflow-hidden rounded-md border-l-2 bg-background/95 px-1.5 py-1 text-left text-[10px] leading-tight shadow-sm",
        virtual ? "cursor-default border-l-muted-foreground/40 opacity-60" : "hover:bg-muted"
      )}
      style={{
        borderLeftColor: virtual
          ? undefined
          : isConsultation
            ? "hsl(var(--health))"
            : "hsl(var(--primary))",
      }}
    >
      <span className="flex w-full items-center gap-1">
        {isConsultation ? (
          <ConsultationMarker />
        ) : (
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              virtual ? "border border-muted-foreground/60" : STATUS_DOT_CLASS[task.status]
            )}
          />
        )}
        <TaskIconBadge iconKey={task.icon_key} iconUrl={task.icon_url} className="h-3 w-3" />
        {isSubtask && <SubtaskLinkIcon />}
        <span className={cn("truncate font-medium", done && "text-muted-foreground line-through", virtual && "italic")}>
          {task.title}
        </span>
        {task.linked_recurring_id && (
          <DollarSign className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-label="Vinculada a Recorrência" />
        )}
      </span>
      {task.due_time && <span className="text-muted-foreground">{task.due_time.slice(0, 5)}</span>}
    </button>
  );
}

function TimedEventBlock({
  event,
  projectColor,
  onClick,
}: {
  event: ProjectEvent;
  projectColor: string | null;
  onClick: () => void;
}) {
  const color = projectColor ?? "hsl(var(--muted-foreground))";
  return (
    <button
      type="button"
      onClick={onClick}
      title={event.title}
      className="flex h-full w-full flex-col items-start gap-0.5 overflow-hidden rounded-md border-l-2 bg-background/95 px-1.5 py-1 text-left text-[10px] leading-tight shadow-sm hover:bg-muted"
      style={{ borderLeftColor: color }}
    >
      <span className="truncate font-medium">{event.title}</span>
      <span className="text-muted-foreground">{format(new Date(event.starts_at), "HH:mm")}</span>
    </button>
  );
}

/** Faixa "Sem horário" acima do canvas de horas — tarefas com `due_date` mas sem `due_time` não
 * têm o que posicionar numa linha do tempo, então ficam aqui, reaproveitando o chip de
 * mês/semana (`TaskChip`/`EventChip`). Tarefa **pontual** sem horário ("trocar lençol") entra
 * aqui como bolinha marcável, não como chip (feature 072). Some quando nenhum dia visível tem
 * item sem horário. */
function UntimedStrip({
  days,
  itemsByDay,
  projectById,
  taskById,
  onOpenTask,
  onOpenEvent,
  onToggleTaskDone,
}: Pick<
  AgendaHourGridProps,
  "days" | "itemsByDay" | "projectById" | "taskById" | "onOpenTask" | "onOpenEvent" | "onToggleTaskDone"
>) {
  const untimedByDay = days.map((day) => {
    // Pontuais saem antes de `splitTimedItems`: eles nunca viram chip nem bloco.
    const { groups, rest } = groupPointItems(itemsByDay.get(dayKey(day)) ?? []);
    return {
      chips: splitTimedItems(rest).untimed,
      dots: groups.filter((g) => g.startMinutes === null).flatMap(pointTasksOf),
    };
  });
  const hasAny = untimedByDay.some(({ chips, dots }) => chips.length > 0 || dots.length > 0);
  if (!hasAny) return null;

  return (
    <div className="flex border-b bg-muted/20">
      <div className="w-14 shrink-0 border-r px-1 py-1.5 text-right text-[10px] text-muted-foreground">
        Sem horário
      </div>
      {days.map((day, i) => {
        const { chips, dots } = untimedByDay[i];
        return (
          <div key={dayKey(day)} className="min-w-0 flex-1 space-y-0.5 border-l p-1 first:border-l-0">
            <PointTaskDots
              items={dots}
              onToggle={onToggleTaskDone}
              label={`Tarefas pontuais sem horário — ${format(day, "d 'de' MMMM", { locale: ptBR })}`}
            />
            {chips.map((item) =>
              item.kind === "task" ? (
                <TaskChip
                  key={item.task.id}
                  task={item.task}
                  parentTitle={parentTitleFor(item.task, taskById)}
                  onClick={() => onOpenTask(item.task)}
                />
              ) : (
                <EventChip
                  key={item.event.id}
                  event={item.event}
                  projectColor={eventProjectColor(item.event, projectById, taskById)}
                  onClick={() => onOpenEvent(item.event)}
                />
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Grade de 24h (00–23) × N colunas de dia, usada pelas visões "day" (1 coluna) e "week" (7
 * colunas) de `AgendaGrid.tsx`. Itens com horário são posicionados de forma absoluta (top/height
 * proporcional ao horário/duração, via `layoutTimedItems`); itens sem horário ficam na faixa
 * `UntimedStrip` acima da grade. */
export function AgendaHourGrid({
  days,
  itemsByDay,
  projectById,
  taskById,
  onOpenTask,
  onOpenEvent,
  onCreateAt,
  onToggleTaskDone,
}: AgendaHourGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const currentHour = new Date().getHours();
    const targetHour =
      currentHour >= FALLBACK_SCROLL_HOUR && currentHour <= 22 ? currentHour : FALLBACK_SCROLL_HOUR;
    el.scrollTop = Math.max(0, targetHour - 1) * HOUR_ROW_PX;
    // Refaz o auto-scroll quando o conjunto de dias exibidos muda (navegação de semana/dia).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.map(dayKey).join(",")]);

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex border-b bg-muted/40">
        <div className="w-14 shrink-0" />
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={dayKey(day)}
              className="min-w-0 flex-1 border-l p-2 text-center text-xs font-medium text-muted-foreground first:border-l-0"
            >
              <div className="capitalize">{format(day, "EEE", { locale: ptBR })}</div>
              <span
                className={cn(
                  "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full",
                  isToday && "bg-primary font-semibold text-primary-foreground"
                )}
              >
                {format(day, "d")}
              </span>
            </div>
          );
        })}
      </div>

      <UntimedStrip
        days={days}
        itemsByDay={itemsByDay}
        projectById={projectById}
        taskById={taskById}
        onOpenTask={onOpenTask}
        onOpenEvent={onOpenEvent}
        onToggleTaskDone={onToggleTaskDone}
      />

      <div ref={scrollRef} className="flex max-h-[600px] overflow-y-auto">
        <div className="w-14 shrink-0">
          {HOURS.map((h) => (
            <div
              key={h}
              style={{ height: HOUR_ROW_PX }}
              className="border-t px-1 pt-0.5 text-right text-[10px] text-muted-foreground first:border-t-0"
            >
              {`${String(h).padStart(2, "0")}:00`}
            </div>
          ))}
        </div>
        {days.map((day) => {
          const key = dayKey(day);
          const items = itemsByDay.get(key) ?? [];
          // Pontuais saem da entrada do algoritmo de colunas (feature 072): sem isso, N bolinhas
          // no mesmo minuto se "sobrepõem" e voltariam a dividir a largura da coluna do dia.
          // `splitTimedItems`/`layoutTimedItems` continuam genéricos — quem filtra é o chamador.
          const { groups, rest } = groupPointItems(items);
          const { timed } = layoutTimedItems(rest);
          const pointRows = groups.filter((g) => g.startMinutes !== null);
          return (
            <div
              key={key}
              className="relative min-w-0 flex-1 border-l first:border-l-0"
              style={{ height: HOURS.length * HOUR_ROW_PX }}
            >
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="pointer-events-none absolute inset-x-0 border-t"
                  style={{ top: h * HOUR_ROW_PX }}
                />
              ))}
              {/* Alvos de criação (feature 067): uma linha por hora, renderizados **antes** dos
                  blocos posicionados — como todos são absolutos, o que vem depois no DOM fica por
                  cima, então clicar num evento/tarefa nunca vira "criar evento". Fora da ordem de
                  tabulação: 24 alvos × N dias antes do conteúdo quebrariam o teclado, que cria
                  pelo botão "Novo evento" do header. */}
              {onCreateAt &&
                HOURS.map((h) => (
                  <button
                    key={`slot-${h}`}
                    type="button"
                    tabIndex={-1}
                    aria-label={`Novo evento em ${format(day, "d 'de' MMMM 'de' yyyy", {
                      locale: ptBR,
                    })} às ${String(h).padStart(2, "0")}:00`}
                    onClick={() => onCreateAt(day, h)}
                    className="absolute inset-x-0 cursor-pointer"
                    style={{ top: h * HOUR_ROW_PX, height: HOUR_ROW_PX }}
                  />
                ))}
              {timed.map((entry) => {
                const { item } = entry;
                return (
                  <div
                    key={itemKey(item)}
                    className="absolute min-h-[18px] px-0.5"
                    style={{
                      top: `${entry.topPercent}%`,
                      height: `${entry.heightPercent}%`,
                      left: `${entry.leftPercent}%`,
                      width: `${entry.widthPercent}%`,
                    }}
                  >
                    {item.kind === "task" ? (
                      <TimedTaskBlock
                        task={item.task}
                        parentTitle={parentTitleFor(item.task, taskById)}
                        onClick={() => onOpenTask(item.task)}
                      />
                    ) : (
                      <TimedEventBlock
                        event={item.event}
                        projectColor={eventProjectColor(item.event, projectById, taskById)}
                        onClick={() => onOpenEvent(item.event)}
                      />
                    )}
                  </div>
                );
              })}
              {/* Fileiras de bolinhas (feature 072), por último no DOM: como tudo aqui é
                  absoluto, o que vem depois fica por cima, e a bolinha precisa ganhar o clique de
                  qualquer bloco que passe pelo mesmo horário. A fileira em si é
                  `pointer-events-none` — só as bolinhas capturam clique, o resto da linha deixa
                  passar para o bloco ou para o alvo de "novo evento" que estiver embaixo. */}
              {pointRows.map((group) => (
                <div
                  key={`point-${group.startMinutes}`}
                  className="absolute inset-x-0 flex items-center px-0.5"
                  style={{
                    top: `${((group.startMinutes ?? 0) / MINUTES_PER_DAY) * 100}%`,
                    height: POINT_ROW_PX,
                  }}
                >
                  <PointTaskDots
                    items={pointTasksOf(group)}
                    onToggle={onToggleTaskDone}
                    className="pointer-events-none [&>*]:pointer-events-auto"
                    label={`Tarefas pontuais às ${minutesLabel(group.startMinutes ?? 0)} — ${format(
                      day,
                      "d 'de' MMMM",
                      { locale: ptBR }
                    )}`}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
