import type { TaskPriority } from "@/types/tasks";

/** Opções do seletor de prioridade (`TaskPriorityField`) e dos chips de filtro rápido da Lista. */
export const PRIORITY_OPTIONS: [TaskPriority | null, string][] = [
  [null, "Nenhuma"],
  ["low", "Baixa"],
  ["medium", "Média"],
  ["high", "Alta"],
];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

/** Rótulo da faixa "sem prioridade" do painel "Por prioridade" (feature 082). Os chips de filtro
 * da Lista continuam dizendo "Nenhuma" (`PRIORITY_OPTIONS`) — são filtros, não faixas. */
export const NO_PRIORITY_LABEL = "Sem prioridade";

/** Rótulo por extenso de uma prioridade, incluindo a ausência dela. A feature 082 tirou esse texto
 * da tela do painel "Por prioridade" (só a bandeirinha diz), mas ele continua vivo como nome
 * acessível/tooltip — tirar o texto não pode tirar a informação de quem usa leitor de tela. */
export function priorityLabel(priority: TaskPriority | null | undefined): string {
  return priority ? PRIORITY_LABELS[priority] : NO_PRIORITY_LABEL;
}

/** O que a escrita em lote de `updateTasksSortOrder` recebe: a faixa inteira renumerada. */
export interface TaskSortOrderPair {
  id: string;
  sort_order: number;
}

/** Renumera a faixa de 0..n-1 na ordem em que ela está. A faixa inteira é reescrita de propósito
 * (feature 082, Decisões): uma faixa de prioridade dentro de **um projeto** é pequena o bastante
 * para caber numa escrita só, o que dispensa índice fracionário e rebalanceamento. */
function renumberBand(tasks: readonly { id: string }[]): TaskSortOrderPair[] {
  return tasks.map((task, index) => ({ id: task.id, sort_order: index }));
}

/**
 * Move `activeId` para a posição de `overId` **dentro da mesma faixa** e devolve a faixa inteira
 * renumerada de 0..n-1 (feature 082).
 *
 * Devolve `[]` — nenhuma escrita — quando o arraste não mudou nada: soltar em cima de si mesmo,
 * soltar de volta no mesmo lugar, ou ids que não pertencem à faixa (o `over` do `@dnd-kit` pode ser
 * qualquer droppable, inclusive de outra faixa; quem trata esse caso é o call site).
 *
 * `tasks` precisa vir na ordem em que a faixa está **na tela** — é a ordem que o usuário vê que ele
 * está reorganizando, não a ordem crua do servidor.
 */
export function reorderWithinBand(
  tasks: readonly { id: string }[],
  activeId: string,
  overId: string
): TaskSortOrderPair[] {
  if (activeId === overId) return [];
  const from = tasks.findIndex((task) => task.id === activeId);
  const to = tasks.findIndex((task) => task.id === overId);
  if (from === -1 || to === -1) return [];

  const next = [...tasks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return renumberBand(next);
}

/**
 * Insere `task` na faixa **de destino** (arraste entre faixas) e devolve essa faixa renumerada de
 * 0..n-1 (feature 082). `overId` é a tarefa sobre a qual se soltou; `null` (soltou na faixa, não em
 * cima de uma linha) manda para o fim.
 *
 * Quem muda a prioridade é o call site — aqui só se resolve a **posição**: `@dnd-kit` entrega o
 * alvo de graça e o Kanban já usa esse mesmo gesto para status, então soltar na faixa vizinha
 * mudar a prioridade é o comportamento consistente do gesto (feature 082, Decisões).
 */
export function reorderIntoBand<T extends { id: string }>(
  bandTasks: readonly T[],
  task: T,
  overId: string | null
): TaskSortOrderPair[] {
  const without = bandTasks.filter((item) => item.id !== task.id);
  const at = overId ? without.findIndex((item) => item.id === overId) : -1;
  const next = [...without];
  if (at === -1) next.push(task);
  else next.splice(at, 0, task);
  return renumberBand(next);
}
