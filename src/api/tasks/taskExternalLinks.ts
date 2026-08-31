import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type { TaskExternalLink, TaskExternalLinkDraft } from "@/types/tasks";

/**
 * I/O de `public.task_external_link` (feature 085) — os vários links externos de uma tarefa, cada
 * um com o comentário livre do usuário.
 *
 * Toda função filtra por `user_id` explicitamente, mesmo com RLS ligada: a RLS é a última linha de
 * defesa, não a primeira, e o filtro é o que faz a consulta usar o índice
 * `task_external_link_user_task_idx`, que começa por `user_id`.
 */

/** Os links de uma tarefa, na ordem manual (`position`) — a que o formulário edita e a que decide
 * quais links viram chip no card. */
export async function fetchExternalLinksForTask(
  taskId: string
): Promise<TaskExternalLink[]> {
  const byTask = await fetchExternalLinksForTasks([taskId]);
  return byTask[taskId] ?? [];
}

/**
 * Os links de **várias** tarefas de uma vez, agrupados por `task_id` — no molde de
 * `fetchNotesLinkedToMany` (`src/api/notes/noteLinks.ts`).
 *
 * Existe porque cada card da Lista/Kanban mostra os chips dos próprios links: uma chamada por card
 * seria uma ida ao banco por tarefa na abertura da página. Aqui é **uma** consulta,
 * independentemente de quantas tarefas. `fetchExternalLinksForTask` é o caso de uma tarefa só,
 * delegando para cá — implementação única.
 *
 * Tarefa sem link **não** aparece no mapa (sem chave, não com array vazio): quem consome faz
 * `map[id] ?? []`, e a ausência é a resposta certa para "não há chip".
 */
export async function fetchExternalLinksForTasks(
  taskIds: readonly string[]
): Promise<Record<string, TaskExternalLink[]>> {
  const ids = [...new Set(taskIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_external_link")
    .select("*")
    .eq("user_id", userId)
    .in("task_id", ids)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);

  const grouped: Record<string, TaskExternalLink[]> = {};
  for (const link of data ?? []) {
    (grouped[link.task_id] ??= []).push(link);
  }
  return grouped;
}

/** `comment` vazio vira `null` — a coluna é opcional e `''` só ocuparia espaço fingindo que há
 * anotação. Mesma regra que `addNoteLink` aplica ao `label`. */
function normalizeComment(comment: string | null | undefined): string | null {
  const trimmed = comment?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Grava a lista **inteira** de links de uma tarefa num caminho só: apaga os que sumiram, insere os
 * que entraram e atualiza `comment`/`position` dos que ficaram — devolvendo a lista final, já na
 * ordem.
 *
 * Por que "a lista inteira" e não um endpoint por operação: a seção do formulário é editada como
 * bloco (adicionar, remover e reordenar acontecem antes de qualquer save) e o `position` de todos
 * depende da lista final. Um `delete`+`insert` cego seria mais simples, mas trocaria o `id` e o
 * `created_at` de um link que o usuário só arrastou de lugar.
 *
 * A identidade de um link é a **URL** (é o `unique (task_id, url)` do banco): trocar a URL de uma
 * linha é remover um link e criar outro, não editar o mesmo. Comentário e posição são o que se
 * edita no lugar.
 *
 * `drafts` é assumido já normalizado por `normalizeExternalLinkDrafts` (linha vazia fora, sem
 * duplicata, `position` em sequência) — o formulário chama a normalização antes de salvar.
 */
export async function saveExternalLinksForTask(
  taskId: string,
  drafts: readonly TaskExternalLinkDraft[]
): Promise<TaskExternalLink[]> {
  const userId = await getCurrentUserId();
  const existing = await fetchExternalLinksForTask(taskId);
  const byUrl = new Map(existing.map((link) => [link.url, link]));

  const wanted = drafts.map((draft, index) => ({
    url: draft.url,
    comment: normalizeComment(draft.comment),
    position: index,
  }));
  const wantedUrls = new Set(wanted.map((draft) => draft.url));

  const removed = existing.filter((link) => !wantedUrls.has(link.url));
  if (removed.length > 0) {
    const { error } = await supabase
      .from("task_external_link")
      .delete()
      .eq("user_id", userId)
      .in(
        "id",
        removed.map((link) => link.id)
      );
    if (error) throw new Error(error.message);
  }

  const inserted = wanted.filter((draft) => !byUrl.has(draft.url));
  if (inserted.length > 0) {
    const { error } = await supabase.from("task_external_link").insert(
      inserted.map((draft) => ({
        user_id: userId,
        task_id: taskId,
        url: draft.url,
        comment: draft.comment,
        position: draft.position,
      }))
    );
    if (error) throw new Error(error.message);
  }

  // Só o que realmente mudou vira `update`: reabrir e salvar uma tarefa sem mexer nos links não
  // pode gerar uma escrita por link (nem sujar o `updated_at` de linha nenhuma).
  for (const draft of wanted) {
    const current = byUrl.get(draft.url);
    if (!current) continue;
    if (current.comment === draft.comment && current.position === draft.position) continue;
    const { error } = await supabase
      .from("task_external_link")
      .update({ comment: draft.comment, position: draft.position })
      .eq("id", current.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  return fetchExternalLinksForTask(taskId);
}
