/**
 * Tools de produtividade da Orb: tarefas, projetos, agenda, tags, links salvos e tempo
 * registrado. Somente leitura (P0 da feature 098 + lote 2T.9).
 */

import type { OrbTool, OrbToolContext } from "../types.ts";
import { OrbToolError } from "../types.ts";
import {
  bool,
  clampLimit,
  exclusiveEnd,
  ilikeOr,
  ilikePattern,
  isoDate,
  limitInfo,
  localDateInTz,
  num,
  paginate,
  shiftDays,
  str,
  unwrap,
} from "../helpers.ts";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  due_time: string | null;
  start_date: string | null;
  priority: string | null;
  project_id: string | null;
  parent_task_id: string | null;
  estimated_duration: number | null;
  completed_at: string | null;
}

const TASK_SELECT =
  "id, title, status, due_date, due_time, start_date, priority, project_id, parent_task_id, estimated_duration, completed_at";

export const queryTasks: OrbTool = {
  name: "query_tasks",
  title: "Tarefas",
  description:
    "Tarefas do usuário, com filtro por status, prazo, projeto e texto. Use para 'o que eu tenho pra fazer hoje?', 'o que está atrasado', 'o que vou fazer amanhã'.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["todo", "doing", "done"],
        description: "Filtra por status. Omita para trazer todos menos concluídas.",
      },
      due_from: { type: "string", description: "Prazo a partir de (YYYY-MM-DD)." },
      due_to: { type: "string", description: "Prazo até (YYYY-MM-DD, inclusive)." },
      overdue: {
        type: "boolean",
        description:
          "true traz só tarefas não concluídas com prazo anterior a hoje. Tem precedência: quando é true, due_from e due_to são ignorados e status 'done' não é aceito.",
      },
      project_id: { type: "string", description: "Id do projeto (ver query_projects)." },
      search: { type: "string", description: "Texto a procurar no título da tarefa." },
      limit: { type: "number", description: "Máximo de linhas (1 a 100, padrão 40)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 40, 100);
    const status = str(input, "status");
    const search = str(input, "search");
    const projectId = str(input, "project_id");
    const overdue = bool(input, "overdue") === true;
    const dueFrom = isoDate(input, "due_from");
    const dueTo = isoDate(input, "due_to");

    let query = ctx.db.from("task").select(TASK_SELECT).eq("user_id", ctx.userId);
    if (projectId) query = query.eq("project_id", projectId);
    if (search) query = query.ilike("title", ilikePattern(search));

    // `overdue` é o filtro mais específico e manda nos outros: ele já significa "não concluída e
    // com prazo anterior a hoje", então `status: done` e `due_from`/`due_to` seriam contradição —
    // a combinação antes devolvia lista vazia com cara de "não tenho nada atrasado".
    if (overdue) {
      query =
        status && status !== "done" ? query.eq("status", status) : query.neq("status", "done");
      query = query.lt("due_date", ctx.today);
    } else {
      if (status) query = query.eq("status", status);
      else query = query.neq("status", "done");
      if (dueFrom) query = query.gte("due_date", dueFrom);
      if (dueTo) query = query.lte("due_date", dueTo);
    }

    const result = await query
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(limit);
    const rows = unwrap<TaskRow[]>(result, "as tarefas");

    return {
      today: ctx.today,
      ...limitInfo(rows.length, limit, "tarefas"),
      count: rows.length,
      tasks: rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        due_date: row.due_date,
        due_time: row.due_time,
        priority: row.priority,
        project_id: row.project_id,
        is_subtask: row.parent_task_id !== null,
        estimated_duration_minutes: row.estimated_duration,
        overdue: row.status !== "done" && row.due_date !== null && row.due_date < ctx.today,
      })),
    };
  },
};

export const queryProjects: OrbTool = {
  name: "query_projects",
  title: "Projetos",
  description:
    "Projetos do usuário com contagem de tarefas pendentes e concluídas. Use para descobrir o id de um projeto antes de filtrar tarefas por ele.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["planned", "active", "completed", "archived"],
        description: "Filtra por status do projeto.",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const status = str(input, "status");
    let query = ctx.db
      .from("project")
      .select("id, name, description, status, goal_id")
      .eq("user_id", ctx.userId);
    if (status) query = query.eq("status", status);

    const projects = unwrap<
      { id: string; name: string; description: string | null; status: string; goal_id: string | null }[]
    >(await query.order("name", { ascending: true }), "os projetos");

    // Uma leitura paginada custa ceil(tarefas/1000) round-trips e não cresce com o número de
    // projetos; `count: exact, head: true` custaria uma chamada por projeto (duas, com o corte
    // aberto/concluído), o que é pior justamente para quem tem muitos projetos.
    const { rows: counts, truncated } = await paginate<{
      project_id: string | null;
      status: string;
    }>(
      (from, to) =>
        ctx.db
          .from("task")
          .select("project_id, status")
          .eq("user_id", ctx.userId)
          .order("id", { ascending: true })
          .range(from, to),
      "as tarefas dos projetos"
    );

    return {
      counts_truncated: truncated,
      projects: projects.map((project) => {
        const mine = counts.filter((task) => task.project_id === project.id);
        return {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          tasks_open: mine.filter((task) => task.status !== "done").length,
          tasks_done: mine.filter((task) => task.status === "done").length,
        };
      }),
    };
  },
};

export const queryAgenda: OrbTool = {
  name: "query_agenda",
  title: "Agenda",
  description:
    "Agenda de um intervalo de dias: eventos de projeto com hora marcada mais as tarefas com prazo no período. Use para 'o que eu tenho amanhã?' ou 'como está minha semana?'.",
  inputSchema: {
    type: "object",
    properties: {
      start_date: { type: "string", description: "Início em YYYY-MM-DD. Padrão: hoje." },
      days: { type: "number", description: "Quantos dias a partir do início (1 a 31, padrão 7)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const startDate = isoDate(input, "start_date") ?? ctx.today;
    const days = clampLimit(num(input, "days"), 7, 31);
    const endDate = shiftDays(startDate, days - 1);

    // `starts_at` é `timestamptz` (`20260820110000_project_event_project_optional.sql`) e uma
    // fronteira `YYYY-MM-DD` é lida como meia-noite UTC, não a do usuário — com a sessão em UTC a
    // janela virava 21:00 do dia anterior. Por isso a busca abre um dia para cada lado (cobre
    // qualquer fuso, de -12 a +14) e quem decide o que entra é a data local calculada abaixo.
    const rawEvents = unwrap<
      { id: string; title: string; starts_at: string; ends_at: string | null; project_id: string | null }[]
    >(
      await ctx.db
        .from("project_event")
        .select("id, title, starts_at, ends_at, project_id")
        .eq("user_id", ctx.userId)
        .gte("starts_at", shiftDays(startDate, -1))
        .lt("starts_at", exclusiveEnd(shiftDays(endDate, 1)))
        .order("starts_at", { ascending: true }),
      "os eventos"
    );

    // `local_date` vai no retorno para o modelo não reconverter o UTC por conta própria.
    const events = rawEvents
      .map((event) => ({ ...event, local_date: localDateInTz(event.starts_at, ctx.timezone) }))
      .filter((event) => event.local_date >= startDate && event.local_date <= endDate);

    const tasks = unwrap<TaskRow[]>(
      await ctx.db
        .from("task")
        .select(TASK_SELECT)
        .eq("user_id", ctx.userId)
        .gte("due_date", startDate)
        .lte("due_date", endDate)
        .order("due_date", { ascending: true }),
      "as tarefas da agenda"
    );

    return {
      start_date: startDate,
      end_date: endDate,
      timezone: ctx.timezone,
      events,
      tasks: tasks.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        due_date: row.due_date,
        due_time: row.due_time,
      })),
    };
  },
};


/* ─────────────────────────────── Tags (2T.9) ─────────────────────────────── */

interface TagRow {
  id: string;
  name: string;
  color: string;
}

/**
 * Teto de linhas do catálogo de tags. É um catálogo curado à mão (a tela de gestão de tags), então
 * 200 já é folgado; o teto existe para o retorno nunca explodir se alguém importar tag em massa.
 */
const MAX_TAGS = 200;

/**
 * Catálogo de tags do usuário, ordenado por nome.
 *
 * É a ÚNICA leitura de `tag` do arquivo de propósito: `query_tags` e `query_content_links` precisam
 * exatamente da mesma coisa (id → nome), e duas queries com colunas/ordem diferentes viravam duas
 * verdades sobre o mesmo catálogo na primeira mudança de coluna.
 */
async function fetchTagCatalog(
  ctx: OrbToolContext
): Promise<{ tags: TagRow[]; truncated: boolean }> {
  const rows = unwrap<TagRow[]>(
    await ctx.db
      .from("tag")
      .select("id, name, color")
      .eq("user_id", ctx.userId)
      .order("name", { ascending: true })
      .limit(MAX_TAGS + 1),
    "as tags"
  );
  return { tags: rows.slice(0, MAX_TAGS), truncated: rows.length > MAX_TAGS };
}

/**
 * Resolve `tag_ids uuid[]` para `{ id, name }`.
 *
 * Id que não está no catálogo é DESCARTADO, não devolvido cru: `tag_ids` é array sem FK (o Postgres
 * não tem FK em array — ver `20260807150000_tags_catalog.sql`), então id órfão de tag excluída
 * existe de verdade no banco, e mandar um uuid solto para o modelo é o problema que esta tool
 * existe para resolver.
 */
function resolveTags(
  tagIds: string[] | null | undefined,
  byId: Map<string, TagRow>
): { id: string; name: string }[] {
  return (tagIds ?? [])
    .map((id) => byId.get(id))
    .filter((tag): tag is TagRow => tag !== undefined)
    .map((tag) => ({ id: tag.id, name: tag.name }));
}

/** Quantas linhas de `table` referenciam cada tag, por `tag_ids`. */
async function countTagUsage(
  ctx: OrbToolContext,
  table: string,
  what: string
): Promise<{ counts: Map<string, number>; truncated: boolean }> {
  const { rows, truncated } = await paginate<{ tag_ids: string[] | null }>(
    (from, to) =>
      ctx.db
        .from(table)
        .select("tag_ids")
        .eq("user_id", ctx.userId)
        .order("id", { ascending: true })
        .range(from, to),
    what
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const id of new Set(row.tag_ids ?? [])) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return { counts, truncated };
}

export const queryTags: OrbTool = {
  name: "query_tags",
  title: "Tags",
  description:
    "Catálogo de tags do usuário (id, nome e cor), compartilhado por tarefas, projetos e links salvos. Use para traduzir os tag_ids que outras tools devolvem, para achar o id de uma tag antes de filtrar por ela, ou para 'quais tags eu uso mais?' (com include_usage). Exemplos: 'quais tags eu tenho?', 'tenho alguma tag de trabalho?'.",
  inputSchema: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description: "Texto a procurar no nome da tag (sem diferenciar maiúsculas de minúsculas).",
      },
      include_usage: {
        type: "boolean",
        description:
          "true conta em quantas tarefas, projetos e links salvos cada tag aparece e ordena da mais usada para a menos usada (custa três leituras extras). Padrão false, que devolve o catálogo em ordem alfabética.",
      },
      limit: { type: "number", description: "Máximo de tags no retorno (1 a 200, padrão 50)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 50, MAX_TAGS);
    const search = str(input, "search");
    const includeUsage = bool(input, "include_usage") === true;

    const { tags, truncated } = await fetchTagCatalog(ctx);
    // O catálogo é pequeno e já vem inteiro para poder resolver `tag_ids`; filtrar o `search` aqui
    // evita uma segunda query só para uma comparação de texto.
    const alvo = search?.toLowerCase();
    const filtradas = alvo ? tags.filter((tag) => tag.name.toLowerCase().includes(alvo)) : tags;

    if (!includeUsage) {
      return {
        total_tags: filtradas.length,
        truncated: truncated || filtradas.length > limit,
        tags: filtradas.slice(0, limit).map((tag) => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
        })),
      };
    }

    const [tarefas, projetos, links] = await Promise.all([
      countTagUsage(ctx, "task", "as tarefas das tags"),
      countTagUsage(ctx, "project", "os projetos das tags"),
      countTagUsage(ctx, "content_link", "os links das tags"),
    ]);

    const comUso = filtradas
      .map((tag) => {
        const usedInTasks = tarefas.counts.get(tag.id) ?? 0;
        const usedInProjects = projetos.counts.get(tag.id) ?? 0;
        const usedInContentLinks = links.counts.get(tag.id) ?? 0;
        return {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          used_in_tasks: usedInTasks,
          used_in_projects: usedInProjects,
          used_in_content_links: usedInContentLinks,
          used_total: usedInTasks + usedInProjects + usedInContentLinks,
        };
      })
      .sort((a, b) => b.used_total - a.used_total || a.name.localeCompare(b.name));

    return {
      total_tags: comUso.length,
      truncated: truncated || comUso.length > limit,
      // Contagem incompleta é pior do que contagem ausente se o modelo não souber — quando isto é
      // true, "a tag mais usada" pode estar errada.
      usage_truncated: tarefas.truncated || projetos.truncated || links.truncated,
      tags: comUso.slice(0, limit),
    };
  },
};

/* ──────────────────────── Links salvos / Conteúdo (2T.9) ──────────────────── */

interface ContentLinkRow {
  id: string;
  title: string;
  url: string;
  type: string;
  status: string;
  notes: string | null;
  is_favorite: boolean;
  tag_ids: string[] | null;
  consumed_at: string | null;
  created_at: string;
}

/** `notes` é texto livre sem limite no banco; sem corte, dez links longos comem o turno inteiro. */
const MAX_NOTES_CHARS = 300;

export const queryContentLinks: OrbTool = {
  name: "query_content_links",
  title: "Links salvos",
  description:
    "Fila de links que o usuário salvou para ler/assistir depois (artigos, vídeos, sites), com status de leitura, favoritos e as tags já resolvidas para nome. Use para 'o que eu tenho pra ler?', 'quais vídeos eu ainda não assisti?', 'salvei algum link sobre Postgres?', 'quais links eu marquei como favoritos?'.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["to_consume", "consumed"],
        description:
          "'to_consume' = ainda não lido/assistido, 'consumed' = já consumido. Omita para trazer os dois.",
      },
      type: {
        type: "string",
        enum: ["article", "video", "website"],
        description: "Filtra pelo tipo do link. Omita para trazer todos.",
      },
      tag: {
        type: "string",
        description:
          "Nome (sem diferenciar maiúsculas) ou id de uma tag — traz só os links marcados com ela. Use query_tags para ver as tags disponíveis.",
      },
      is_favorite: {
        type: "boolean",
        description: "true traz só os favoritos; false só os não favoritos. Omita para trazer todos.",
      },
      search: {
        type: "string",
        description: "Texto a procurar no título, na anotação e na URL do link.",
      },
      limit: { type: "number", description: "Máximo de links no retorno (1 a 50, padrão 20)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 20, 50);
    const status = str(input, "status");
    const tipo = str(input, "type");
    const favorito = bool(input, "is_favorite");
    const search = str(input, "search");
    const tagInput = str(input, "tag");

    // O catálogo só é lido antes da busca quando ele é necessário para MONTAR a query (filtro por
    // tag). Nos outros casos ele entra depois, e só se algum link tiver tag.
    const catalogoDoFiltro = tagInput ? await fetchTagCatalog(ctx) : null;
    let tagId: string | undefined;
    if (tagInput && catalogoDoFiltro) {
      const alvo = tagInput.toLowerCase();
      const achada = catalogoDoFiltro.tags.find(
        (tag) => tag.id === tagInput || tag.name.toLowerCase() === alvo
      );
      // Devolver lista vazia aqui seria pior do que o erro: o modelo leria "você não tem link
      // nenhum com essa tag" em vez de "essa tag não existe".
      if (!achada) {
        const disponiveis = catalogoDoFiltro.tags
          .slice(0, 30)
          .map((tag) => tag.name)
          .join(", ");
        throw new OrbToolError(
          disponiveis
            ? `Não encontrei nenhuma tag chamada "${tagInput}". As tags do usuário são: ${disponiveis}.`
            : `Não encontrei nenhuma tag chamada "${tagInput}" — o usuário ainda não criou tags.`,
          "nao_encontrado"
        );
      }
      tagId = achada.id;
    }

    let query = ctx.db
      .from("content_link")
      .select("id, title, url, type, status, notes, is_favorite, tag_ids, consumed_at, created_at")
      .eq("user_id", ctx.userId);
    if (status) query = query.eq("status", status);
    if (tipo) query = query.eq("type", tipo);
    if (favorito !== undefined) query = query.eq("is_favorite", favorito);
    if (tagId) query = query.contains("tag_ids", [tagId]);
    // `ilikeOr` em vez de interpolar o termo cru: escapa os curingas do LIKE (um `%` digitado traria
    // a fila inteira) e ASPA o valor, então vírgula e parênteses passam a ser buscados em vez de
    // quebrarem a sintaxe do `or=(…)` — antes eles eram trocados por espaço e a busca mentia calada.
    if (search) query = query.or(ilikeOr(["title", "notes", "url"], search));

    // `limit + 1` para saber que há mais sem pagar uma segunda query de contagem.
    const rows = unwrap<ContentLinkRow[]>(
      await query.order("created_at", { ascending: false }).limit(limit + 1),
      "os links salvos"
    );
    const links = rows.slice(0, limit);

    const catalogo =
      catalogoDoFiltro ??
      (links.some((link) => (link.tag_ids ?? []).length > 0)
        ? await fetchTagCatalog(ctx)
        : { tags: [] as TagRow[], truncated: false });
    const byId = new Map(catalogo.tags.map((tag) => [tag.id, tag]));

    return {
      has_more: rows.length > limit,
      // Catálogo cortado no teto = algum link pode aparecer com menos tags do que tem.
      tags_truncated: catalogo.truncated,
      links: links.map((link) => ({
        id: link.id,
        title: link.title,
        url: link.url,
        type: link.type,
        status: link.status,
        is_favorite: link.is_favorite,
        tags: resolveTags(link.tag_ids, byId),
        notes: link.notes ? link.notes.slice(0, MAX_NOTES_CHARS) : null,
        notes_truncated: (link.notes?.length ?? 0) > MAX_NOTES_CHARS,
        consumed_at: link.consumed_at,
        created_at: link.created_at,
      })),
    };
  },
};

/* ─────────────────────── Tempo registrado / Live (2T.9) ───────────────────── */

interface TimeEntryRow {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
}

/**
 * Segundos de uma sessão FECHADA. Espelha `elapsedSeconds` (`src/domain/tasks/timeTracking.ts`) para
 * o caso `endedAt !== null` — e só para ele: aquela função conta sessão em andamento contra `now`,
 * que é exatamente o que esta tool não pode fazer (ver `queryTimeTracking`). Não dá para importar a
 * de lá de qualquer forma: este diretório não pode depender de `src/`.
 */
function closedEntrySeconds(row: TimeEntryRow): number {
  const inicio = new Date(row.started_at).getTime();
  const fim = new Date(row.ended_at as string).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return 0;
  return Math.max(0, Math.round((fim - inicio) / 1000));
}

export const queryTimeTracking: OrbTool = {
  name: "query_time_tracking",
  title: "Tempo registrado",
  description:
    "Tempo cronometrado na seção Live, somado por tarefa e por projeto num período. Use para 'quanto tempo eu trabalhei hoje?', 'em que tarefa passei mais tempo essa semana?', 'quanto tempo já foi para o projeto X?'. Sessões ainda em andamento (sem hora de fim) vêm separadas em 'running' e NÃO entram em total_minutes — o tempo delas ainda está correndo.",
  inputSchema: {
    type: "object",
    properties: {
      start_date: {
        type: "string",
        description: "Primeiro dia do período (YYYY-MM-DD), no fuso do usuário. Padrão: hoje.",
      },
      end_date: {
        type: "string",
        description: "Último dia do período (YYYY-MM-DD, inclusive). Padrão: o mesmo de start_date.",
      },
      task_id: { type: "string", description: "Id da tarefa (ver query_tasks)." },
      project_id: { type: "string", description: "Id do projeto (ver query_projects)." },
      limit: {
        type: "number",
        description:
          "Máximo de tarefas e de projetos no detalhamento (1 a 50, padrão 20). Não afeta total_minutes, que é sempre do período inteiro.",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 20, 50);
    const startDate = isoDate(input, "start_date") ?? ctx.today;
    const endDate = isoDate(input, "end_date") ?? startDate;
    if (endDate < startDate) {
      throw new OrbToolError('"end_date" não pode ser anterior a "start_date".');
    }
    const taskId = str(input, "task_id");
    const projectId = str(input, "project_id");

    // `started_at` é `timestamptz` e a fronteira `YYYY-MM-DD` é lida como meia-noite UTC — mesma
    // armadilha de `query_agenda`. A busca abre um dia para cada lado (cobre de -12 a +14) e quem
    // decide o que entra é a data local calculada abaixo.
    // Paginado porque truncagem silenciosa aqui não devolve "menos linhas": devolve um TOTAL menor
    // com cara de exato, que é o pior modo de falha desta tool.
    const { rows: bruto, truncated } = await paginate<TimeEntryRow>(
      (from, to) => {
        let query = ctx.db
          .from("task_time_entry")
          .select("id, task_id, started_at, ended_at")
          .eq("user_id", ctx.userId)
          .gte("started_at", shiftDays(startDate, -1))
          .lt("started_at", exclusiveEnd(shiftDays(endDate, 1)));
        if (taskId) query = query.eq("task_id", taskId);
        return query
          .order("started_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
      },
      "os registros de tempo"
    );

    const noPeriodo = bruto.filter((row) => {
      if (!row.started_at) return false;
      const dia = localDateInTz(row.started_at, ctx.timezone);
      return dia >= startDate && dia <= endDate;
    });

    // O timer em andamento é lido fora da janela de propósito: "estou com um timer rodando?" é uma
    // pergunta sobre agora, e um timer aberto ontem não apareceria numa consulta de hoje.
    // `task_time_entry_one_running_idx` garante no máximo um por usuário; o teto é só cinto.
    const emAndamento = unwrap<TimeEntryRow[]>(
      await ctx.db
        .from("task_time_entry")
        .select("id, task_id, started_at, ended_at")
        .eq("user_id", ctx.userId)
        .is("ended_at", null)
        .limit(5),
      "o timer em andamento"
    );

    const idsDeTarefa = [
      ...new Set([...noPeriodo, ...emAndamento].map((row) => row.task_id).filter(Boolean)),
    ];
    const tarefas =
      idsDeTarefa.length > 0
        ? unwrap<{ id: string; title: string; project_id: string | null }[]>(
            await ctx.db
              .from("task")
              .select("id, title, project_id")
              .eq("user_id", ctx.userId)
              .in("id", idsDeTarefa),
            "as tarefas do tempo registrado"
          )
        : [];
    const tarefaPorId = new Map(tarefas.map((tarefa) => [tarefa.id, tarefa]));

    const idsDeProjeto = [
      ...new Set(
        tarefas.map((tarefa) => tarefa.project_id).filter((id): id is string => Boolean(id))
      ),
    ];
    const projetos =
      idsDeProjeto.length > 0
        ? unwrap<{ id: string; name: string }[]>(
            await ctx.db
              .from("project")
              .select("id, name")
              .eq("user_id", ctx.userId)
              .in("id", idsDeProjeto),
            "os projetos do tempo registrado"
          )
        : [];
    const projetoPorId = new Map(projetos.map((projeto) => [projeto.id, projeto]));

    const doProjeto = projectId
      ? noPeriodo.filter((row) => tarefaPorId.get(row.task_id)?.project_id === projectId)
      : noPeriodo;

    const segundosPorTarefa = new Map<string, number>();
    let contadas = 0;
    for (const row of doProjeto) {
      // A REGRA desta tool: sessão sem `ended_at` está correndo. Somá-la faria o total mudar a cada
      // chamada dentro da mesma conversa, e a Orb se contradiria sozinha.
      if (row.ended_at === null || row.ended_at === undefined) continue;
      contadas += 1;
      segundosPorTarefa.set(
        row.task_id,
        (segundosPorTarefa.get(row.task_id) ?? 0) + closedEntrySeconds(row)
      );
    }

    // Arredonda uma vez por tarefa e soma os arredondados: assim `total_minutes` é exatamente a
    // soma de `by_task`, e o modelo não encontra "2 + 3 = 6" no próprio retorno.
    const porTarefa = [...segundosPorTarefa.entries()]
      .map(([id, segundos]) => {
        const tarefa = tarefaPorId.get(id);
        return {
          task_id: id,
          title: tarefa?.title ?? null,
          project_id: tarefa?.project_id ?? null,
          minutes: Math.round(segundos / 60),
        };
      })
      .sort((a, b) => b.minutes - a.minutes);

    const porProjeto = new Map<string, { project_id: string | null; name: string; minutes: number }>();
    for (const tarefa of porTarefa) {
      const chave = tarefa.project_id ?? "__sem_projeto__";
      const atual = porProjeto.get(chave);
      if (atual) {
        atual.minutes += tarefa.minutes;
        continue;
      }
      porProjeto.set(chave, {
        project_id: tarefa.project_id,
        name: tarefa.project_id
          ? (projetoPorId.get(tarefa.project_id)?.name ?? "Projeto desconhecido")
          : "Sem projeto",
        minutes: tarefa.minutes,
      });
    }
    const projetosOrdenados = [...porProjeto.values()].sort((a, b) => b.minutes - a.minutes);

    return {
      start_date: startDate,
      end_date: endDate,
      timezone: ctx.timezone,
      total_minutes: porTarefa.reduce((soma, tarefa) => soma + tarefa.minutes, 0),
      entries_counted: contadas,
      entries_truncated: truncated,
      tasks_total: porTarefa.length,
      by_task: porTarefa.slice(0, limit),
      projects_total: projetosOrdenados.length,
      by_project: projetosOrdenados.slice(0, limit),
      // Fora de `total_minutes` de propósito — ainda está correndo.
      running: emAndamento
        .filter((row) => Boolean(row.started_at))
        .map((row) => ({
          id: row.id,
          task_id: row.task_id,
          title: tarefaPorId.get(row.task_id)?.title ?? null,
          started_at: row.started_at,
          started_local_date: localDateInTz(row.started_at, ctx.timezone),
        })),
    };
  },
};

export const productivityTools: OrbTool[] = [
  queryTasks,
  queryProjects,
  queryAgenda,
  queryTags,
  queryContentLinks,
  queryTimeTracking,
];
