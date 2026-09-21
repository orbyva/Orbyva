/** Tools de vida da Orb: hábitos, metas e conteúdo (cinema/livros/música). Somente leitura. */

import type { OrbTool } from "../types.ts";
import { OrbToolError } from "../types.ts";
import {
  bool,
  clampLimit,
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normaliza uma coluna `date[]` de entretenimento (`book.read_dates`, `album.listened_dates`).
 *
 * Espelha `normalizeEntertainmentDates` (`src/domain/entertainment/insights.ts`), inclusive a
 * DEDUPE — duas marcações no mesmo dia são uma leitura/escuta só, e é assim que a tela conta. Não
 * dá para importar a função: este diretório roda em dois runtimes e não pode depender de `src/`.
 * O ramo do literal do Postgres (`{2026-01-05,2026-02-03}`) existe porque linha antiga, importada
 * fora do client, chega assim em vez de array JSON.
 *
 * A ORDENAÇÃO no fim não é cosmética: o array do banco vem na ordem em que o usuário marcou, e
 * quem lê "a última leitura" pegando o último item devolveria a data errada para quem marcou uma
 * leitura antiga depois. `getLatestReadDate` (`src/domain/books/index.ts`) ordena pelo mesmo
 * motivo.
 */
function entertainmentDates(raw: unknown): string[] {
  let bruto: unknown[] = [];
  if (Array.isArray(raw)) bruto = raw;
  else if (typeof raw === "string" && raw.trim() !== "") {
    const texto = raw.trim();
    bruto =
      texto.startsWith("{") && texto.endsWith("}") ? texto.slice(1, -1).split(",") : [texto];
  }

  const saida: string[] = [];
  const vistas = new Set<string>();
  for (const item of bruto) {
    const iso = String(item).trim().replace(/^"|"$/g, "").slice(0, 10);
    if (!ISO_DATE_RE.test(iso) || vistas.has(iso)) continue;
    vistas.add(iso);
    saida.push(iso);
  }
  return saida.sort();
}

interface HabitRow {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  target_per_week: number;
  kind: string | null;
  is_health: boolean | null;
}

export const queryHabits: OrbTool = {
  name: "query_habits",
  title: "Hábitos",
  description:
    "Hábitos do usuário com o check-in de hoje e o progresso dos últimos 7 dias. Use para 'já fiz meu check-in hoje?', 'como está minha sequência', 'estou cumprindo meus hábitos?'.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  run: async (_input, ctx) => {
    const habits = unwrap<HabitRow[]>(
      await ctx.db
        .from("habit")
        .select("id, name, description, frequency, target_per_week, kind, is_health")
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: true }),
      "os hábitos"
    );
    if (habits.length === 0) return { today: ctx.today, habits: [] };

    const weekStart = shiftDays(ctx.today, -6);
    const logs = unwrap<{ habit_id: string; date: string; completed: boolean }[]>(
      await ctx.db
        .from("habit_log")
        .select("habit_id, date, completed")
        .in(
          "habit_id",
          habits.map((habit) => habit.id)
        )
        .gte("date", weekStart)
        .lte("date", ctx.today),
      "os check-ins"
    );

    return {
      today: ctx.today,
      week_start: weekStart,
      habits: habits.map((habit) => {
        const mine = logs.filter((log) => log.habit_id === habit.id && log.completed);
        return {
          id: habit.id,
          name: habit.name,
          description: habit.description,
          frequency: habit.frequency,
          target_per_week: habit.target_per_week,
          kind: habit.kind ?? "build",
          done_today: mine.some((log) => log.date === ctx.today),
          done_last_7_days: mine.length,
        };
      }),
    };
  },
};

export const queryGoals: OrbTool = {
  name: "query_goals",
  title: "Metas",
  description:
    "Metas pessoais do usuário com valor atual, alvo e percentual concluído. Use para 'quanto falta para a minha meta X?' ou 'quais metas estão atrasadas?'.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["active", "completed", "cancelled"],
        description: "Filtra por status. Padrão: active.",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const status = str(input, "status") ?? "active";
    const rows = unwrap<
      {
        id: string;
        title: string;
        description: string | null;
        category: string;
        target_value: number;
        current_value: number;
        unit: string | null;
        deadline: string | null;
        status: string;
      }[]
    >(
      await ctx.db
        .from("personal_goal")
        .select(
          "id, title, description, category, target_value, current_value, unit, deadline, status"
        )
        .eq("user_id", ctx.userId)
        .eq("status", status)
        .order("created_at", { ascending: false }),
      "as metas"
    );

    return {
      today: ctx.today,
      goals: rows.map((goal) => {
        const target = Number(goal.target_value) || 0;
        const current = Number(goal.current_value) || 0;
        return {
          id: goal.id,
          title: goal.title,
          category: goal.category,
          unit: goal.unit,
          target_value: target,
          current_value: current,
          remaining: Math.max(0, target - current),
          percent_complete: target > 0 ? Math.round((current / target) * 100) : null,
          deadline: goal.deadline,
          overdue: goal.deadline !== null && goal.deadline < ctx.today && current < target,
        };
      }),
    };
  },
};

export const queryMovies: OrbTool = {
  name: "query_movies",
  title: "Filmes e séries",
  description:
    "Filmes e séries da lista do usuário, com status, nota e gêneros. Use para 'me indica um filme de comédia que eu ainda não vi' ou 'o que eu assisti esse mês'.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["to_watch", "watching", "watched", "abandoned"],
        description: "Filtra por status.",
      },
      genre: { type: "string", description: "Gênero (ex.: Comedy, Drama)." },
      search: { type: "string", description: "Texto a procurar no título." },
      limit: { type: "number", description: "Máximo de linhas (1 a 100, padrão 30)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 30, 100);
    const status = str(input, "status");
    const genre = str(input, "genre");
    const search = str(input, "search");

    let query = ctx.db
      .from("movie")
      .select("imdb_id, title, year, genre, type, status, rating, score_imdb, is_favorite, poster")
      .eq("user_id", ctx.userId);
    if (status) query = query.eq("status", status);
    if (genre) query = query.contains("genre", [genre]);
    if (search) query = query.ilike("title", ilikePattern(search));

    const rows = unwrap<Record<string, unknown>[]>(
      await query.order("created_at", { ascending: false }).limit(limit),
      "os filmes"
    );
    return {
      ...limitInfo(rows.length, limit, "filmes"),
      count: rows.length,
      // `poster` vira `ui_poster`: a tela monta o carrossel com ele e o modelo nunca o vê (ver
      // `stripUiFields`). Sem esse desvio, 30 URLs entrariam no contexto de toda rodada seguinte.
      movies: rows.map(({ poster, ...resto }) => ({ ...resto, ui_poster: poster ?? null })),
    };
  },
};

export const queryBooks: OrbTool = {
  name: "query_books",
  title: "Livros",
  description:
    "Livros da estante do usuário, com status, marca-página e número de páginas. Use para 'quanto falta pra bater minha meta de páginas?' ou 'o que estou lendo?'.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["to_read", "reading", "read", "abandoned"],
        description: "Filtra por status.",
      },
      search: { type: "string", description: "Texto a procurar no título." },
      limit: { type: "number", description: "Máximo de linhas (1 a 100, padrão 30)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 30, 100);
    const status = str(input, "status");
    const search = str(input, "search");

    let query = ctx.db
      .from("book")
      .select(
        "google_id, title, authors, status, current_page, page_count, rating, published_year, read_dates, cover_url"
      )
      .eq("user_id", ctx.userId);
    if (status) query = query.eq("status", status);
    if (search) query = query.ilike("title", ilikePattern(search));

    const rows = unwrap<Record<string, unknown>[]>(
      await query.order("created_at", { ascending: false }).limit(limit),
      "os livros"
    );
    return {
      ...limitInfo(rows.length, limit, "livros"),
      count: rows.length,
      books: rows.map(({ cover_url, ...resto }) => ({ ...resto, ui_cover: cover_url ?? null })),
    };
  },
};

/**
 * `page_count` é nullable e o `book` é a única fonte de páginas do app. Livro sem esse número não
 * pode entrar na soma como zero: a Orb responderia "faltam 300 páginas" quando faltam 800.
 */
interface BookProgressRow {
  google_id: string;
  title: string;
  authors: string[] | null;
  page_count: number | null;
  status: string;
  current_page: number | null;
  read_dates: unknown;
  created_at: string | null;
}

const BOOK_PROGRESS_SELECT =
  "google_id, title, authors, page_count, status, current_page, read_dates, created_at";

/**
 * Período da consulta de leitura: `start_date`/`end_date` explícitos, atalho `year`, ou o ano
 * corrente. O padrão é o ano inteiro porque a pergunta que originou a tool é de meta anual
 * ("1000 páginas no ano") — data futura não atrapalha, `read_dates` nunca é do futuro.
 */
function readingPeriod(
  input: Record<string, unknown>,
  today: string
): { start: string; end: string } {
  let start = isoDate(input, "start_date");
  let end = isoDate(input, "end_date");

  const year = num(input, "year");
  if (year !== undefined) {
    const ano = Math.trunc(year);
    if (ano < 1900 || ano > 2999) {
      throw new OrbToolError('"year" precisa ser um ano entre 1900 e 2999.');
    }
    start = start ?? `${ano}-01-01`;
    end = end ?? `${ano}-12-31`;
  }

  const anoCorrente = today.slice(0, 4);
  return { start: start ?? `${anoCorrente}-01-01`, end: end ?? `${anoCorrente}-12-31` };
}

export const queryReadingProgress: OrbTool = {
  name: "query_reading_progress",
  title: "Progresso de leitura",
  description:
    "Quantas páginas o usuário leu num período, somadas a partir das datas em read_dates dos livros marcados como lidos. Use para 'quanto falta para eu bater a meta de ler 1000 páginas no ano?', 'quantas páginas eu li em julho?' ou 'quantos livros terminei esse ano?'. Padrão: ano corrente. COMO A CONTA É FEITA, diga isso ao usuário se ele questionar o número: cada data distinta de leitura conta uma vez, então reler um livro de 300 páginas em dois anos soma 300 em cada ano, e duas leituras dele dentro do mesmo período somam 600 (pages_read_unique_books traz a mesma soma contando cada livro só uma vez, que é o número que a tela de Livros mostra); livro lido sem data registrada entra pela data de cadastro, igual à tela, e vem contado em books_counted_by_created_at. Livro sem número de páginas cadastrado NÃO entra em pages_read e vem em books_without_page_count — quando esse count for maior que zero, avise que a soma está incompleta em vez de apresentá-la como exata. Livro em leitura não soma: o marca-página dele vem separado em in_progress.",
  inputSchema: {
    type: "object",
    properties: {
      start_date: { type: "string", description: "Início do período em YYYY-MM-DD." },
      end_date: { type: "string", description: "Fim do período em YYYY-MM-DD (inclusive)." },
      year: {
        type: "number",
        description:
          "Atalho: ano inteiro (ex.: 2026). Ignorado nos campos que start_date/end_date preencherem. Omitir os três usa o ano corrente.",
      },
      goal_pages: {
        type: "number",
        description:
          "Meta de páginas do período. Quando vier, o retorno traz pages_remaining e percent_complete prontos.",
      },
      limit: {
        type: "number",
        description:
          "Máximo de livros detalhados na lista books (1 a 100, padrão 20). Não afeta as somas.",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const { start, end } = readingPeriod(input, ctx.today);
    const limit = clampLimit(num(input, "limit"), 20, 100);
    const goalPages = num(input, "goal_pages");

    // `read_dates` é `date[]`: não há filtro de período no PostgREST que resolva isso sem listar
    // as 365 datas do ano num `overlaps`. A leitura traz a estante (só `read` e `reading`, que são
    // as duas que entram na resposta) e o recorte do período é feito em memória.
    const estante = await paginate<BookProgressRow>(
      (from, to) =>
        ctx.db
          .from("book")
          .select(BOOK_PROGRESS_SELECT)
          .eq("user_id", ctx.userId)
          .in("status", ["read", "reading"])
          .order("google_id", { ascending: true })
          .range(from, to),
      "os livros"
    );

    let pagesRead = 0;
    let pagesUniqueBooks = 0;
    let readEvents = 0;
    let booksFinished = 0;
    let booksByCreatedAt = 0;
    let eventsWithoutPageCount = 0;
    let inProgressBooks = 0;
    let bookmarkedPages = 0;
    const semPaginas: string[] = [];
    const detalhes: Record<string, unknown>[] = [];

    for (const row of estante.rows) {
      if (row.status === "reading") {
        inProgressBooks += 1;
        const marcador = Number(row.current_page);
        if (Number.isFinite(marcador) && marcador > 0) bookmarkedPages += marcador;
        continue;
      }
      if (row.status !== "read") continue;

      const todas = entertainmentDates(row.read_dates);
      let noPeriodo = todas.filter((data) => data >= start && data <= end);
      let porCadastro = false;
      if (todas.length === 0 && row.created_at) {
        // Mesma regra de `activityTouchesYear` (`src/domain/entertainment/insights.ts`): livro
        // marcado como lido sem data usa `created_at` como proxy. A data civil sai no fuso do
        // usuário, senão a leitura do dia 31 à noite cai no mês seguinte.
        const cadastro = localDateInTz(row.created_at, ctx.timezone);
        if (cadastro >= start && cadastro <= end) {
          noPeriodo = [cadastro];
          porCadastro = true;
        }
      }
      if (noPeriodo.length === 0) continue;

      booksFinished += 1;
      readEvents += noPeriodo.length;
      if (porCadastro) booksByCreatedAt += 1;

      const paginas = Number(row.page_count);
      if (Number.isFinite(paginas) && paginas > 0) {
        pagesRead += paginas * noPeriodo.length;
        pagesUniqueBooks += paginas;
      } else {
        eventsWithoutPageCount += noPeriodo.length;
        semPaginas.push(row.title);
      }

      detalhes.push({
        id: row.google_id,
        title: row.title,
        authors: Array.isArray(row.authors) ? row.authors : [],
        page_count: Number.isFinite(paginas) && paginas > 0 ? paginas : null,
        read_dates_in_period: noPeriodo,
        ...(porCadastro ? { dated_by_created_at: true } : {}),
      });
    }

    detalhes.sort((a, b) => {
      const ultimaA = (a.read_dates_in_period as string[])[
        (a.read_dates_in_period as string[]).length - 1
      ];
      const ultimaB = (b.read_dates_in_period as string[])[
        (b.read_dates_in_period as string[]).length - 1
      ];
      return ultimaB.localeCompare(ultimaA);
    });

    return {
      start_date: start,
      end_date: end,
      today: ctx.today,
      pages_read: pagesRead,
      pages_read_unique_books: pagesUniqueBooks,
      books_finished: booksFinished,
      read_events: readEvents,
      rereads_in_period: readEvents - booksFinished,
      books_counted_by_created_at: booksByCreatedAt,
      books_without_page_count: {
        count: semPaginas.length,
        read_events: eventsWithoutPageCount,
        titles: semPaginas.slice(0, 5),
        ...(semPaginas.length > 0
          ? {
              warning:
                "Estes livros não têm número de páginas cadastrado, então NÃO entraram em pages_read. Diga que a soma está incompleta em vez de tratá-la como exata.",
            }
          : {}),
      },
      in_progress: { books: inProgressBooks, bookmarked_pages: bookmarkedPages },
      ...(goalPages !== undefined
        ? {
            goal_pages: goalPages,
            pages_remaining: Math.max(0, Math.round(goalPages - pagesRead)),
            percent_complete: goalPages > 0 ? Math.round((pagesRead / goalPages) * 100) : null,
          }
        : {}),
      books: detalhes.slice(0, limit),
      ...(detalhes.length > limit ? { books_list_truncated: true } : {}),
      ...(estante.truncated
        ? {
            truncated: true,
            truncated_warning:
              "A estante tem mais livros do que o teto de leitura, então estas somas são PARCIAIS: avise o usuário.",
          }
        : {}),
    };
  },
};

/**
 * `album` tem PK COMPOSTA `(user_id, musicbrainz_id)` (`20260728160000_albums.sql`): não existe
 * coluna `id`, e o identificador que volta para o modelo é o `musicbrainz_id` — que apesar do nome
 * também guarda id do Spotify ou `manual_*` (`20260728210000_album_source_spotify.sql`).
 */
interface AlbumRow {
  musicbrainz_id: string;
  title: string;
  artists: string[] | null;
  release_year: number | null;
  album_type: string;
  status: string;
  rating: number | null;
  is_favorite: boolean | null;
  would_recommend: boolean | null;
  source: string;
  listened_dates: unknown;
}

const ALBUM_SELECT =
  "musicbrainz_id, title, artists, release_year, album_type, status, rating, is_favorite, would_recommend, source, listened_dates";

function albumOut(row: AlbumRow) {
  const escutas = entertainmentDates(row.listened_dates);
  return {
    id: row.musicbrainz_id,
    title: row.title,
    artists: Array.isArray(row.artists) ? row.artists : [],
    release_year: row.release_year,
    album_type: row.album_type,
    status: row.status,
    rating: row.rating,
    is_favorite: row.is_favorite === true,
    would_recommend: row.would_recommend !== false,
    source: row.source,
    listen_count: escutas.length,
    last_listened_at: escutas.length > 0 ? escutas[escutas.length - 1] : null,
  };
}

export const queryAlbums: OrbTool = {
  name: "query_albums",
  title: "Álbuns",
  description:
    "Álbuns e EPs salvos pelo usuário, com artista, ano, status (to_listen = para ouvir, listened = ouvido), nota, favorito e última escuta. Use para 'o que eu ainda não ouvi?', 'quais álbuns do Radiohead eu salvei?', 'meus álbuns favoritos' ou 'que nota eu dei pro álbum X'. O campo id é o musicbrainz_id (a tabela não tem coluna id): ele também pode ser um id do Spotify ou começar com manual_, então não o apresente ao usuário.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["to_listen", "listened"],
        description: "Filtra por status: to_listen (para ouvir) ou listened (ouvido).",
      },
      artist: {
        type: "string",
        description:
          "Nome (ou parte do nome) do artista. Casa com qualquer artista creditado no álbum, sem diferenciar maiúsculas.",
      },
      search: { type: "string", description: "Texto a procurar no título do álbum." },
      favorites_only: {
        type: "boolean",
        description: "true traz só os álbuns marcados como favoritos.",
      },
      limit: { type: "number", description: "Máximo de álbuns (1 a 100, padrão 30)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 30, 100);
    const status = str(input, "status");
    const artist = str(input, "artist");
    const search = str(input, "search");
    const favoritesOnly = bool(input, "favorites_only");

    const comFiltros = () => {
      let query = ctx.db.from("album").select(ALBUM_SELECT).eq("user_id", ctx.userId);
      if (status) query = query.eq("status", status);
      if (search) query = query.ilike("title", ilikePattern(search));
      if (favoritesOnly === true) query = query.eq("is_favorite", true);
      return query;
    };

    // `artists` é `text[]`: `ilike` não existe para array (o Postgres recusa o operador) e
    // `contains` exigiria o nome EXATO do artista, que o usuário nunca digita. Por isso o filtro
    // por artista roda em memória — e, quando ele vem, a leitura não pode usar `.limit()` no
    // banco: cortar antes de filtrar esconderia justamente os álbuns que casam.
    if (artist) {
      const alvo = artist.toLocaleLowerCase("pt-BR");
      const colecao = await paginate<AlbumRow>(
        (from, to) =>
          comFiltros().order("musicbrainz_id", { ascending: true }).range(from, to),
        "os álbuns"
      );
      const casaram = colecao.rows.filter((row) =>
        (Array.isArray(row.artists) ? row.artists : []).some((nome) =>
          String(nome).toLocaleLowerCase("pt-BR").includes(alvo)
        )
      );
      return {
        albums: casaram.slice(0, limit).map(albumOut),
        count: Math.min(casaram.length, limit),
        total_matching: casaram.length,
        ...(casaram.length > limit || colecao.truncated ? { truncated: true } : {}),
        ...(colecao.truncated
          ? {
              truncated_warning:
                "A coleção tem mais álbuns do que o teto de leitura, então a busca por artista pode ter deixado álbuns de fora.",
            }
          : {}),
      };
    }

    const rows = unwrap<AlbumRow[]>(
      await comFiltros().order("created_at", { ascending: false }).limit(limit),
      "os álbuns"
    );
    return {
      albums: rows.map(albumOut),
      count: rows.length,
      // Sem contagem exata do banco: página cheia é o único sinal de que há mais.
      ...(rows.length === limit ? { truncated: true } : {}),
    };
  },
};

interface SeriesRow {
  imdb_id: string;
  title: string;
  year: number | null;
  status: string;
  following: boolean | null;
  episode_count: number | null;
  rating: number | null;
}

interface EpisodeRow {
  imdb_id: string;
  season_number: number;
  episode_number: number;
  status: string;
  watched_at: string | null;
}

export const querySeriesProgress: OrbTool = {
  name: "query_series_progress",
  title: "Progresso de séries",
  description:
    "Progresso das séries do usuário: quantos episódios ele já marcou como assistidos, de quantos a série tem e qual foi o último episódio marcado. Use para 'de onde eu paro na série X?', 'quanto falta pra terminar?' ou 'quais séries estou vendo?'. LEIA episodes_tracked ANTES de falar de progresso: ele é quantos episódios têm registro, e 0 (tracking = 'sem_registro') significa que o usuário nunca marcou episódio nenhum nessa série — é 'não sei quanto ele viu', NÃO 'ele não viu nada'; nesse caso fale só pelo status da série e sugira marcar os episódios. Com tracking = 'com_registro', episodes_watched = 0 aí sim quer dizer que ele não assistiu nada. percent_complete e episodes_remaining só existem quando a série tem o total de episódios (episode_count) cadastrado.",
  inputSchema: {
    type: "object",
    properties: {
      search: { type: "string", description: "Texto a procurar no título da série." },
      status: {
        type: "string",
        enum: ["to_watch", "watching", "watched", "abandoned"],
        description: "Filtra por status da série. Omita para trazer todas.",
      },
      following: {
        type: "boolean",
        description: "true traz só as séries que o usuário acompanha na lista.",
      },
      limit: { type: "number", description: "Máximo de séries (1 a 50, padrão 20)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 20, 50);
    const search = str(input, "search");
    const status = str(input, "status");
    const following = bool(input, "following");

    let query = ctx.db
      .from("movie")
      .select("imdb_id, title, year, status, following, episode_count, rating")
      .eq("user_id", ctx.userId)
      .eq("type", "series");
    if (status) query = query.eq("status", status);
    if (following !== undefined) query = query.eq("following", following);
    if (search) query = query.ilike("title", ilikePattern(search));

    const series = unwrap<SeriesRow[]>(
      await query.order("created_at", { ascending: false }).limit(limit),
      "as séries"
    );
    const ids = series.map((row) => row.imdb_id).filter(Boolean);
    if (ids.length === 0) return { today: ctx.today, limit, series: [] };

    // Os episódios só são lidos para as séries que já couberam no `limit` — é o que segura o
    // volume desta leitura, que é a única da tool sem teto próprio de linhas.
    const progresso = await paginate<EpisodeRow>(
      (from, to) =>
        ctx.db
          .from("movie_episode")
          .select("imdb_id, season_number, episode_number, status, watched_at")
          .eq("user_id", ctx.userId)
          .in("imdb_id", ids)
          .order("imdb_id", { ascending: true })
          .order("season_number", { ascending: true })
          .order("episode_number", { ascending: true })
          .range(from, to),
      "os episódios"
    );

    // Dois cortes possíveis e um único `truncated`: a lista de séries (cortada no `limit` do banco)
    // e os episódios (cortados no teto do `paginate`). Um flag por causa esconderia a outra.
    const avisos: string[] = [];
    if (series.length === limit) {
      avisos.push(
        `Vieram ${limit} séries, que é exatamente o limite pedido: pode haver mais. Refine com search ou status em vez de subir o limit.`
      );
    }
    if (progresso.truncated) {
      avisos.push(
        "Há mais episódios registrados do que o teto de leitura, então as contagens são PARCIAIS: avise o usuário e consulte menos séries por vez."
      );
    }

    return {
      today: ctx.today,
      limit,
      ...(avisos.length > 0 ? { truncated: true, truncated_warning: avisos.join(" ") } : {}),
      series: series.map((row) => {
        const meus = progresso.rows.filter((ep) => ep.imdb_id === row.imdb_id);
        const assistidos = meus.filter((ep) => ep.status === "watched");

        let ultimo: EpisodeRow | null = null;
        for (const ep of assistidos) {
          if (
            ultimo === null ||
            ep.season_number > ultimo.season_number ||
            (ep.season_number === ultimo.season_number &&
              ep.episode_number > ultimo.episode_number)
          ) {
            ultimo = ep;
          }
        }

        // Mesma conta de `getSeriesWatchProgress` (`src/domain/movies/index.ts`), inclusive o
        // clamp: episódio marcado a mais não pode devolver 120%. Replicada porque este diretório
        // não pode importar `src/`.
        const total = Number(row.episode_count);
        const temTotal = Number.isFinite(total) && total > 0;
        const assistidosClamp = temTotal
          ? Math.min(Math.max(0, assistidos.length), total)
          : assistidos.length;

        return {
          id: row.imdb_id,
          title: row.title,
          year: row.year,
          status: row.status,
          following: row.following !== false,
          rating: row.rating,
          tracking: meus.length === 0 ? "sem_registro" : "com_registro",
          episodes_tracked: meus.length,
          episodes_watched: assistidos.length,
          episodes_skipped: meus.filter((ep) => ep.status === "skipped").length,
          episodes_total: temTotal ? total : null,
          episodes_remaining: temTotal ? total - assistidosClamp : null,
          percent_complete: temTotal ? Math.round((assistidosClamp / total) * 100) : null,
          last_watched_episode:
            ultimo === null
              ? null
              : {
                  season: ultimo.season_number,
                  episode: ultimo.episode_number,
                  watched_at: ultimo.watched_at,
                },
        };
      }),
    };
  },
};

export const lifeTools: OrbTool[] = [
  queryHabits,
  queryGoals,
  queryMovies,
  queryBooks,
  queryReadingProgress,
  queryAlbums,
  querySeriesProgress,
];
