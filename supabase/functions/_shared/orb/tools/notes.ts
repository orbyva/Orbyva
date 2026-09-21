/** Tool de notas da Orb — o único texto livre do app (features 055/056/058). Somente leitura. */

import type { OrbTool, OrbToolContext } from "../types.ts";
import { OrbToolError } from "../types.ts";
import { clampLimit, ilikeOr, isoDate, num, str, unwrap, UUID_RE } from "../helpers.ts";

/**
 * `canvas_data` (jsonb do Excalidraw) fica FORA do select de propósito: é o desenho inteiro em
 * coordenadas, ilegível para o modelo e caro em token — uma nota-canvas sozinha passa de 100 KB.
 * Nota-canvas tem `content` vazio (`src/types/notes.ts`), então o que sobra dela é o título.
 */
const NOTE_SELECT = "id, title, content, kind, project_id, created_at, updated_at";

/** Teto do corpo devolvido por nota. Sem ele, 20 notas longas envenenam todas as rodadas seguintes. */
const CONTENT_MAX_CHARS = 2000;

/** Abaixo disso o `ilike` casa quase tudo — é o mesmo piso de `src/api/search.ts`. */
const MIN_SEARCH_CHARS = 2;

/**
 * Teto de ids que entram no `in.(…)` do filtro por vínculo. Não é sobre memória: a lista vai na
 * QUERY STRING, e 100 uuids já são ~4 KB de URL — acima disso o risco é o proxy cortar a requisição.
 * Os mais recentemente vinculados vêm primeiro; quem tem mais de 100 notas na mesma entidade
 * refina com `search`.
 */
const MAX_LINKED_NOTE_IDS = 100;

/** Espelha o `check` de `note_link.entity_type` (`20260816170000_note_links.sql`). */
const LINK_ENTITY_TYPES = [
  "project",
  "task",
  "book",
  "movie",
  "album",
  "trip",
  "place",
  "goal",
  "habit",
  "vehicle",
];

/**
 * `note_link.entity_id` é `text` (referência polimórfica, sem FK), mas `note.project_id` é `uuid`:
 * mandar um texto qualquer para o filtro primário de projeto dá 22P02 no Postgres. Quando o id não
 * tem cara de uuid, só o caminho do `note_link` é usado.
 */

interface NoteRow {
  id: string;
  title: string;
  content: string | null;
  kind: string | null;
  project_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Ids das notas vinculadas a uma entidade — a consulta reversa de `note_link` (feature 056). */
async function linkedNoteIds(
  ctx: OrbToolContext,
  entityType: string,
  entityId: string
): Promise<string[]> {
  const rows = unwrap<{ note_id: string }[]>(
    await ctx.db
      .from("note_link")
      .select("note_id")
      .eq("user_id", ctx.userId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(MAX_LINKED_NOTE_IDS),
    "os vínculos das notas"
  );
  return [...new Set(rows.map((row) => row.note_id))];
}

/** O corpo que vai para o modelo: nunca o desenho do canvas, nunca mais que `CONTENT_MAX_CHARS`. */
function presentContent(row: NoteRow): { content: string | null; content_truncated: boolean } {
  if (row.kind === "canvas") return { content: null, content_truncated: false };
  const content = row.content ?? "";
  if (content.length <= CONTENT_MAX_CHARS) return { content, content_truncated: false };
  return { content: content.slice(0, CONTENT_MAX_CHARS), content_truncated: true };
}

/**
 * Avisos que só existem quando fazem falta. São para o modelo NARRAR o corte em vez de apresentar
 * meia nota como se fosse a nota inteira — ou dizer que uma nota está vazia quando ela é um desenho.
 */
function warnings(
  truncated: boolean,
  hasCanvas: boolean,
  limitReached: boolean
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (truncated) {
    out.content_truncated_warning =
      `Nota com content_truncated: true veio com o corpo cortado em ${CONTENT_MAX_CHARS} caracteres. ` +
      "Responda com o que veio e avise que o restante está no app.";
  }
  if (hasCanvas) {
    out.canvas_warning =
      "Nota com is_canvas: true é um desenho (canvas): não tem texto para ler, só título.";
  }
  if (limitReached) {
    out.limit_warning =
      "Vieram tantas notas quanto o limite pedido, então pode haver mais. Refine com search ou aumente limit (máx 20).";
  }
  return out;
}

export const queryNotes: OrbTool = {
  name: "query_notes",
  title: "Notas",
  description:
    "Notas em Markdown do usuário — o único lugar do app com texto livre escrito por ele. " +
    "Use para 'o que eu anotei sobre a reforma?', 'tenho alguma nota da reunião de ontem?', " +
    "'me lembra o que escrevi sobre aquele livro'. A busca é TEXTUAL (ilike: casa pedaço de " +
    "palavra no título e no corpo), NUNCA semântica — procure as palavras que provavelmente estão " +
    "escritas na nota e, se não achar, tente outro termo antes de afirmar que não existe nota. " +
    "O corpo vem cortado em 2.000 caracteres e notas de desenho (canvas) vêm só com o título.",
  inputSchema: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description:
          "Texto a procurar no título e no corpo da nota (busca textual, sem acentuação corrigida; mínimo 2 caracteres). Omita para trazer as notas editadas mais recentemente.",
      },
      linked_entity_type: {
        type: "string",
        enum: LINK_ENTITY_TYPES,
        description:
          "Traz só as notas ligadas a uma entidade deste tipo. Exige linked_entity_id. Para 'project' inclui também as notas do projeto (vínculo primário).",
      },
      linked_entity_id: {
        type: "string",
        description:
          "Id da entidade do vínculo (ex.: o id do projeto de query_projects, da tarefa de query_tasks). Exige linked_entity_type.",
      },
      updated_since: {
        type: "string",
        description: "Só notas editadas a partir desta data, em YYYY-MM-DD (inclusive).",
      },
      limit: {
        type: "number",
        description:
          "Máximo de notas (1 a 20, padrão 5). Suba só se o usuário pedir uma varredura: cada nota traz até 2.000 caracteres de texto.",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 5, 20);
    const search = str(input, "search");
    const linkedType = str(input, "linked_entity_type");
    const linkedId = str(input, "linked_entity_id");
    const updatedSince = isoDate(input, "updated_since");

    if (search !== undefined && search.trim().length < MIN_SEARCH_CHARS) {
      throw new OrbToolError(
        `"search" precisa de pelo menos ${MIN_SEARCH_CHARS} caracteres — com menos que isso a busca casa quase todas as notas.`
      );
    }
    if ((linkedType === undefined) !== (linkedId === undefined)) {
      throw new OrbToolError(
        '"linked_entity_type" e "linked_entity_id" andam juntos: mande os dois ou nenhum.'
      );
    }

    const empty = {
      notes: [] as unknown[],
      returned: 0,
      limit,
      ...(linkedType && linkedId
        ? { linked_entity_type: linkedType, linked_entity_id: linkedId }
        : {}),
    };

    // O vínculo é resolvido ANTES de montar a query das notas: é ele que pode encerrar a tool sem
    // ler `note` nenhuma vez.
    let linkedIds: string[] | undefined;
    let projectId: string | undefined;
    if (linkedType && linkedId) {
      linkedIds = await linkedNoteIds(ctx, linkedType, linkedId);
      // O projeto é o único vínculo com DUAS origens: `note.project_id` (o primário da feature 055,
      // que é o que a página do projeto mostra) e `note_link` (os secundários da 056). Olhar só a
      // segunda devolveria "nenhuma nota" para um projeto cheio delas.
      if (linkedType === "project" && UUID_RE.test(linkedId)) projectId = linkedId;
      if (linkedIds.length === 0 && projectId === undefined) return empty;
    }

    let query = ctx.db.from("note").select(NOTE_SELECT).eq("user_id", ctx.userId);

    if (linkedIds && linkedIds.length > 0 && projectId !== undefined) {
      // `projectId` já passou pelo UUID_RE, então não há como quebrar a sintaxe do `or=(…)`.
      query = query.or(`project_id.eq.${projectId},id.in.(${linkedIds.join(",")})`);
    } else if (linkedIds && linkedIds.length > 0) {
      query = query.in("id", linkedIds);
    } else if (projectId !== undefined) {
      query = query.eq("project_id", projectId);
    }

    // Segundo `or` da query quando também há filtro por projeto: o PostgREST combina `or` repetido
    // com AND, que é exatamente o que se quer (ligada à entidade E falando do termo buscado).
    if (search) query = query.or(ilikeOr(["title", "content"], search.trim()));
    // `updated_at` é `timestamptz` e a fronteira é só de INÍCIO — `.gte` com `YYYY-MM-DD` inclui o
    // dia inteiro, ao contrário do `.lte` de fim, que cortaria o último dia (bug B1).
    if (updatedSince) query = query.gte("updated_at", updatedSince);

    const rows = unwrap<NoteRow[]>(
      await query.order("updated_at", { ascending: false }).limit(limit),
      "as notas"
    );

    const notes = rows.map((row) => ({
      id: row.id,
      title: row.title,
      is_canvas: row.kind === "canvas",
      project_id: row.project_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ...presentContent(row),
    }));

    return {
      ...empty,
      notes,
      returned: notes.length,
      ...warnings(
        notes.some((note) => note.content_truncated),
        notes.some((note) => note.is_canvas),
        notes.length === limit
      ),
    };
  },
};

export const notesTools: OrbTool[] = [queryNotes];
