import type { GlobalSearchKind } from "@/api/search";
import type { NoteLinkEntityType } from "@/types/notes";

/**
 * Para onde aponta um vínculo polimórfico e como ele se chama na tela (feature 056).
 *
 * Módulo puro: só mapas e strings, sem I/O e sem React. Fica no domínio porque o painel de
 * vínculos, a consulta reversa e qualquer módulo que exiba "Notas" precisam da mesma tradução —
 * duplicá-la é como o rótulo de um tipo acaba diferente em cada tela.
 */

/** Nome do tipo em português, para o chip do vínculo. */
export const NOTE_LINK_TYPE_LABEL: Record<NoteLinkEntityType, string> = {
  project: "Projeto",
  task: "Tarefa",
  book: "Livro",
  movie: "Filme",
  album: "Álbum",
  trip: "Viagem",
  place: "Lugar",
  goal: "Meta",
  habit: "Hábito",
  vehicle: "Veículo",
};

/**
 * Rota da entidade referenciada.
 *
 * Só viagem e projeto têm página própria por id; o resto do app lista tudo numa página só, então o
 * vínculo leva para a lista. É a rota que existe hoje — inventar `/goals/:id` daria link quebrado.
 */
export function noteLinkHref(
  entityType: NoteLinkEntityType,
  entityId: string
): string {
  switch (entityType) {
    case "project":
      return `/tasks/projects/${entityId}`;
    case "trip":
      return `/travel/${entityId}`;
    case "task":
      return "/tasks";
    case "book":
      return "/books";
    case "movie":
      return "/movies";
    case "album":
      return "/music";
    case "place":
      return "/places";
    case "goal":
      return "/goals";
    case "habit":
      return "/habits";
    case "vehicle":
      return "/car";
  }
}

/**
 * Traduz o `kind` da busca global (`src/api/search.ts`) para o `entity_type` do vínculo — é o que
 * permite vincular qualquer coisa achada na busca sem uma tela de seleção por módulo.
 *
 * `null` para o que não é vinculável: `transaction` (lançamento não é entidade que se comenta, e
 * não está no `check` do banco) e `note` (nota→nota é wiki-link, não `note_link`).
 */
export function noteLinkTypeFromSearchKind(
  kind: GlobalSearchKind
): NoteLinkEntityType | null {
  switch (kind) {
    case "movie":
      return "movie";
    case "book":
      return "book";
    // A busca chama de "music" o que o banco chama de "album".
    case "music":
      return "album";
    case "place":
      return "place";
    case "trip":
      return "trip";
    case "goal":
      return "goal";
    case "habit":
      return "habit";
    case "vehicle":
      return "vehicle";
    case "transaction":
    case "note":
      return null;
  }
}
