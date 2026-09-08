/**
 * Matemática do gesto de arrastar na grade de horas da Agenda (feature 104) — tipo Google Agenda:
 * o usuário desenha a faixa de horário com o próprio ponteiro e solta para criar evento/tarefa ali.
 *
 * Mora no domínio, e não no componente, pelo mesmo motivo de `layoutTimedItems`: converter pixel em
 * minuto é regra (snap, duração mínima, clamp no fim do dia), não desenho. O componente só entrega
 * offsets em pixels e a altura total da coluna; tudo aqui é puro e testável sem DOM.
 */

/** Minutos desde a meia-noite até o fim do dia — o eixo inteiro da coluna de um dia. */
export const MINUTES_PER_DAY = 24 * 60;

/**
 * Granularidade do arrasto. Sem snap, um arrasto de mouse produz "09:07 – 10:23" e o usuário
 * conserta no formulário toda vez — o gesto perderia a graça.
 */
export const SNAP_MINUTES = 15;

/** Menor faixa que o gesto consegue desenhar: um arrasto de 2px não pode virar um evento de 1 min. */
export const MIN_DRAG_DURATION_MINUTES = 15;

/**
 * Movimento (em px) a partir do qual o `pointerdown` deixa de ser clique e vira arrasto. Abaixo
 * dele é clique — senão um tremor de mouse vira uma faixa de 15 min e o clique degenerado (faixa
 * padrão de 30 min) nunca aconteceria.
 */
export const DRAG_THRESHOLD_PX = 4;

function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.min(MINUTES_PER_DAY, Math.max(0, minutes));
}

/**
 * Offset vertical (px, a partir do topo da coluna do dia) → minutos desde a meia-noite, com snap ao
 * múltiplo de `snapMinutes` mais próximo e clamp em `[0, 1440]`.
 *
 * Altura zero devolve 0 em vez de `NaN`: em jsdom (e no primeiro frame antes do layout) a coluna
 * mede 0px, e um `NaN` vazaria para `top`/`height` do fantasma e para o horário gravado.
 */
export function minutesFromOffset(
  offsetPx: number,
  totalPx: number,
  snapMinutes: number = SNAP_MINUTES
): number {
  if (!Number.isFinite(offsetPx) || !Number.isFinite(totalPx) || totalPx <= 0) return 0;
  const raw = (offsetPx / totalPx) * MINUTES_PER_DAY;
  const step = snapMinutes > 0 ? snapMinutes : 1;
  return clampMinutes(Math.round(raw / step) * step);
}

export interface DragRange {
  /** Minutos desde a meia-noite em que a faixa começa. */
  startMinutes: number;
  /** Duração da faixa, em minutos — nunca menor que `MIN_DRAG_DURATION_MINUTES`. */
  durationMinutes: number;
}

/**
 * Âncora (onde o `pointerdown` caiu) + posição atual do ponteiro → faixa normalizada.
 *
 * - **Arrasto invertido** (de baixo para cima) é válido: quem arrasta "das 11h para as 9h" quer
 *   09:00–11:00, não um erro.
 * - **Arrasto de zero** (ou abaixo do mínimo) vira `MIN_DRAG_DURATION_MINUTES`.
 * - **Nunca passa das 24:00**: se a faixa estouraria o fim do dia, o início encosta para trás.
 */
export function normalizeDragRange(anchorMinutes: number, pointerMinutes: number): DragRange {
  const a = clampMinutes(anchorMinutes);
  const b = clampMinutes(pointerMinutes);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  const durationMinutes = Math.min(
    MINUTES_PER_DAY,
    Math.max(MIN_DRAG_DURATION_MINUTES, end - start)
  );
  const startMinutes = Math.max(0, Math.min(start, MINUTES_PER_DAY - durationMinutes));
  return { startMinutes, durationMinutes };
}

function formatMinutesOfDay(minutes: number): string {
  const total = clampMinutes(minutes);
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Rótulo `"09:00 – 10:30"` do bloco fantasma — o que o usuário lê antes de soltar. Uma faixa que
 * termina exatamente no fim do dia sai como `"23:00 – 24:00"`: `24:00` é o fim do eixo, e
 * escrever `00:00` ali diria "termina antes de começar".
 */
export function formatRangeLabel({ startMinutes, durationMinutes }: DragRange): string {
  const start = clampMinutes(startMinutes);
  const end = clampMinutes(start + durationMinutes);
  return `${formatMinutesOfDay(start)} – ${formatMinutesOfDay(end)}`;
}

/** `HH:mm` de um ponto do eixo — o que os formulários de evento/tarefa esperam (`<input type="time">`,
 * `due_time`). Fim de dia vira `23:59` porque `24:00` não é hora válida num input. */
export function minutesToTimeInput(minutes: number): string {
  return formatMinutesOfDay(Math.min(clampMinutes(minutes), MINUTES_PER_DAY - 1));
}
