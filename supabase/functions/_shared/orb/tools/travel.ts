/** Tools de viagens da Orb: viagens, roteiro de um dia e gastos. Somente leitura. */

import { OrbToolError } from "../types.ts";
import type { OrbTool, OrbToolContext } from "../types.ts";
import { clampLimit, isoDate, money, num, paginate, shiftDays, str, unwrap } from "../helpers.ts";
import { tripEffectiveStatus } from "../domain.ts";

/**
 * ESCOPO DESTE ARQUIVO (ver a REGRA DE ESCOPO POR TABELA no cabeçalho de `types.ts`):
 * `trip` é do grupo (a) — tem `user_id` e leva `.eq("user_id", ctx.userId)` obrigatório.
 * `trip_stop`, `trip_itinerary_day`, `trip_itinerary_activity` e `trip_expense` são do grupo (b):
 * NÃO têm `user_id` (um `.eq("user_id", …)` nelas dá 42703 em runtime, que vira um "não consegui
 * consultar" sem causa aparente) e só podem ser escopadas por `.in("<pai>_id", ids)`, com os ids
 * saindo sempre de `fetchOwnedTrips`. `trip_itinerary_activity` pende de `day_id`, não de
 * `trip_id`: o caminho é trip → day → activity.
 */

const TRIP_SELECT = "id, title, destination, start_date, end_date, status, budget, notes";

const STOP_SELECT = "trip_id, name, start_date, end_date, sort_order";

const DAY_SELECT = "id, trip_id, day_number, date, title, notes";

const ACTIVITY_SELECT =
  "id, day_id, title, activity_time, arrival_time, category, transport_mode, origin_label, destination_label, notes, link_url, is_reserved, visit_status, sort_order";

const EXPENSE_SELECT =
  "id, trip_id, description, amount, category, expense_date, visibility, created_by_user_id, paid_by_user_id, place_visit_id";

/**
 * Tetos de leitura por tabela. São independentes do `limit` que o modelo pede: o `limit` recorta a
 * RESPOSTA, estes tetos recortam o que sai do banco, para uma base grande não envenenar o turno
 * inteiro (e todas as rodadas seguintes, que recarregam o histórico).
 */
const TETO_VIAGENS = 200;
const TETO_PARADAS = 600;
const TETO_DIAS = 400;
const TETO_ATIVIDADES = 300;
const TETO_GASTOS = 2000;

interface TripRow {
  id: string;
  title: string;
  destination: string | null;
  start_date: string;
  end_date: string;
  status: string;
  budget: number | string | null;
  notes: string | null;
}

interface TripStopRow {
  trip_id: string;
  name: string;
  start_date: string;
  end_date: string;
  sort_order: number;
}

interface ItineraryDayRow {
  id: string;
  trip_id: string;
  day_number: number;
  date: string | null;
  title: string | null;
  notes: string | null;
}

interface ActivityRow {
  id: string;
  day_id: string;
  title: string;
  activity_time: string | null;
  arrival_time: string | null;
  category: string | null;
  transport_mode: string | null;
  origin_label: string | null;
  destination_label: string | null;
  notes: string | null;
  link_url: string | null;
  is_reserved: boolean | null;
  visit_status: string | null;
  sort_order: number;
}

interface ExpenseRow {
  id: string;
  trip_id: string;
  description: string;
  amount: number | string;
  category: string;
  expense_date: string;
  visibility: string | null;
  created_by_user_id: string | null;
  paid_by_user_id: string | null;
  place_visit_id: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida o `trip_id` ANTES de ir ao banco: um id inventado pelo modelo vira `22P02 (invalid input
 * syntax for uuid)` no Postgres, que chega ao usuário como "não consegui ler as viagens" — erro de
 * banco no lugar de um recado que o modelo consegue corrigir sozinho.
 */
function tripIdArg(input: Record<string, unknown>, key = "trip_id"): string | undefined {
  const raw = str(input, key);
  if (raw === undefined) return undefined;
  if (!UUID.test(raw)) {
    throw new OrbToolError(
      `"${key}" precisa ser o id (uuid) de uma viagem — use query_trips para descobrir o id.`
    );
  }
  return raw;
}

/** Diferença em dias entre duas datas civis `YYYY-MM-DD` (positiva quando `to` vem depois). */
function diffDays(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Status efetivo da viagem. A regra em si mora em `_shared/orb/domain.ts` e é a MESMA que
 * `enrichTrip` (`src/domain/travel/index.ts`) aplica na tela de Viagens — aqui só se traduz o
 * `today` do contexto em dias civis. Era uma cópia; não volte a ser.
 */
function derivarStatus(trip: TripRow, today: string): string {
  return tripEffectiveStatus(
    trip.status,
    diffDays(today, trip.start_date),
    diffDays(today, trip.end_date)
  );
}

/** Minúsculas sem acento: o modelo escreve "sao paulo" e a parada está gravada como "São Paulo". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Corta texto livre — a nota inteira de 20 atividades sozinha já estoura o turno. */
function trunc(texto: string | null, max = 240): string | null {
  if (!texto) return null;
  return texto.length <= max ? texto : `${texto.slice(0, max)}…`;
}

/** `numeric` volta do PostgREST como número, mas linha legada pode vir como texto. */
function toNumber(valor: number | string | null): number {
  if (valor === null) return 0;
  const parsed = Number(valor);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Viagens do usuário. É a RAIZ do escopo das três tools: os ids daqui são o único caminho até
 * `trip_stop`, `trip_itinerary_day` e `trip_expense`, que não têm `user_id` próprio.
 *
 * Faz o mesmo que `ownedIds(ctx, "trip")` — `.eq("user_id", ctx.userId)` em `trip` — devolvendo
 * também as colunas que as três tools precisam (título, datas, orçamento), para não ler a mesma
 * tabela duas vezes por chamada.
 *
 * Só traz viagem PRÓPRIA. Viagem compartilhada em que o usuário entrou como `editor`
 * (`trip_member`) fica de fora de propósito: o RLS a liberaria, mas ler a viagem de outra pessoa
 * exigiria repetir a cautela de visibilidade em cada tabela-filha — e um falso "não achei" é bem
 * menos grave que mostrar dado de terceiro.
 */
async function fetchOwnedTrips(ctx: OrbToolContext, tripId?: string): Promise<TripRow[]> {
  let query = ctx.db.from("trip").select(TRIP_SELECT).eq("user_id", ctx.userId);
  if (tripId) query = query.eq("id", tripId);
  return unwrap<TripRow[]>(
    await query.order("start_date", { ascending: false }).limit(TETO_VIAGENS),
    "as viagens"
  );
}

/** Paradas (cidades) das viagens informadas. Escopo do grupo (b): sempre por `trip_id`. */
async function fetchStops(ctx: OrbToolContext, tripIds: string[]): Promise<TripStopRow[]> {
  if (tripIds.length === 0) return [];
  return unwrap<TripStopRow[]>(
    await ctx.db
      .from("trip_stop")
      .select(STOP_SELECT)
      .in("trip_id", tripIds)
      .order("sort_order", { ascending: true })
      .limit(TETO_PARADAS),
    "as paradas das viagens"
  );
}

/** `YYYY-MM-DD` do dia de roteiro, com o fallback que o app usa quando `date` é nulo. */
function dataDoDia(day: ItineraryDayRow, trip: TripRow): string {
  if (day.date) return day.date.slice(0, 10);
  // `trip_itinerary_day.date` é nullable e há linha antiga sem data. O app cria o roteiro com
  // `dia N = start_date + (N-1)` (`generateItineraryDays`), então é essa a data do dia N.
  return shiftDays(trip.start_date, day.day_number - 1);
}

function resumoDeViagem(trip: TripRow, today: string) {
  const ateInicio = diffDays(today, trip.start_date);
  return {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    start_date: trip.start_date,
    end_date: trip.end_date,
    status: derivarStatus(trip, today),
    days_until_start: ateInicio >= 0 ? ateInicio : null,
    duration_days: diffDays(trip.start_date, trip.end_date) + 1,
  };
}

export const queryTrips: OrbTool = {
  name: "query_trips",
  title: "Viagens",
  description:
    "Viagens do usuário com destino, paradas (cidades e período de cada uma), datas, status e orçamento. Use para 'quais são minhas próximas viagens?', 'quando eu vou pra Portugal?' ou 'que viagens eu fiz esse ano?'. O status é o efetivo, calculado pelas datas, igual à tela de Viagens. Para o roteiro de um dia use query_trip_day_plan; para gastos, query_trip_expenses.",
  inputSchema: {
    type: "object",
    properties: {
      period: {
        type: "string",
        enum: ["upcoming", "past", "all"],
        description:
          "Recorte no tempo: 'upcoming' (ainda não terminaram, da mais próxima para a mais distante), 'past' (já terminadas) ou 'all' (padrão, da mais recente para a mais antiga).",
      },
      status: {
        type: "string",
        enum: ["planning", "upcoming", "ongoing", "completed", "cancelled"],
        description: "Filtra pelo status efetivo da viagem.",
      },
      search: {
        type: "string",
        description:
          "Texto a procurar no título, no destino ou no nome das paradas. Pode vir sem acento.",
      },
      limit: { type: "number", description: "Máximo de viagens na resposta (1 a 50, padrão 10)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 10, 50);
    const period = str(input, "period") ?? "all";
    const statusFiltro = str(input, "status");
    const search = str(input, "search");

    const trips = await fetchOwnedTrips(ctx);
    if (trips.length === 0) return { today: ctx.today, trips: [], truncated: false };

    // As paradas entram antes do filtro porque `search` também casa com o nome delas: numa viagem
    // multi-cidade o destino gravado é o rótulo agregado ("Europa"), e procurar por "Roma" sem
    // olhar as paradas não acharia nada.
    const stops = await fetchStops(
      ctx,
      trips.map((trip) => trip.id)
    );
    const paradasPorViagem = new Map<string, TripStopRow[]>();
    for (const stop of stops) {
      const atual = paradasPorViagem.get(stop.trip_id) ?? [];
      atual.push(stop);
      paradasPorViagem.set(stop.trip_id, atual);
    }

    const alvo = search ? normalizar(search) : undefined;
    const selecionadas = trips
      .map((trip) => ({
        trip,
        status: derivarStatus(trip, ctx.today),
        stops: paradasPorViagem.get(trip.id) ?? [],
      }))
      .filter(({ trip, status, stops: paradas }) => {
        if (period === "upcoming" && trip.end_date < ctx.today) return false;
        if (period === "past" && trip.end_date >= ctx.today) return false;
        if (statusFiltro && status !== statusFiltro) return false;
        if (alvo) {
          const campos = [trip.title, trip.destination ?? "", ...paradas.map((p) => p.name)];
          if (!campos.some((campo) => normalizar(campo).includes(alvo))) return false;
        }
        return true;
      });

    // 'upcoming' quer a próxima viagem primeiro; nos outros recortes a mais recente é a relevante.
    const ordenadas =
      period === "upcoming"
        ? [...selecionadas].sort((a, b) => a.trip.start_date.localeCompare(b.trip.start_date))
        : selecionadas;

    return {
      today: ctx.today,
      trips: ordenadas.slice(0, limit).map(({ trip, stops: paradas }) => ({
        ...resumoDeViagem(trip, ctx.today),
        budget: trip.budget === null ? null : money(toNumber(trip.budget)),
        notes: trunc(trip.notes),
        stops: paradas.slice(0, 12).map((parada) => ({
          name: parada.name,
          start_date: parada.start_date,
          end_date: parada.end_date,
        })),
      })),
      truncated: ordenadas.length > limit,
    };
  },
};

export const queryTripDayPlan: OrbTool = {
  name: "query_trip_day_plan",
  title: "Roteiro do dia",
  description:
    "Roteiro de UM dia de viagem: as atividades daquele dia com horário, tipo, reserva e deslocamentos, mais a cidade em que o usuário está nesse dia. Use para 'o que eu vou fazer amanhã em São Paulo?', 'qual é o roteiro de hoje?' ou 'o que tem no dia 12 da viagem?'. Sem 'date' responde sobre hoje. Quando a pergunta citar uma cidade, mande 'city': o dia é conferido contra as paradas da viagem, para não devolver o roteiro do dia certo numa cidade errada. Para a lista de viagens use query_trips.",
  inputSchema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Dia do roteiro em YYYY-MM-DD. Padrão: hoje.",
      },
      city: {
        type: "string",
        description:
          "Cidade citada na pergunta (ex.: 'São Paulo'). Casa com o nome das paradas da viagem; pode vir sem acento.",
      },
      trip_id: {
        type: "string",
        description: "Id (uuid) da viagem, quando a pergunta já apontar uma. Ver query_trips.",
      },
      limit: {
        type: "number",
        description: "Máximo de atividades por dia na resposta (1 a 100, padrão 40).",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 40, 100);
    const date = isoDate(input, "date") ?? ctx.today;
    const city = str(input, "city");
    const tripId = tripIdArg(input);

    const trips = await fetchOwnedTrips(ctx, tripId);
    if (tripId && trips.length === 0) {
      throw new OrbToolError("Não achei essa viagem na sua lista.", "nao_encontrado");
    }

    // Só viagem que cobre a data pode ter roteiro nesse dia.
    const noPeriodo = trips.filter((trip) => trip.start_date <= date && date <= trip.end_date);
    if (noPeriodo.length === 0) {
      return {
        date,
        today: ctx.today,
        city: city ?? null,
        days: [],
        trips_on_date: [],
        truncated: false,
      };
    }

    const stops = await fetchStops(
      ctx,
      noPeriodo.map((trip) => trip.id)
    );
    const paradasNoDia = stops.filter(
      (parada) => parada.start_date <= date && date <= parada.end_date
    );

    let candidatas = noPeriodo;
    if (city) {
      const alvo = normalizar(city);
      // A parada precisa casar no NOME **e** conter a data: numa eurotrip (Paris 1-5, Roma 6-10),
      // casar só pelo nome devolveria o roteiro do dia 8 — que é em Roma — para quem perguntou de
      // Paris. É esse par (nome + data) que impede a resposta certa na cidade errada.
      const porParada = new Set(
        paradasNoDia.filter((parada) => normalizar(parada.name).includes(alvo)).map((p) => p.trip_id)
      );
      // Fallback só para viagem SEM parada cadastrada (legado): aí o único nome de cidade que
      // existe é `trip.destination`. Viagem COM paradas é descrita por elas — cair no destino
      // agregado ("Europa") reabriria exatamente o furo de cima.
      const comParada = new Set(stops.map((parada) => parada.trip_id));
      const porDestino = new Set(
        noPeriodo
          .filter(
            (trip) =>
              !comParada.has(trip.id) &&
              trip.destination !== null &&
              normalizar(trip.destination).includes(alvo)
          )
          .map((trip) => trip.id)
      );
      candidatas = noPeriodo.filter((trip) => porParada.has(trip.id) || porDestino.has(trip.id));

      if (candidatas.length === 0) {
        // Nenhuma viagem põe o usuário nessa cidade nesse dia. `stops_on_date` diz onde ele
        // realmente está, que é a única resposta útil aqui.
        return {
          date,
          today: ctx.today,
          city,
          city_match: false,
          days: [],
          stops_on_date: paradasNoDia.map((parada) => ({
            trip_id: parada.trip_id,
            city: parada.name,
            start_date: parada.start_date,
            end_date: parada.end_date,
          })),
          trips_on_date: noPeriodo.map((trip) => resumoDeViagem(trip, ctx.today)),
          truncated: false,
        };
      }
    }

    const viagemPorId = new Map(candidatas.map((trip) => [trip.id, trip]));
    const dias = unwrap<ItineraryDayRow[]>(
      await ctx.db
        .from("trip_itinerary_day")
        .select(DAY_SELECT)
        .in(
          "trip_id",
          candidatas.map((trip) => trip.id)
        )
        .order("day_number", { ascending: true })
        .limit(TETO_DIAS),
      "o roteiro das viagens"
    );

    const diasDoDia = dias.filter((dia) => {
      const trip = viagemPorId.get(dia.trip_id);
      return trip !== undefined && dataDoDia(dia, trip) === date;
    });

    // `trip_itinerary_activity` pende de `day_id`, não de `trip_id`: o escopo é a lista de dias que
    // já saiu de viagens do usuário.
    const atividades =
      diasDoDia.length === 0
        ? []
        : unwrap<ActivityRow[]>(
            await ctx.db
              .from("trip_itinerary_activity")
              .select(ACTIVITY_SELECT)
              .in(
                "day_id",
                diasDoDia.map((dia) => dia.id)
              )
              .order("sort_order", { ascending: true })
              .limit(TETO_ATIVIDADES),
            "as atividades do roteiro"
          );

    let truncated = false;
    const days = diasDoDia.map((dia) => {
      const trip = viagemPorId.get(dia.trip_id) as TripRow;
      const doDia = atividades.filter((atividade) => atividade.day_id === dia.id);
      if (doDia.length > limit) truncated = true;
      const parada = paradasNoDia.find((p) => p.trip_id === trip.id);
      return {
        trip_id: trip.id,
        trip_title: trip.title,
        day_id: dia.id,
        day_number: dia.day_number,
        day_title: dia.title,
        city: parada?.name ?? trip.destination,
        notes: trunc(dia.notes),
        activity_count: doDia.length,
        activities: doDia.slice(0, limit).map((atividade) => ({
          id: atividade.id,
          title: atividade.title,
          activity_time: atividade.activity_time,
          arrival_time: atividade.arrival_time,
          category: atividade.category,
          transport_mode: atividade.transport_mode,
          origin: atividade.origin_label,
          destination: atividade.destination_label,
          is_reserved: atividade.is_reserved === true,
          visit_status: atividade.visit_status ?? "pending",
          link_url: atividade.link_url,
          notes: trunc(atividade.notes),
        })),
      };
    });

    return {
      date,
      today: ctx.today,
      city: city ?? null,
      city_match: city ? true : null,
      days,
      truncated,
    };
  },
};

/**
 * FILTRO DE SEGURANÇA, NÃO DE CONVENIÊNCIA. Réplica de `src/api/travel.ts:242-248`.
 *
 * O RLS de `trip_expense` libera a linha para QUALQUER membro da viagem (`is_trip_member`), então é
 * este código — e só ele — que impede o gasto PESSOAL de outro membro de aparecer na resposta da
 * Orb. Nunca troque por um filtro no banco sozinho, nunca remova para "simplificar".
 */
function podeVer(row: ExpenseRow, userId: string): boolean {
  const visibility = row.visibility ?? "personal";
  if (visibility === "shared") return true;
  if (!row.created_by_user_id) return false;
  return row.created_by_user_id === userId;
}

export const queryTripExpenses: OrbTool = {
  name: "query_trip_expenses",
  title: "Gastos de viagem",
  description:
    "Gastos lançados nas viagens do usuário, com total, quebra por categoria, orçamento restante e a lista das despesas. Use para 'quanto eu já gastei na viagem pra Portugal?', 'quanto foi de hospedagem?' ou 'estourei o orçamento da viagem?'. Traz só o que este usuário pode ver: os gastos compartilhados da viagem e os pessoais dele — gasto pessoal de outro participante nunca entra, então o total pode ser menor que o que o grupo gastou.",
  inputSchema: {
    type: "object",
    properties: {
      trip_id: {
        type: "string",
        description: "Id (uuid) da viagem. Ver query_trips. Omita para somar todas as viagens.",
      },
      category: {
        type: "string",
        enum: ["transport", "lodging", "food", "activity", "shopping", "other"],
        description: "Filtra por categoria do gasto.",
      },
      start_date: { type: "string", description: "Data do gasto a partir de (YYYY-MM-DD)." },
      end_date: { type: "string", description: "Data do gasto até (YYYY-MM-DD, inclusive)." },
      limit: { type: "number", description: "Máximo de gastos listados (1 a 100, padrão 20)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 20, 100);
    const tripId = tripIdArg(input);
    const category = str(input, "category");
    const startDate = isoDate(input, "start_date");
    const endDate = isoDate(input, "end_date");

    const trips = await fetchOwnedTrips(ctx, tripId);
    if (tripId && trips.length === 0) {
      throw new OrbToolError("Não achei essa viagem na sua lista.", "nao_encontrado");
    }
    if (trips.length === 0) {
      return {
        today: ctx.today,
        total: 0,
        shared_total: 0,
        personal_total: 0,
        count: 0,
        by_category: [],
        trips: [],
        expenses: [],
        truncated: false,
      };
    }

    const tripIds = trips.map((trip) => trip.id);
    const viagemPorId = new Map(trips.map((trip) => [trip.id, trip]));

    // Lê TUDO que casa com os filtros (em páginas) antes de recortar: total somado só sobre a
    // primeira página seria um número errado com cara de exato — o pior modo de falha aqui.
    const { rows, truncated: paginaTruncada } = await paginate<ExpenseRow>(
      (from, to) => {
        let query = ctx.db
          .from("trip_expense")
          .select(EXPENSE_SELECT)
          .in("trip_id", tripIds)
          // Mesmo filtro de `podeVer`, aplicado no banco: é defesa em profundidade e mantém o
          // total honesto quando a leitura pagina. A garantia continua sendo o `podeVer` abaixo.
          .or(`visibility.eq.shared,created_by_user_id.eq.${ctx.userId}`);
        if (category) query = query.eq("category", category);
        if (startDate) query = query.gte("expense_date", startDate);
        if (endDate) query = query.lte("expense_date", endDate);
        return query
          .order("expense_date", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to);
      },
      "os gastos das viagens",
      { max: TETO_GASTOS }
    );

    const visiveis = rows.filter((row) => podeVer(row, ctx.userId));

    let total = 0;
    let sharedTotal = 0;
    const porCategoria = new Map<string, { total: number; count: number }>();
    const porViagem = new Map<string, number>();
    for (const row of visiveis) {
      const valor = toNumber(row.amount);
      total += valor;
      if ((row.visibility ?? "personal") === "shared") sharedTotal += valor;
      const categoria = porCategoria.get(row.category) ?? { total: 0, count: 0 };
      categoria.total += valor;
      categoria.count += 1;
      porCategoria.set(row.category, categoria);
      porViagem.set(row.trip_id, (porViagem.get(row.trip_id) ?? 0) + valor);
    }

    // Só as viagens que aparecem no recorte (ou a pedida explicitamente) entram no resumo.
    const viagensDoRecorte = tripId ? trips : trips.filter((trip) => porViagem.has(trip.id));

    return {
      today: ctx.today,
      trip_id: tripId ?? null,
      start_date: startDate ?? null,
      end_date: endDate ?? null,
      total: money(total),
      shared_total: money(sharedTotal),
      personal_total: money(total - sharedTotal),
      count: visiveis.length,
      by_category: [...porCategoria.entries()]
        .map(([categoria, dados]) => ({
          category: categoria,
          total: money(dados.total),
          count: dados.count,
        }))
        .sort((a, b) => b.total - a.total),
      trips: viagensDoRecorte.slice(0, 20).map((trip) => {
        const gasto = porViagem.get(trip.id) ?? 0;
        const orcamento = trip.budget === null ? null : toNumber(trip.budget);
        return {
          id: trip.id,
          title: trip.title,
          budget: orcamento === null ? null : money(orcamento),
          // Sobra calculada em cima do que ESTE usuário enxerga. Em viagem compartilhada a tela usa
          // só o total do grupo (`sumTripSpent`), que é o `shared_total` acima — os dois números
          // vão juntos de propósito, para o modelo não ter que escolher um sozinho.
          spent: money(gasto),
          budget_remaining: orcamento === null ? null : money(orcamento - gasto),
        };
      }),
      expenses: visiveis.slice(0, limit).map((row) => ({
        id: row.id,
        trip_id: row.trip_id,
        trip_title: viagemPorId.get(row.trip_id)?.title ?? null,
        description: row.description,
        amount: money(toNumber(row.amount)),
        category: row.category,
        expense_date: row.expense_date,
        visibility: row.visibility ?? "personal",
        created_by_me: row.created_by_user_id === ctx.userId,
        paid_by_me: row.paid_by_user_id === null ? null : row.paid_by_user_id === ctx.userId,
        from_place_visit: row.place_visit_id !== null,
      })),
      truncated: paginaTruncada || visiveis.length > limit,
    };
  },
};

export const travelTools: OrbTool[] = [queryTrips, queryTripDayPlan, queryTripExpenses];
