/**
 * Vínculo de um evento de agenda (feature 066). Um evento é de projeto, de tarefa ou avulso — e
 * nunca dos dois primeiros ao mesmo tempo: a check constraint `project_event_single_link` garante
 * isso no banco, e `isEventLinkValid` espelha a regra em TS para a UI barrar antes do insert.
 *
 * Regras puras, sem I/O — o `taskById` chega pronto de quem já carregou as tarefas.
 */

export type EventLinkKind = "project" | "task" | "none";

/** Só o que interessa do evento aqui: os dois campos de vínculo. */
export interface EventLinkLike {
  project_id?: string | null;
  task_id?: string | null;
}

/** Só o que interessa da tarefa aqui: o projeto a que ela pertence (pode ser nenhum). */
export interface EventLinkTaskLike {
  project_id?: string | null;
}

/**
 * Classifica o vínculo. Se os dois campos vierem preenchidos — estado que o banco recusa e que só
 * apareceria por dado forjado —, o projeto ganha a desempate e `isEventLinkValid` reprova a linha.
 */
export function eventLinkKind(event: EventLinkLike): EventLinkKind {
  if (event.project_id) return "project";
  if (event.task_id) return "task";
  return "none";
}

/**
 * Projeto ao qual o evento pertence, para cor/filtro na agenda.
 *
 * O evento de tarefa **não** guarda `project_id` de propósito: o projeto é derivado da tarefa toda
 * vez, senão mover a tarefa de projeto deixaria o evento apontando para o projeto antigo. Tarefa
 * fora do mapa (ainda não carregada, ou apagada) resolve para `null` em vez de lançar — a agenda
 * degrada para a cor neutra em vez de quebrar a renderização inteira.
 */
export function resolveEventProjectId(
  event: EventLinkLike,
  taskById: Map<string, EventLinkTaskLike>
): string | null {
  if (event.project_id) return event.project_id;
  if (!event.task_id) return null;
  return taskById.get(event.task_id)?.project_id ?? null;
}

/** Espelha `project_event_single_link`: no máximo um vínculo preenchido. */
export function isEventLinkValid(event: EventLinkLike): boolean {
  return !(event.project_id && event.task_id);
}
