import type { NoteDraft, NoteKind, NoteLinkDraft } from "@/types/notes";
import type { Task } from "@/types/tasks";

/**
 * Nota/canvas criados **a partir de uma tarefa** (feature 084) — o que a nota nasce sabendo.
 *
 * Módulo puro, sem I/O e sem React: quem grava é `createNote`/`addNoteLink`
 * (`src/api/notes/`). O vínculo em si é o `note_link` polimórfico da 056 (`entity_type: "task"`,
 * que já está no `check` do banco) — não há coluna nova em `task`, de propósito: uma
 * `task.note_id` seria um segundo mecanismo de vínculo tarefa↔nota concorrendo com o que já
 * existe.
 */

/**
 * O mínimo que uma tarefa precisa ter para virar nota. Estrutural em vez de `Task` inteira porque
 * é só o que os dois builders leem — e porque um teste não deveria precisar montar as ~30 colunas
 * de `Task` para checar de onde veio o `project_id`.
 */
export type TaskNoteSource = Pick<Task, "id" | "title" | "project_id">;

/**
 * O rascunho da nota (ou canvas) de uma tarefa.
 *
 * - `title` é o título da tarefa **cru**: quem corta em `NOTE_TITLE_MAX` e troca vazio por
 *   "Sem título" é `normalizeNoteDraft`, dentro de `createNote`. Repetir o corte aqui criaria dois
 *   lugares para a mesma regra.
 * - `project_id` vem da tarefa — é o "projeto já preenchido" do pedido. Tarefa sem projeto vira
 *   nota solta (`null`), que é caso normal no módulo de Notas, não erro.
 * - `canvas_data` só acompanha canvas, com a cena vazia (`{ elements: [] }`) — o mesmo payload que
 *   `Notes.tsx` monta ao criar um canvas do zero (058), para o editor abrir numa tela em branco de
 *   verdade em vez de `null`.
 */
export function buildTaskNoteDraft(
  task: TaskNoteSource,
  kind: NoteKind = "markdown"
): NoteDraft {
  return {
    title: task.title,
    content: "",
    project_id: task.project_id ?? null,
    folder_id: null,
    kind,
    canvas_data: kind === "canvas" ? { elements: [] } : null,
  };
}

/**
 * O vínculo `note_link` entre a nota recém-criada e a tarefa que a originou.
 *
 * `label` é o título da tarefa **congelado** no momento do vínculo (regra da 056): o painel de
 * vínculos mostra o rótulo sem ir buscar a entidade, e uma tarefa apagada depois vira "referência
 * removida" em vez de sumir da lista.
 */
export function buildTaskNoteLinkDraft(
  noteId: string,
  task: TaskNoteSource
): NoteLinkDraft {
  return {
    note_id: noteId,
    entity_type: "task",
    entity_id: task.id,
    label: task.title,
  };
}
