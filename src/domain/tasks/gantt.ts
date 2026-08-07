import { formatLocalIsoDate } from "@/lib/dates";

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return formatLocalIsoDate(dt);
}

function daysBetween(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split("-").map(Number);
  const [by, bm, bd] = bIso.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

export interface GanttTask {
  id: string;
  start_date?: string | null;
  due_date: string | null;
}

/**
 * Lista de dias (ISO, um por coluna) cobrindo todas as tarefas com data, com folga de
 * `paddingDays` em cada ponta. Tarefas sem `start_date` nem `due_date` são ignoradas.
 */
export function computeGanttDays(tasks: GanttTask[], paddingDays = 2): string[] {
  const dated = tasks.filter((t) => t.start_date || t.due_date);
  if (dated.length === 0) return [];

  let min = dated[0].start_date ?? dated[0].due_date!;
  let max = dated[0].due_date ?? dated[0].start_date!;
  for (const t of dated) {
    const s = t.start_date ?? t.due_date!;
    const e = t.due_date ?? t.start_date!;
    if (s < min) min = s;
    if (e > max) max = e;
  }

  min = addDays(min, -paddingDays);
  max = addDays(max, paddingDays);
  const totalDays = daysBetween(min, max) + 1;
  const days: string[] = [];
  for (let i = 0; i < totalDays; i++) days.push(addDays(min, i));
  return days;
}

export interface GanttBar {
  taskId: string;
  startCol: number;
  span: number;
}

/**
 * Posição da barra de uma tarefa dentro de `days` (coluna inicial 1-indexada + número de dias
 * que ela cobre). `null` se a tarefa não tem data ou cai fora do intervalo calculado.
 */
export function computeGanttBar(task: GanttTask, days: string[]): GanttBar | null {
  if (!task.start_date && !task.due_date) return null;
  const start = task.start_date ?? task.due_date!;
  const end = task.due_date ?? task.start_date!;
  const startCol = days.indexOf(start) + 1;
  if (startCol === 0) return null;
  const span = Math.max(1, daysBetween(start, end) + 1);
  return { taskId: task.id, startCol, span };
}
