import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
  subDays,
} from "date-fns";

interface CalendarTask {
  id: string;
  due_date: string | null;
  due_time?: string | null;
  estimated_duration?: number | null;
  /** Dose de medicação (feature 064) — pontual por natureza, ver `isPointTask`. */
  is_medication?: boolean | null;
}

interface CalendarEvent {
  id: string;
  starts_at: string;
  ends_at?: string | null;
}

export type CalendarItem<T extends CalendarTask = CalendarTask, E extends CalendarEvent = CalendarEvent> =
  | { kind: "task"; task: T }
  | { kind: "event"; event: E };

/** Grade de semanas completas (dom→sáb) cobrindo o mês inteiro, com folga do mês anterior/seguinte. */
export function computeMonthGridDays(monthDate: Date): Date[] {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const gridStart = subDays(start, start.getDay());
  const gridEnd = addDays(end, 6 - end.getDay());
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

/** Os 7 dias (dom→sáb) da semana que contém `anyDayInWeek` — visão semanal da Agenda. */
export function computeWeekDays(anyDayInWeek: Date): Date[] {
  const start = subDays(anyDayInWeek, anyDayInWeek.getDay());
  return eachDayOfInterval({ start, end: addDays(start, 6) });
}

function calendarItemTime<T extends CalendarTask, E extends CalendarEvent>(
  item: CalendarItem<T, E>
): string {
  if (item.kind === "task") return item.task.due_time ?? "99:99";
  return format(new Date(item.event.starts_at), "HH:mm");
}

/**
 * Agrupa tarefas (por `due_date`) e eventos de projeto (por `starts_at`, convertido pro dia local
 * — nunca fatia a string ISO crua, que é UTC) num mapa por dia (`yyyy-MM-dd`), cada lista ordenada
 * por horário (tarefas sem `due_time` vão por último). Espera receber listas já filtradas
 * (tarefas de topo, projeto selecionado etc.) — não filtra nada sozinho.
 */
export function groupCalendarItemsByDay<T extends CalendarTask, E extends CalendarEvent>(
  tasks: T[],
  events: E[]
): Map<string, CalendarItem<T, E>[]> {
  const map = new Map<string, CalendarItem<T, E>[]>();

  function push(dayKey: string, item: CalendarItem<T, E>) {
    const list = map.get(dayKey);
    if (list) list.push(item);
    else map.set(dayKey, [item]);
  }

  for (const task of tasks) {
    if (!task.due_date) continue;
    push(task.due_date, { kind: "task", task });
  }
  for (const event of events) {
    const dayKey = format(new Date(event.starts_at), "yyyy-MM-dd");
    push(dayKey, { kind: "event", event });
  }
  for (const list of map.values()) {
    list.sort((a, b) => calendarItemTime(a).localeCompare(calendarItemTime(b)));
  }
  return map;
}

/** Duração aplicada a um item com horário quando não há duração real (`estimated_duration` da
 * tarefa, ou `ends_at` do evento) — só pra dar uma altura mínima visível no bloco da grade de
 * horas, não é um valor "real". */
export const DEFAULT_ITEM_DURATION_MINUTES = 30;

const MINUTES_PER_DAY = 24 * 60;

/** Minutos desde meia-noite (hora local) de um `due_time`/`starts_at` — `due_time` vem como
 * `HH:mm` ou `HH:mm:ss`; só os dois primeiros componentes importam aqui. */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Tarefa **pontual** (feature 072): acontece num instante, não ocupa um intervalo — remédio,
 * trocar lençol, trocar escova. Na Agenda ela não vira bloco retangular, vira bolinha marcável.
 *
 * Duas cláusulas, por motivos diferentes:
 * - `estimated_duration === 0` é o controle explícito do usuário. A partir da 072 vale
 *   **`null` = não sei quanto dura** (bloco de 30 min, como sempre) e **`0` = pontual**. Nenhuma
 *   linha existente muda de significado: até aqui ninguém gravava `0`.
 * - dose de medicação (`is_medication`) **sem** duração informada é pontual por natureza — evita
 *   um `update` em dado de produção só por efeito visual. Com duração informada (> 0) o usuário
 *   mandou o contrário, e o contrário vale.
 *
 * Evento nunca é pontual: `project_event` tem `starts_at`/`ends_at` reais.
 */
export function isPointTask(task: CalendarTask): boolean {
  if (task.estimated_duration === 0) return true;
  return !!task.is_medication && (task.estimated_duration ?? null) === null;
}

/** Uma fileira de bolinhas: todos os itens pontuais que caem no mesmo horário do dia.
 * `startMinutes` é `null` para os pontuais sem `due_time` (faixa "Sem horário"). */
export interface PointItemGroup<T extends CalendarTask = CalendarTask, E extends CalendarEvent = CalendarEvent> {
  startMinutes: number | null;
  items: CalendarItem<T, E>[];
}

/**
 * Separa os itens pontuais de um dia dos demais e agrupa os pontuais por horário — é o que impede
 * três remédios das 08:00 de virarem três retângulos dividindo a largura da coluna pelo algoritmo
 * de colunas de `layoutTimedItems` (que continua genérico: quem filtra é o chamador).
 *
 * As fileiras saem ordenadas por horário, com o grupo sem horário (`startMinutes: null`) primeiro.
 * `rest` preserva a ordem de entrada e é o que segue para `splitTimedItems`/`layoutTimedItems`.
 */
export function groupPointItems<T extends CalendarTask, E extends CalendarEvent>(
  items: CalendarItem<T, E>[]
): { groups: PointItemGroup<T, E>[]; rest: CalendarItem<T, E>[] } {
  const rest: CalendarItem<T, E>[] = [];
  // `null` vira a chave -1 no mapa: chave numérica única, e qualquer horário real é >= 0.
  const NO_TIME_KEY = -1;
  const byStart = new Map<number, CalendarItem<T, E>[]>();

  for (const item of items) {
    if (item.kind !== "task" || !isPointTask(item.task)) {
      rest.push(item);
      continue;
    }
    const key = item.task.due_time ? parseTimeToMinutes(item.task.due_time) : NO_TIME_KEY;
    const list = byStart.get(key);
    if (list) list.push(item);
    else byStart.set(key, [item]);
  }

  const groups = [...byStart.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, groupItems]) => ({
      startMinutes: key === NO_TIME_KEY ? null : key,
      items: groupItems,
    }));

  return { groups, rest };
}

export interface ItemTimeRange {
  /** Minutos desde meia-noite (hora local) em que o item começa. */
  startMinutes: number;
  /** Duração em minutos — real quando disponível, senão `DEFAULT_ITEM_DURATION_MINUTES`. */
  durationMinutes: number;
}

/**
 * Calcula o intervalo (início + duração, em minutos desde meia-noite) de um item pra
 * posicioná-lo na grade de horas. Retorna `null` pra tarefa sem `due_time` — esses itens não
 * têm o que posicionar numa linha do tempo (ficam na faixa "Sem horário", fora do canvas).
 * Eventos sempre têm `starts_at`, então sempre entram no canvas.
 */
export function getItemTimeRange<T extends CalendarTask, E extends CalendarEvent>(
  item: CalendarItem<T, E>
): ItemTimeRange | null {
  if (item.kind === "task") {
    if (!item.task.due_time) return null;
    const startMinutes = parseTimeToMinutes(item.task.due_time);
    // Pontual (feature 072) não ocupa intervalo nenhum: duração 0. Quem desenha é a fileira de
    // bolinhas, que só precisa do `startMinutes` — o default de 30 min existe apenas para dar
    // altura a um bloco retangular, e inventar altura aqui é o que fazia três remédios das 08:00
    // virarem três retângulos concorrentes.
    if (isPointTask(item.task)) return { startMinutes, durationMinutes: 0 };
    const durationMinutes =
      item.task.estimated_duration && item.task.estimated_duration > 0
        ? item.task.estimated_duration
        : DEFAULT_ITEM_DURATION_MINUTES;
    return { startMinutes, durationMinutes };
  }

  const startDate = new Date(item.event.starts_at);
  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  const durationMinutes = item.event.ends_at
    ? Math.max(
        1,
        Math.round((new Date(item.event.ends_at).getTime() - startDate.getTime()) / 60000)
      )
    : DEFAULT_ITEM_DURATION_MINUTES;
  return { startMinutes, durationMinutes };
}

/**
 * Separa os itens de um dia (já ordenados por `groupCalendarItemsByDay`) entre os que têm
 * horário (entram no canvas de horas) e os que não têm (tarefa sem `due_time` — faixa "Sem
 * horário" acima da grade).
 */
export function splitTimedItems<T extends CalendarTask, E extends CalendarEvent>(
  items: CalendarItem<T, E>[]
): { timed: Array<{ item: CalendarItem<T, E>; range: ItemTimeRange }>; untimed: CalendarItem<T, E>[] } {
  const timed: Array<{ item: CalendarItem<T, E>; range: ItemTimeRange }> = [];
  const untimed: CalendarItem<T, E>[] = [];
  for (const item of items) {
    const range = getItemTimeRange(item);
    if (range) timed.push({ item, range });
    else untimed.push(item);
  }
  return { timed, untimed };
}

/** Posição (`top`) e altura (`height`) de um item no canvas de 24h, em % da altura total —
 * clampado pra nunca vazar além da meia-noite seguinte (item que começa às 23:50 com duração de
 * 1h, por ex.). */
export function computeItemPosition(range: ItemTimeRange): { topPercent: number; heightPercent: number } {
  const topPercent = (range.startMinutes / MINUTES_PER_DAY) * 100;
  const rawHeightPercent = (range.durationMinutes / MINUTES_PER_DAY) * 100;
  const heightPercent = Math.min(rawHeightPercent, 100 - topPercent);
  return { topPercent, heightPercent };
}

export interface TimedLayoutItem<T extends CalendarTask, E extends CalendarEvent> {
  item: CalendarItem<T, E>;
  range: ItemTimeRange;
  topPercent: number;
  heightPercent: number;
  /** Posição/largura horizontal (% da coluna do dia) pra dividir itens com horários
   * sobrepostos lado a lado. Sem sobreposição, `leftPercent` é sempre 0 e `widthPercent` 100. */
  leftPercent: number;
  widthPercent: number;
}

/**
 * Resolve sobreposição dos itens com horário de um dia: agrupa itens cujo intervalo se cruza
 * (transitivamente) e, dentro de cada grupo, atribui cada item à primeira "coluna" livre (fim do
 * último item daquela coluna ≤ início do item atual) — coloração gulosa de intervalos, não um
 * layout tipo Google Calendar (não tenta maximizar largura por item nem realocar depois). O
 * grupo todo divide a largura da coluna do dia em partes iguais ao número de colunas usadas.
 */
export function layoutTimedItems<T extends CalendarTask, E extends CalendarEvent>(
  items: CalendarItem<T, E>[]
): { timed: TimedLayoutItem<T, E>[]; untimed: CalendarItem<T, E>[] } {
  const { timed, untimed } = splitTimedItems(items);
  const sorted = [...timed].sort((a, b) => a.range.startMinutes - b.range.startMinutes);

  // Colunas ativas: fim (startMinutes + durationMinutes) do último item colocado em cada coluna.
  const columnEnds: number[] = [];
  const columnIndexByEntry = new Map<(typeof sorted)[number], number>();
  // Índice do grupo de sobreposição corrente por entrada — pra saber, depois, quantas colunas o
  // grupo usou no total.
  const groupIndexByEntry = new Map<(typeof sorted)[number], number>();
  let currentGroup = -1;
  let groupMaxEnd = -Infinity;
  const groupColumnCount: number[] = [];

  for (const entry of sorted) {
    const end = entry.range.startMinutes + entry.range.durationMinutes;
    if (entry.range.startMinutes >= groupMaxEnd) {
      // Nenhum item ativo cruza este início: novo grupo de sobreposição, reseta colunas.
      currentGroup += 1;
      groupColumnCount.push(0);
      columnEnds.length = 0;
      groupMaxEnd = end;
    } else {
      groupMaxEnd = Math.max(groupMaxEnd, end);
    }

    let columnIndex = columnEnds.findIndex((colEnd) => colEnd <= entry.range.startMinutes);
    if (columnIndex === -1) {
      columnIndex = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[columnIndex] = end;
    }
    columnIndexByEntry.set(entry, columnIndex);
    groupIndexByEntry.set(entry, currentGroup);
    groupColumnCount[currentGroup] = Math.max(groupColumnCount[currentGroup], columnIndex + 1);
  }

  const laidOut = sorted.map((entry) => {
    const { topPercent, heightPercent } = computeItemPosition(entry.range);
    const columnIndex = columnIndexByEntry.get(entry)!;
    const columnCount = groupColumnCount[groupIndexByEntry.get(entry)!];
    const widthPercent = 100 / columnCount;
    return {
      item: entry.item,
      range: entry.range,
      topPercent,
      heightPercent,
      leftPercent: columnIndex * widthPercent,
      widthPercent,
    };
  });

  return { timed: laidOut, untimed };
}
