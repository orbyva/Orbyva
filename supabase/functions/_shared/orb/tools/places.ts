/** Tool de lugares da Orb: onde já foi, o que achou lá e o que ainda quer visitar. Só leitura. */

import { OrbToolError } from "../types.ts";
import type { OrbTool, OrbToolContext } from "../types.ts";
import { bool, clampLimit, ilikeOr, limitInfo, num, str, unwrap } from "../helpers.ts";
import { normalizePlaceStatus } from "../places.ts";

/**
 * ESCOPO DESTE ARQUIVO (ver a REGRA DE ESCOPO POR TABELA no cabeçalho de `types.ts`):
 * `place_visit` e `place_visit_occurrence` são as duas do grupo (a) — têm `user_id` próprio
 * (`20240101000100_tenancy_rls.sql:110` e `20260811140000_place_visit_occurrences.sql`), então
 * `.eq("user_id", ctx.userId)` é obrigatório nas duas, além do RLS.
 */

const PLACE_SELECT =
  "id, trip_id, name, type, status, rating, notes, visited_date, amount, address, " +
  "would_recommend, created_at, trip:trip_id(id, title, destination)";

const OCCURRENCE_SELECT =
  "id, place_visit_id, visited_date, rating, notes, amount, would_recommend, created_at";

/**
 * Teto de linhas lidas do banco, independente do `limit` que o modelo pede: o `limit` recorta a
 * RESPOSTA, este teto recorta a LEITURA.
 *
 * Ele precisa de folga porque o filtro de `status` roda em memória (ver `normalizePlaceStatus`):
 * ler só `limit` linhas devolveria menos lugares do que o pedido toda vez que as primeiras não
 * casassem o status.
 */
const TETO_LUGARES = 500;

/** Teto de idas lidas de uma vez quando `include_occurrences` vem ligado. */
const TETO_IDAS = 400;

/** Espelha `PlaceType` (`src/types/places.ts`). A coluna é `text` livre; o app só grava estes. */
const PLACE_TYPES = [
  "restaurant",
  "cafe",
  "bar",
  "attraction",
  "hotel",
  "park",
  "museum",
  "shop",
  "other",
];

/** Abaixo disso o `ilike` casa quase tudo — é o mesmo piso de `src/api/search.ts:42`. */
const MIN_SEARCH_CHARS = 2;

/** Teto do texto de opinião devolvido por lugar. Mesmo valor de `tools/productivity.ts`. */
const MAX_NOTES_CHARS = 300;

interface PlaceRow {
  id: string;
  trip_id: string | null;
  name: string;
  type: string | null;
  status: string | null;
  /** `numeric(3,1)` — o PostgREST pode devolver como texto; sempre passe por `Number`. */
  rating: number | string | null;
  notes: string | null;
  visited_date: string | null;
  /** `numeric(12,2)`, mesmo caso de `rating`. */
  amount: number | string | null;
  address: string | null;
  would_recommend: boolean | null;
  created_at: string | null;
  trip: { id: string; title: string; destination: string | null } | null;
}

interface OccurrenceRow {
  id: string;
  place_visit_id: string;
  visited_date: string;
  rating: number | string | null;
  notes: string | null;
  amount: number | string | null;
  would_recommend: boolean | null;
  created_at: string | null;
}

function numero(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const parsed = Number(valor);
  return Number.isFinite(parsed) ? parsed : null;
}

function corta(texto: string | null): { notes: string | null; notes_truncated: boolean } {
  const limpo = texto?.trim() ?? "";
  if (limpo === "") return { notes: null, notes_truncated: false };
  if (limpo.length <= MAX_NOTES_CHARS) return { notes: limpo, notes_truncated: false };
  return { notes: limpo.slice(0, MAX_NOTES_CHARS), notes_truncated: true };
}

/**
 * `would_recommend` é `not null default true` no banco, mas linha antiga importada fora do client
 * pode chegar nula. `!== false` é a MESMA leitura de `src/api/places.ts`: ausência é "recomendaria".
 */
function recomenda(valor: boolean | null): boolean {
  return valor !== false;
}

/** As idas registradas de cada lugar (`place_visit` = o local, `occurrence` = cada visita). */
async function fetchOccurrences(
  ctx: OrbToolContext,
  placeIds: string[]
): Promise<{ byPlace: Map<string, OccurrenceRow[]>; truncated: boolean }> {
  const byPlace = new Map<string, OccurrenceRow[]>();
  if (placeIds.length === 0) return { byPlace, truncated: false };

  const rows = unwrap<OccurrenceRow[]>(
    await ctx.db
      .from("place_visit_occurrence")
      .select(OCCURRENCE_SELECT)
      .eq("user_id", ctx.userId)
      .in("place_visit_id", placeIds)
      .order("visited_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(TETO_IDAS),
    "as idas aos lugares"
  );

  for (const row of rows) {
    const lista = byPlace.get(row.place_visit_id) ?? [];
    lista.push(row);
    byPlace.set(row.place_visit_id, lista);
  }
  return { byPlace, truncated: rows.length >= TETO_IDAS };
}

export const queryPlaces: OrbTool = {
  name: "query_places",
  title: "Lugares",
  description:
    "Lugares que o usuário registrou — os que já visitou (com nota de 0 a 5, opinião escrita, " +
    "valor gasto e se voltaria) e os que ainda quer visitar. Use para 'onde eu comi bem e " +
    "voltaria?', 'quais restaurantes eu já fui?', 'o que eu ainda quero conhecer em Lisboa?'. " +
    "Use TAMBÉM antes de comentar um lugar que o usuário acabou de mencionar ('fui no restaurante " +
    "do Marcão'): a busca por nome diz se ele já está cadastrado ou se seria um registro novo. " +
    "A busca é TEXTUAL (ilike no nome, endereço e opinião), NUNCA semântica — procure as palavras " +
    "que provavelmente estão escritas e tente outro termo antes de afirmar que o lugar não existe. " +
    "Um lugar pode ter várias idas: os campos rating/visited_date/amount da linha refletem a ida " +
    "MAIS RECENTE; peça include_occurrences para ver o histórico completo. Só leitura — esta tool " +
    "não cadastra nem avalia lugar nenhum.",
  inputSchema: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description:
          "Texto a procurar no nome, no endereço e na opinião do lugar (busca textual, mínimo 2 caracteres). Omita para trazer os mais recentes.",
      },
      status: {
        type: "string",
        enum: ["to_visit", "visited"],
        description:
          "'visited' = já foi; 'to_visit' = está na lista de vontades. Omita para trazer os dois.",
      },
      type: {
        type: "string",
        enum: PLACE_TYPES,
        description:
          "Tipo do lugar: restaurant (restaurante), cafe (café), bar, attraction (passeio), hotel, park (parque), museum (museu), shop (loja), other (outro).",
      },
      min_rating: {
        type: "number",
        description:
          "Nota mínima, de 0 a 5. Só traz lugares já avaliados (quem está em 'to_visit' não tem nota), então dispensa combinar com status.",
      },
      would_recommend: {
        type: "boolean",
        description:
          "true = só os que o usuário voltaria/recomendaria; false = só os que ele não recomendaria. Omita para trazer os dois.",
      },
      include_occurrences: {
        type: "boolean",
        description:
          "Traz o histórico de idas de cada lugar (data, nota, opinião e valor de cada visita) e o visit_count. Custa uma consulta a mais — ligue só quando a pergunta for sobre quantas vezes foi ou sobre uma ida específica.",
      },
      limit: {
        type: "number",
        description: "Máximo de lugares (1 a 100, padrão 20).",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 20, 100);
    const search = str(input, "search");
    const status = str(input, "status");
    const tipo = str(input, "type");
    const minRating = num(input, "min_rating");
    const wouldRecommend = bool(input, "would_recommend");
    const incluirIdas = bool(input, "include_occurrences") === true;

    if (search !== undefined && search.trim().length < MIN_SEARCH_CHARS) {
      throw new OrbToolError(
        `"search" precisa de pelo menos ${MIN_SEARCH_CHARS} caracteres — com menos que isso a busca casa quase todos os lugares.`
      );
    }
    if (status !== undefined && status !== "to_visit" && status !== "visited") {
      throw new OrbToolError('"status" precisa ser "to_visit" ou "visited".');
    }
    if (minRating !== undefined && (minRating < 0 || minRating > 5)) {
      throw new OrbToolError('"min_rating" precisa estar entre 0 e 5.');
    }

    let query = ctx.db.from("place_visit").select(PLACE_SELECT).eq("user_id", ctx.userId);
    if (tipo) query = query.eq("type", tipo);
    // `.gte` no Postgres já descarta `rating` nulo, que é o caso de todo lugar ainda não visitado.
    if (minRating !== undefined) query = query.gte("rating", minRating);
    if (wouldRecommend !== undefined) query = query.eq("would_recommend", wouldRecommend);
    // Nome, endereço e opinião — as mesmas três colunas que a busca global do app varre em
    // `place_visit` (`src/api/search.ts`), porque "o hambúrguer do Marcão" tanto pode estar no nome
    // quanto no texto que o usuário escreveu sobre o lugar.
    if (search) query = query.or(ilikeOr(["name", "address", "notes"], search.trim()));

    const rows = unwrap<PlaceRow[]>(
      await query
        .order("visited_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(TETO_LUGARES),
      "os lugares"
    );

    // O `status` é normalizado e filtrado EM MEMÓRIA, nunca no banco: `place_visit.status` só
    // existe desde `20260727210000_place_trip_wishlist.sql` e linha anterior a ela chega nula. Um
    // `.eq("status", …)` esconderia esses registros antigos e a Orb responderia "você nunca foi
    // lá" sobre um lugar que está cadastrado. Mesma regra de `src/domain/places`.
    const normalizados = rows.map((row) => ({
      row,
      status: normalizePlaceStatus(row.status, row.visited_date),
    }));
    const casados = status
      ? normalizados.filter((item) => item.status === status)
      : normalizados;

    const pagina = casados.slice(0, limit);
    const idas = incluirIdas
      ? await fetchOccurrences(
          ctx,
          pagina.map((item) => item.row.id)
        )
      : { byPlace: new Map<string, OccurrenceRow[]>(), truncated: false };

    const places = pagina.map(({ row, status: statusDoLugar }) => {
      const historico = idas.byPlace.get(row.id) ?? [];
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        status: statusDoLugar,
        rating: numero(row.rating),
        would_recommend: recomenda(row.would_recommend),
        visited_date: row.visited_date,
        amount: numero(row.amount),
        address: row.address,
        ...corta(row.notes),
        trip: row.trip
          ? { id: row.trip.id, title: row.trip.title, destination: row.trip.destination }
          : null,
        created_at: row.created_at,
        ...(incluirIdas
          ? {
              visit_count: historico.length,
              occurrences: historico.map((ida) => ({
                id: ida.id,
                visited_date: ida.visited_date,
                rating: numero(ida.rating),
                amount: numero(ida.amount),
                would_recommend: recomenda(ida.would_recommend),
                ...corta(ida.notes),
              })),
            }
          : {}),
      };
    });

    // Dois cortes possíveis, e os dois precisam virar `truncated`: a PÁGINA cheia (`limitInfo`) e a
    // LEITURA que bateu o teto do banco. O segundo não é redundante — o filtro de `status` roda
    // depois, então dá para voltar menos lugares que o `limit` e ainda assim ter ficado gente de
    // fora. `prompts.ts` manda o modelo avisar quando `truncated` vem, e ensina a inferir "lista
    // completa" quando ele não vem: omitir aqui viraria "esses são todos os seus lugares".
    const cortadoNoBanco = rows.length >= TETO_LUGARES;

    return {
      today: ctx.today,
      returned: places.length,
      /** Quantos casaram os filtros nesta leitura — piso, não total, quando `truncated` vem. */
      matched: casados.length,
      /**
       * Contagens DENTRO do conjunto que casou os filtros, nunca da base inteira: numa chamada com
       * `status: "visited"` o `matched_to_visit` é 0 por construção. O prefixo `matched_` existe
       * porque `to_visit_count` seco levava o modelo a responder "você não tem nenhum lugar para
       * visitar" quando a pergunta tinha filtrado justamente os visitados.
       */
      matched_visited: casados.filter((item) => item.status === "visited").length,
      matched_to_visit: casados.filter((item) => item.status === "to_visit").length,
      places,
      ...(cortadoNoBanco
        ? {
            limit,
            truncated: true,
            truncated_warning:
              `A leitura parou em ${TETO_LUGARES} lugares e as contagens valem só para os que ` +
              "vieram. Estreite com search, type, status ou min_rating em vez de subir o limit.",
          }
        : limitInfo(places.length, limit, "lugares")),
      ...(idas.truncated
        ? {
            occurrences_truncated: true,
            occurrences_truncated_warning:
              `O histórico de idas foi cortado em ${TETO_IDAS} registros no total, então ` +
              "visit_count pode estar abaixo do real. Peça menos lugares por vez.",
          }
        : {}),
    };
  },
};

export const placesTools: OrbTool[] = [queryPlaces];
