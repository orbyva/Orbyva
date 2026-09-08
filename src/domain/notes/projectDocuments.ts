import type {
  Note,
  NoteLink,
  ProjectDocument,
  ProjectDocumentSource,
} from "@/types/notes";

/**
 * "Documentos do projeto" (feature 105): a regra que decide **quais** notas/canvas aparecem na aba
 * de um projeto e **por quê**, sem tocar no banco.
 *
 * Antes desta feature a aba listava só `note.project_id = P`. Isso deixava de fora exatamente o que
 * o pedido quer ver ali — a nota que veio de uma tarefa do projeto — sempre que o `project_id` não
 * tivesse sido copiado na criação (nota criada solta e vinculada depois, tarefa que mudou de
 * projeto). A lista passa a ser a união de três origens, deduplicada por `note.id`:
 *
 * 1. `project` — `note.project_id = P`;
 * 2. `task` — `note_link(entity_type: 'task', entity_id ∈ tarefas de P)`;
 * 3. `link` — `note_link(entity_type: 'project', entity_id = P)`.
 *
 * A dedupe, a ordem e a anexação da tarefa de origem moram aqui, e não na API, porque são a parte
 * testável sem I/O (padrão de camadas do `docs/stack.md`).
 */

/**
 * O que este módulo precisa de um `note_link` — de propósito menos que `NoteLink` inteiro, para a
 * API poder passar o `select("note_id, entity_type, entity_id, label")` sem inventar `id`/`user_id`
 * que ninguém usa aqui.
 */
export type ProjectDocumentLinkRow = Pick<
  NoteLink,
  "note_id" | "entity_type" | "entity_id"
> & { label?: string | null };

export interface MergeProjectDocumentsInput {
  /** Notas com `project_id` do projeto — a origem `project`. */
  projectNotes: readonly Note[];
  /**
   * Notas trazidas **pelos vínculos** (as que não estavam em `projectNotes`). Vínculo cuja nota não
   * está aqui — apagada, ou escondida pela RLS — simplesmente não entra na lista.
   */
  linkedNotes: readonly Note[];
  /** `note_link` do usuário com `entity_type` em `('task','project')`, já sem filtro por projeto. */
  links: readonly ProjectDocumentLinkRow[];
  /** Ids das tarefas **deste** projeto — é o que separa vínculo relevante de vínculo alheio. */
  projectTaskIds: readonly string[];
  projectId: string;
}

interface LinkedSource {
  sources: ProjectDocumentSource[];
  taskLabel: string | null;
}

/**
 * `note_id` → origens que os vínculos dão, com o rótulo congelado da tarefa.
 *
 * Vínculo órfão não entra: `entity_type: 'task'` cujo `entity_id` não é tarefa deste projeto (ou
 * de tarefa apagada) é vínculo de outra história, e `entity_type: 'project'` de outro projeto
 * idem. Só os que sobram é que põem a nota na lista.
 *
 * Exportada porque a API também precisa dela **antes** de buscar as notas: é ela que diz quais ids
 * valem uma consulta a mais (ver `fetchProjectDocuments`).
 */
export function indexProjectDocumentLinks(
  links: readonly ProjectDocumentLinkRow[],
  projectTaskIds: readonly string[],
  projectId: string
): Map<string, LinkedSource> {
  const taskIds = new Set(projectTaskIds);
  const byNote = new Map<string, LinkedSource>();

  for (const link of links) {
    const fromTask = link.entity_type === "task" && taskIds.has(link.entity_id);
    const fromProject =
      link.entity_type === "project" && link.entity_id === projectId;
    if (!fromTask && !fromProject) continue;

    const entry = byNote.get(link.note_id) ?? { sources: [], taskLabel: null };
    const source: ProjectDocumentSource = fromTask ? "task" : "link";
    if (!entry.sources.includes(source)) entry.sources.push(source);
    // Duas tarefas do mesmo projeto vinculadas à mesma nota: vale o primeiro rótulo que apareceu,
    // que é o vínculo mais antigo (a API pede `note_link` em ordem de criação).
    if (fromTask && entry.taskLabel === null) {
      entry.taskLabel = link.label?.trim() ? link.label.trim() : null;
    }
    byNote.set(link.note_id, entry);
  }
  return byNote;
}

/** A ordem da aba: editada mais recentemente primeiro. */
function compareDocuments(a: ProjectDocument, b: ProjectDocument): number {
  const byUpdated = (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
  if (byUpdated !== 0) return byUpdated;
  // Empate (duas notas gravadas no mesmo instante, ou sem `updated_at`) é desempatado pelo título
  // para a lista não trocar de ordem entre renders — `sort` só é estável dentro de um mesmo array,
  // e aqui o array é remontado a cada carga.
  const byTitle = a.title.localeCompare(b.title, "pt-BR");
  return byTitle !== 0 ? byTitle : a.id.localeCompare(b.id);
}

/**
 * A união das três origens, deduplicada por `note.id`, ordenada e com `sources`/`taskLabel`
 * preenchidos.
 *
 * Uma nota vinculada a uma tarefa de P mas com `project_id` de **outro** projeto entra aqui e
 * também na lista do outro: são dois vínculos que existem de verdade, e esconder um deles seria
 * mentir. O `taskLabel` no item é o que explica por que ela está nesta lista.
 */
export function mergeProjectDocuments({
  projectNotes,
  linkedNotes,
  links,
  projectTaskIds,
  projectId,
}: MergeProjectDocumentsInput): ProjectDocument[] {
  const linkSources = indexProjectDocumentLinks(links, projectTaskIds, projectId);

  const byId = new Map<string, ProjectDocument>();
  const add = (note: Note, source: ProjectDocumentSource | null) => {
    const existing = byId.get(note.id);
    const document: ProjectDocument =
      existing ?? { ...note, sources: [], taskLabel: null };
    const sources = [...document.sources];
    if (source && !sources.includes(source)) sources.push(source);
    const fromLink = linkSources.get(note.id);
    for (const linked of fromLink?.sources ?? []) {
      if (!sources.includes(linked)) sources.push(linked);
    }
    byId.set(note.id, {
      ...document,
      sources,
      taskLabel: document.taskLabel ?? fromLink?.taskLabel ?? null,
    });
  };

  for (const note of projectNotes) {
    // O filtro do `project_id` é do chamador, mas conferir aqui é o que faz a função ser honesta
    // sozinha — e o que impede uma nota de outro projeto de entrar com a origem errada.
    add(note, note.project_id === projectId ? "project" : null);
  }
  for (const note of linkedNotes) {
    add(note, note.project_id === projectId ? "project" : null);
  }

  // Nota que chegou sem origem nenhuma (vínculo órfão, ou `project_id` de outro projeto sem
  // vínculo) não é documento deste projeto.
  return [...byId.values()]
    .filter((document) => document.sources.length > 0)
    .sort(compareDocuments);
}
