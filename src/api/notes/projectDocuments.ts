import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import {
  indexProjectDocumentLinks,
  mergeProjectDocuments,
  type ProjectDocumentLinkRow,
} from "@/domain/notes/projectDocuments";
import type { Note, ProjectDocument } from "@/types/notes";

/**
 * I/O dos "documentos do projeto" (feature 105) — as notas e canvas que a aba "Documentos" mostra.
 *
 * A união das três origens (projeto, tarefa do projeto, vínculo com o projeto) é **regra**, e mora
 * em `domain/notes/projectDocuments`; aqui só se busca. Toda consulta filtra por `user_id`
 * explicitamente: a RLS é a última linha de defesa, não a primeira, e o filtro é o que faz as
 * consultas usarem os índices que começam por `user_id`.
 *
 * **Nenhuma consulta manda a lista de ids de tarefa para o servidor.** Um `.in("entity_id", taskIds)`
 * num projeto de algumas centenas de tarefas geraria uma URL de GET de dezenas de KB — limite de
 * servidor estourado por um projeto grande. Em vez disso, os `note_link` do usuário com
 * `entity_type in ('task','project')` vêm inteiros (são poucos: vínculo é criado a dedo) e o
 * cruzamento com as tarefas do projeto acontece em memória, como `fetchNotesSharingEntity` já faz.
 */

/** Os únicos tipos de vínculo que põem um documento na lista de um projeto. */
const DOCUMENT_LINK_ENTITY_TYPES = ["task", "project"] as const;

interface ProjectDocumentSourcesOptions {
  /** Colunas pedidas em `note`. `"*"` para a lista, `"id"` para a contagem. */
  noteColumns: string;
  /** Colunas pedidas em `note_link` — a contagem não precisa do `label`. */
  linkColumns: string;
}

interface ProjectDocumentSourcesResult {
  userId: string;
  projectNotes: Note[];
  projectTaskIds: string[];
  links: ProjectDocumentLinkRow[];
}

/**
 * As três consultas de origem, em paralelo — nenhuma depende da outra. Só a busca das notas que
 * faltam (a quarta) depende do resultado, e por isso fica fora daqui.
 */
async function fetchProjectDocumentSources(
  projectId: string,
  { noteColumns, linkColumns }: ProjectDocumentSourcesOptions
): Promise<ProjectDocumentSourcesResult> {
  const userId = await getCurrentUserId();
  const [notes, tasks, links] = await Promise.all([
    supabase
      .from("note")
      .select(noteColumns)
      .eq("user_id", userId)
      .eq("project_id", projectId),
    supabase
      .from("task")
      .select("id")
      .eq("user_id", userId)
      .eq("project_id", projectId),
    supabase
      .from("note_link")
      .select(linkColumns)
      .eq("user_id", userId)
      .in("entity_type", [...DOCUMENT_LINK_ENTITY_TYPES])
      .order("created_at", { ascending: true }),
  ]);

  if (notes.error) throw new Error(notes.error.message);
  if (tasks.error) throw new Error(tasks.error.message);
  if (links.error) throw new Error(links.error.message);

  return {
    userId,
    projectNotes: (notes.data ?? []) as unknown as Note[],
    projectTaskIds: ((tasks.data ?? []) as unknown as { id: string }[]).map(
      (row) => row.id
    ),
    links: (links.data ?? []) as unknown as ProjectDocumentLinkRow[],
  };
}

/** Ids que os vínculos trazem e que a consulta do projeto ainda não devolveu. */
function missingNoteIds(
  sources: ProjectDocumentSourcesResult,
  projectId: string
): string[] {
  const already = new Set(sources.projectNotes.map((note) => note.id));
  return [
    ...indexProjectDocumentLinks(
      sources.links,
      sources.projectTaskIds,
      projectId
    ).keys(),
  ].filter((id) => !already.has(id));
}

/**
 * Todos os documentos do projeto — notas e canvas —, deduplicados e com a origem anexada.
 *
 * Quatro consultas no pior caso; a quarta (as notas que só os vínculos trazem) nem acontece quando
 * não há nenhuma para buscar.
 */
export async function fetchProjectDocuments(
  projectId: string
): Promise<ProjectDocument[]> {
  const sources = await fetchProjectDocumentSources(projectId, {
    noteColumns: "*",
    linkColumns: "note_id, entity_type, entity_id, label",
  });

  const missing = missingNoteIds(sources, projectId);
  let linkedNotes: Note[] = [];
  if (missing.length > 0) {
    const { data, error } = await supabase
      .from("note")
      .select("*")
      // Id vindo do vínculo não é passe livre: a segunda consulta é escopada no usuário também.
      .eq("user_id", sources.userId)
      .in("id", missing);
    if (error) throw new Error(error.message);
    linkedNotes = (data ?? []) as unknown as Note[];
  }

  return mergeProjectDocuments({
    projectNotes: sources.projectNotes,
    linkedNotes,
    links: sources.links,
    projectTaskIds: sources.projectTaskIds,
    projectId,
  });
}

/**
 * Quantos documentos o projeto tem — o número do gatilho da aba.
 *
 * Conta a **união**, e não só o `project_id`, porque uma contagem que discorda da lista é como uma
 * regressão futura volta. Não dá para contar união distinta com `head: true`, então as mesmas
 * consultas rodam pedindo **só ids** — continua barato, e continua fora do caminho de montagem da
 * aba (o conteúdo da aba só carrega quando ela abre, ganho da feature 069).
 */
export async function countProjectDocuments(projectId: string): Promise<number> {
  const sources = await fetchProjectDocumentSources(projectId, {
    noteColumns: "id",
    linkColumns: "note_id, entity_type, entity_id",
  });

  const union = new Set(sources.projectNotes.map((note) => note.id));
  const missing = missingNoteIds(sources, projectId);
  if (missing.length > 0) {
    // Só as que existem de verdade entram: vínculo para nota apagada (ou escondida pela RLS) não
    // pode inflar o número em relação ao que a lista mostra.
    const { data, error } = await supabase
      .from("note")
      .select("id")
      .eq("user_id", sources.userId)
      .in("id", missing);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as { id: string }[]) {
      union.add(row.id);
    }
  }
  return union.size;
}
