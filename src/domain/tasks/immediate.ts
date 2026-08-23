import { addMinutes } from "date-fns";
import { formatLocalIsoDate } from "@/lib/dates";
import { DEFAULT_ITEM_DURATION_MINUTES } from "./calendar";

/** Só os campos de que o cálculo precisa — mantém a função pura testável sem montar uma `Task`
 * inteira e deixa claro que nada mais da tarefa influencia o prazo. */
export interface ImmediateScheduleInput {
  estimated_duration?: number | null;
  is_quick?: boolean | null;
}

export interface ImmediateSchedule {
  /** `YYYY-MM-DD` local — pode ser o **dia seguinte** quando a duração atravessa a meia-noite. */
  due_date: string;
  /** `HH:mm` local, sempre com dois dígitos em cada componente. */
  due_time: string;
  /** Minutos usados como padrão quando a tarefa não tinha `estimated_duration` (`null` quando a
   * duração real foi usada, ou quando a tarefa é pontual e não soma nada). Quem chama usa isso
   * pra avisar no toast que o prazo saiu de um palpite, não de um dado do usuário. */
  usedFallbackMinutes: number | null;
  /** Minutos de fato somados a `now` (0 em tarefa pontual). */
  minutes: number;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Prazo do botão "Imediatamente" (feature 078): a tarefa começa **agora**, então o prazo é
 * "agora + a duração estimada" — o instante em que ela deveria estar pronta.
 *
 * Três casos, nesta ordem:
 * - **Tarefa pontual** (`is_quick`, feature 070): prazo = agora exato. Ela é um instante por
 *   definição; somar qualquer coisa inventaria uma duração que a própria flag nega.
 * - **Com `estimated_duration`** (minutos): agora + essa duração.
 * - **Sem duração**: agora + `DEFAULT_ITEM_DURATION_MINUTES` (o mesmo padrão que a agenda já usa
 *   como duração implícita), sinalizado em `usedFallbackMinutes` — a ação é sobre velocidade, não
 *   dá pra bloquear por falta de duração.
 *
 * A virada de dia é caso normal, não borda: começar 23h50 uma tarefa de 30 min devolve o dia
 * seguinte às 00h20.
 */
export function computeImmediateSchedule(
  task: ImmediateScheduleInput,
  now: Date = new Date()
): ImmediateSchedule {
  const duration = task.estimated_duration;
  const hasDuration = typeof duration === "number" && duration > 0;
  const isQuick = !!task.is_quick;

  const minutes = isQuick ? 0 : hasDuration ? duration : DEFAULT_ITEM_DURATION_MINUTES;
  const usedFallbackMinutes = isQuick || hasDuration ? null : DEFAULT_ITEM_DURATION_MINUTES;

  const due = addMinutes(now, minutes);
  return {
    due_date: formatLocalIsoDate(due),
    due_time: `${pad(due.getHours())}:${pad(due.getMinutes())}`,
    usedFallbackMinutes,
    minutes,
  };
}
