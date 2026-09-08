import { useEffect, useRef, useState } from "react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DollarSign, Plus } from "lucide-react";
import {
  DEFAULT_ITEM_DURATION_MINUTES,
  DRAG_THRESHOLD_PX,
  computeItemPosition,
  eventProjectColor,
  formatRangeLabel,
  groupQuickItemsBySlot,
  layoutTimedItems,
  minutesFromOffset,
  normalizeDragRange,
  splitAgendaItems,
  type CalendarItem,
  type DragRange,
} from "@/domain/tasks";
import type { Project, ProjectEvent, Task } from "@/types/tasks";
import { cn } from "@/lib/utils";
import {
  ConsultationMarker,
  dayKey,
  EventChip,
  isVirtualTask,
  NewAgendaItemMenu,
  newItemLabel,
  STATUS_DOT_CLASS,
  SubtaskLinkIcon,
  TaskChip,
} from "./AgendaGrid";
import { TaskIconBadge } from "./TaskIconBadge";
import { QuickTaskDotRow } from "./QuickTaskDotRow";

/** Altura de cada linha de hora, em px — 24 linhas = altura total do canvas rolável. */
const HOUR_ROW_PX = 56;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
/** Altura da coluna de um dia, em px — a mesma que o `style` da coluna fixa. Serve de rede quando
 * `getBoundingClientRect().height` vem 0 (jsdom, ou o primeiro frame antes do layout): sem ela, um
 * arrasto viraria 00:00–00:15 em vez do horário apontado. */
const COLUMN_HEIGHT_PX = HOURS.length * HOUR_ROW_PX;
/** Hora pra onde a grade rola automaticamente quando a hora atual está fora da janela "útil"
 * (bem cedo ou bem tarde) — mesma ideia de calendários que abrem perto do início do dia útil. */
const FALLBACK_SCROLL_HOUR = 7;

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
  /** Clique numa bolinha de tarefa pontual (feature 070) — alterna concluída/pendente direto, sem
   * abrir diálogo. */
  onToggleQuick: (task: Task) => void;
  /** Abre o modal com tudo do dia (o mesmo do `+N mais` do mês). Presente = o número do dia vira
   * botão e o `+N` da fileira de bolinhas aparece; ausente = número estático e fileira sem limite
   * (é o caso do drill-down "Focar dia" do Gantt, que não tem esse modal). */
  onOpenDay?: (dayKey: string) => void;
  /** Feature 103 — o `+` do cabeçalho da coluna abre o menu "Evento/Tarefa" já com aquele dia.
   * O par só é desenhado quando **os dois** existem; ausentes, o cabeçalho fica como era (o Gantt
   * usa esta grade só para olhar, não para criar). */
  onNewEvent?: (dayKey: string) => void;
  onNewTask?: (dayKey: string) => void;
  /**
   * Feature 104 — o usuário desenhou uma faixa de horário arrastando no fundo da coluna do dia
   * (ou deu um clique simples, que vale como faixa padrão de {@link DEFAULT_ITEM_DURATION_MINUTES}
   * minutos). Quem decide o que fazer com ela é o call site: a `AgendaGrid` abre o menu
   * "Evento/Tarefa" ancorado na faixa.
   *
   * **Ausente = o gesto não existe**, mesmo padrão "presença de prop = recurso aparece" de
   * `onOpenDay`/`onNewEvent` — é o que mantém o drill-down "Focar dia" do Gantt, que usa esta grade
   * só para olhar, exatamente como era.
   */
  onCreateInRange?: (range: { dayKey: string } & DragRange) => void;
}

/** Seleção de faixa em andamento numa coluna (feature 104). */
interface AgendaDragState {
  dayKey: string;
  pointerId: number;
  /** `clientY` do `pointerdown`, só para medir o limiar de {@link DRAG_THRESHOLD_PX}. */
  originClientY: number;
  /** Minuto do dia onde o gesto começou — o arrasto pode ir para cima **ou** para baixo dele. */
  anchorMinutes: number;
  /** Minuto do dia sob o ponteiro agora. */
  pointerMinutes: number;
  /** Passou do limiar: virou arrasto de verdade (fantasma na tela, ponteiro capturado). Abaixo
   * dele o gesto ainda é um clique. */
  armed: boolean;
  /** Toque: nunca arma. A grade rola verticalmente e capturar o gesto mataria o scroll no celular
   * — o toque simples continua valendo como clique degenerado. */
  touch: boolean;
}

function itemKey(item: CalendarItem<Task, ProjectEvent>): string {
  return item.kind === "task" ? item.task.id : item.event.id;
}

/** `HH:mm` de um slot de bolinhas (minutos desde meia-noite) — só alimenta o rótulo acessível da
 * fileira; a posição vertical vem do `topPercent` do próprio slot. */
function formatSlotTime(startMinutes: number): string {
  const h = Math.floor(startMinutes / 60);
  const m = startMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Título da tarefa-mãe de `task`, quando ela é uma subtarefa (`parent_task_id` presente) — só
 * pra alimentar o tooltip do `SubtaskLinkIcon`, não afeta o layout/posicionamento (feature 048). */
function parentTitleFor(task: Task, taskById: Map<string, Task>): string | undefined {
  return task.parent_task_id ? taskById.get(task.parent_task_id)?.title : undefined;
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
 * mês/semana (`TaskChip`/`EventChip`). Tarefa pontual sem horário continua pontual: vira uma
 * fileira de bolinhas no topo da faixa, não um chip de largura inteira por linha (feature 070).
 * Some quando nenhum dia visível tem item sem horário. */
function UntimedStrip({
  days,
  itemsByDay,
  projectById,
  taskById,
  onOpenTask,
  onOpenEvent,
  onToggleQuick,
  onOpenDay,
}: Pick<
  AgendaHourGridProps,
  | "days"
  | "itemsByDay"
  | "projectById"
  | "taskById"
  | "onOpenTask"
  | "onOpenEvent"
  | "onToggleQuick"
  | "onOpenDay"
>) {
  const byDay = days.map((day) => {
    const { quick, untimed } = splitAgendaItems(itemsByDay.get(dayKey(day)) ?? []);
    return { untimed, quickUntimed: quick.filter((task) => !task.due_time) };
  });
  const hasAny = byDay.some(({ untimed, quickUntimed }) => untimed.length > 0 || quickUntimed.length > 0);
  if (!hasAny) return null;

  return (
    <div className="flex border-b bg-muted/20">
      <div className="w-14 shrink-0 border-r px-1 py-1.5 text-right text-[10px] text-muted-foreground">
        Sem horário
      </div>
      {days.map((day, i) => {
        const { untimed: items, quickUntimed } = byDay[i];
        return (
          <div key={dayKey(day)} className="min-w-0 flex-1 space-y-0.5 border-l p-1 first:border-l-0">
            <QuickTaskDotRow
              tasks={quickUntimed}
              onToggle={onToggleQuick}
              onOverflow={onOpenDay ? () => onOpenDay(dayKey(day)) : undefined}
              label="Tarefas pontuais sem horário"
            />
            {items.map((item) =>
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
                  projectColor={eventProjectColor(item.event.project_id, projectById)}
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

/**
 * Bloco fantasma do arrasto (feature 104): a faixa que **vai** ser criada, desenhada enquanto o
 * ponteiro se move, para o usuário ver o horário antes de soltar. Translúcido e
 * `pointer-events-none` — ele não pode roubar o `pointermove`/`pointerup` da própria coluna que o
 * desenha. `aria-hidden` porque é o eco visual de um gesto de ponteiro, não conteúdo: quem usa
 * teclado cria pelo botão "Novo" ou pelo `+` do dia (feature 103).
 */
function DragGhost({ range }: { range: DragRange }) {
  const { topPercent, heightPercent } = computeItemPosition(range);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-20 overflow-hidden rounded-md border border-primary/70 bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-primary"
      style={{ top: `${topPercent}%`, height: `${heightPercent}%` }}
    >
      {formatRangeLabel(range)}
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
  onToggleQuick,
  onOpenDay,
  onNewEvent,
  onNewTask,
  onCreateInRange,
}: AgendaHourGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  /** Feature 104 — seleção de faixa em andamento; `null` = ninguém arrastando. */
  const [drag, setDrag] = useState<AgendaDragState | null>(null);
  /** Coluna que capturou o ponteiro, para conseguir soltá-lo de qualquer saída do gesto — inclusive
   * do `Escape`, que não tem evento de ponteiro em mãos. Ponteiro capturado e esquecido trava o
   * resto da página. */
  const captureRef = useRef<{ el: HTMLElement; pointerId: number } | null>(null);
  const dragEnabled = !!onCreateInRange;

  /** Minuto do dia sob um `clientY`, dentro da coluna `el`. */
  function columnMinutes(el: HTMLElement, clientY: number): number {
    const rect = el.getBoundingClientRect();
    return minutesFromOffset(clientY - rect.top, rect.height || COLUMN_HEIGHT_PX);
  }

  function releaseCapture() {
    const held = captureRef.current;
    captureRef.current = null;
    if (held?.el.hasPointerCapture?.(held.pointerId)) {
      held.el.releasePointerCapture(held.pointerId);
    }
  }

  /** Sai do gesto sem criar nada. */
  function cancelDrag() {
    releaseCapture();
    setDrag(null);
  }

  /** `Escape` durante o arrasto cancela: some o fantasma e nada é criado. Cancelar tem de ser mais
   * fácil que desfazer, porque não há desfazer. O `pointerup` que vier depois encontra o estado já
   * limpo e não cria nada. */
  useEffect(() => {
    if (!drag) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancelDrag();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  function handleColumnPointerDown(e: React.PointerEvent<HTMLDivElement>, key: string) {
    // Sem a prop o gesto simplesmente não existe (drill-down do Gantt).
    if (!onCreateInRange) return;
    // Só o botão primário desenha faixa — o direito é menu de contexto do navegador.
    if (e.button !== 0) return;
    const minutes = columnMinutes(e.currentTarget, e.clientY);
    setDrag({
      dayKey: key,
      pointerId: e.pointerId,
      originClientY: e.clientY,
      anchorMinutes: minutes,
      pointerMinutes: minutes,
      armed: false,
      touch: e.pointerType === "touch",
    });
  }

  function handleColumnPointerMove(e: React.PointerEvent<HTMLDivElement>, key: string) {
    if (!drag || drag.dayKey !== key || drag.pointerId !== e.pointerId) return;
    if (!drag.armed) {
      if (drag.touch) return;
      // Abaixo do limiar ainda é clique: um tremor de mouse não pode virar uma faixa de 15 min.
      if (Math.abs(e.clientY - drag.originClientY) < DRAG_THRESHOLD_PX) return;
      // Captura só depois de armar, para o arrasto continuar valendo se o ponteiro sair da coluna.
      e.currentTarget.setPointerCapture?.(e.pointerId);
      captureRef.current = { el: e.currentTarget, pointerId: e.pointerId };
    }
    const minutes = columnMinutes(e.currentTarget, e.clientY);
    setDrag((prev) =>
      prev && prev.pointerId === e.pointerId
        ? { ...prev, armed: true, pointerMinutes: minutes }
        : prev
    );
  }

  function handleColumnPointerUp(e: React.PointerEvent<HTMLDivElement>, key: string) {
    // Soltar o ponteiro é sempre o fim do gesto, mesmo quando não há nada a criar (o `Escape` pode
    // já ter limpado o estado) — por isso a liberação vem antes de qualquer guarda.
    releaseCapture();
    if (!drag || drag.pointerId !== e.pointerId) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    // Limpa o estado **antes** de qualquer decisão de criar: soltar o ponteiro encerra o gesto
    // sempre, inclusive quando o `pointerup` chega numa coluna que não é a do `pointerdown` (semana
    // + ponteiro não capturado). Sem isso o fantasma ficaria pendurado sem dono.
    setDrag(null);
    if (drag.dayKey !== key) return;
    // Soltar fora da coluna (para o lado, em cima de outro dia ou fora da grade) cancela: criar num
    // horário adivinhado é pior do que não criar, porque não há desfazer. Sair pela borda de cima ou
    // de baixo continua valendo — ali o minuto é conhecido, só clampado no fim do dia.
    if (rect.width > 0 && (e.clientX < rect.left || e.clientX > rect.right)) return;
    const pointerMinutes = drag.armed
      ? columnMinutes(el, e.clientY)
      : // Clique sem mover: o caso degenerado do mesmo gesto, faixa padrão a partir do slot clicado.
        drag.anchorMinutes + DEFAULT_ITEM_DURATION_MINUTES;
    onCreateInRange?.({
      dayKey: key,
      ...normalizeDragRange(drag.anchorMinutes, pointerMinutes),
    });
  }

  function handleColumnPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    // Rolagem por toque, ponteiro perdido, janela indo pro fundo: some o fantasma, nada é criado.
    cancelDrag();
  }

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
              className="group min-w-0 flex-1 border-l p-2 text-center text-xs font-medium text-muted-foreground first:border-l-0"
            >
              <div className="capitalize">{format(day, "EEE", { locale: ptBR })}</div>
              {/* O número do dia vira o caminho de "ver/editar tudo desse dia" (feature 070) — as
                  bolinhas só concluem/reabrem, então precisa haver outra porta para o diálogo. */}
              {onOpenDay ? (
                <button
                  type="button"
                  onClick={() => onOpenDay(dayKey(day))}
                  aria-label={`Ver tudo do dia ${format(day, "d")}`}
                  className={cn(
                    "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-muted",
                    isToday && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {format(day, "d")}
                </button>
              ) : (
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full",
                    isToday && "bg-primary font-semibold text-primary-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
              )}
              {/* Feature 103: mesma afordância do `+` da célula do mês, aqui no cabeçalho da
                  coluna — é o único lugar da visão semana/dia que pertence ao dia inteiro. */}
              {onNewEvent && onNewTask && (
                <NewAgendaItemMenu
                  onPickEvent={() => onNewEvent(dayKey(day))}
                  onPickTask={() => onNewTask(dayKey(day))}
                  trigger={
                    <button
                      type="button"
                      aria-label={newItemLabel(day)}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded align-middle opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  }
                />
              )}
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
        onToggleQuick={onToggleQuick}
        onOpenDay={onOpenDay}
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
          // Pontuais saem antes do `layoutTimedItems` de propósito: sem duração pra ocupar coluna,
          // três remédios das 8h virariam três colunas estreitas — o oposto de "uma na frente da
          // outra" (feature 070).
          const { timed: timedEntries, quick } = splitAgendaItems(items);
          const { timed } = layoutTimedItems(timedEntries.map((entry) => entry.item));
          const quickSlots = groupQuickItemsBySlot(quick).filter((slot) => slot.topPercent != null);
          return (
            <div
              key={key}
              // O canvas de um dia não tem texto próprio (é fundo), então o gesto da 104 precisa de
              // um alvo estável para os testes de ponteiro — não há papel ARIA que sirva.
              data-testid={`day-column-${key}`}
              className={cn(
                "relative min-w-0 flex-1 border-l first:border-l-0",
                // Feature 104: o fundo da coluna vira canvas de seleção. `select-none` evita que o
                // arrasto pinte texto no meio do caminho; o cursor anuncia que ali se desenha.
                dragEnabled && "cursor-cell select-none"
              )}
              style={{ height: COLUMN_HEIGHT_PX }}
              onPointerDown={(e) => handleColumnPointerDown(e, key)}
              onPointerMove={(e) => handleColumnPointerMove(e, key)}
              onPointerUp={(e) => handleColumnPointerUp(e, key)}
              onPointerCancel={handleColumnPointerCancel}
            >
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="pointer-events-none absolute inset-x-0 border-t"
                  style={{ top: h * HOUR_ROW_PX }}
                />
              ))}
              {drag?.dayKey === key && drag.armed && (
                <DragGhost range={normalizeDragRange(drag.anchorMinutes, drag.pointerMinutes)} />
              )}
              {timed.map((entry) => {
                const { item } = entry;
                return (
                  <div
                    key={itemKey(item)}
                    className="absolute min-h-[18px] px-0.5"
                    // Feature 104: arrastar em cima de uma reunião é tentar mexer nela, não criar
                    // outra. Sem isto, o `pointerdown` do bloco subiria para a coluna e o clique no
                    // item viraria também uma faixa nova.
                    onPointerDown={(e) => e.stopPropagation()}
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
                        projectColor={eventProjectColor(item.event.project_id, projectById)}
                        onClick={() => onOpenEvent(item.event)}
                      />
                    )}
                  </div>
                );
              })}
              {quickSlots.map((slot) => (
                <div
                  key={slot.startMinutes}
                  // `z-10` põe a fileira por cima das colunas de blocos: o custo assumido é que uma
                  // tarefa com duração começando no mesmo minuto tem a primeira linha coberta.
                  className="absolute inset-x-0 z-10 px-0.5"
                  // Mesma regra dos blocos (feature 104): a bolinha é um item existente, não fundo
                  // livre — tocar nela não pode iniciar seleção de faixa.
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{ top: `${slot.topPercent}%` }}
                >
                  <QuickTaskDotRow
                    tasks={slot.items}
                    onToggle={onToggleQuick}
                    onOverflow={onOpenDay ? () => onOpenDay(key) : undefined}
                    label={`Tarefas pontuais às ${formatSlotTime(slot.startMinutes!)}`}
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
