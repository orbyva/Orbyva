/**
 * Tool transversal da Orb: tudo que vence ou acontece nos próximos dias, de todos os módulos, num
 * retorno só (item 2T.6). Somente leitura.
 */

import type { OrbTool, OrbToolContext } from "../types.ts";
import { OrbToolError } from "../types.ts";
import {
  clampLimit,
  describeDbError,
  exclusiveEnd,
  isoDate,
  localDateInTz,
  money,
  num,
  shiftDays,
  unwrap,
} from "../helpers.ts";
import {
  calculateInstallmentDueDates,
  compareYearMonth,
  getAnnualInstallmentDueDate,
  getInstallmentDueDate,
  resolvePaymentStartDate,
  shiftYearMonth,
  toIsoDateLocal,
} from "../recurring.ts";
import type { InstallmentDue, YearMonth } from "../recurring.ts";

/** Janela padrão: "essa semana". O teto de 60 dias é o que ainda cabe num retorno legível. */
const DIAS_PADRAO = 7;
const DIAS_MAX = 60;

/**
 * TETO DURO por módulo. O padrão é menor que o teto de propósito: numa janela de 7 dias, 10 itens
 * por módulo já respondem "o que vem por aí", e 6 módulos × 20 itens dariam 120 linhas num único
 * turno — que depois viajam em TODAS as rodadas seguintes da conversa.
 */
const ITENS_POR_MODULO_PADRAO = 10;
const ITENS_POR_MODULO_MAX = 20;

/**
 * Tetos das leituras que não dá para filtrar por data no banco: as recorrências são expandidas em
 * memória (o vencimento é calculado, não é coluna) e as manutenções precisam ser deduplicadas por
 * tipo antes de saber qual `next_date` ainda vale. Números altos o bastante para nunca cortar um
 * usuário real e baixos o bastante para o isolate não engasgar.
 */
const RECORRENCIAS_MAX = 200;
const MANUTENCOES_MAX = 300;
const VIAGENS_MAX = 200;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Modulo = "financas" | "tarefas" | "agenda" | "veiculos" | "viagens" | "metas";

const MODULOS: Modulo[] = ["financas", "tarefas", "agenda", "veiculos", "viagens", "metas"];

/** Rótulo em PT-BR de cada módulo, para a mensagem de falha parcial. */
const ROTULO_DO_MODULO: Record<Modulo, string> = {
  financas: "as contas e parcelas a vencer",
  tarefas: "as tarefas com prazo",
  agenda: "os eventos da agenda",
  veiculos: "os documentos e manutenções de veículo",
  viagens: "as viagens e marcos de viagem",
  metas: "as metas com prazo",
};

/**
 * Um item da linha do tempo. A forma é IGUAL para os seis módulos de propósito: o modelo recebe uma
 * lista única já ordenada por data, e `module`/`kind` são o que dizem de onde cada linha veio. Um
 * formato por módulo dobraria o token gasto e obrigaria o modelo a reordenar tudo na mão.
 */
interface ItemDaLinhaDoTempo {
  module: Modulo;
  kind:
    | "recorrencia"
    | "tarefa"
    | "evento"
    | "documento_veiculo"
    | "manutencao_veiculo"
    | "viagem"
    | "marco_viagem"
    | "meta";
  id: string;
  /** Data civil (`YYYY-MM-DD`) em que o item vence ou acontece. */
  date: string;
  /** Dias entre `ctx.today` e `date` (0 = hoje). */
  days_until: number;
  title: string;
  /** Contexto curto: veículo, viagem, número da parcela, hora do evento. `null` quando não há. */
  detail: string | null;
  /** Valor em reais quando o item tem dinheiro associado; `null` quando não tem. */
  value: number | null;
}

/** Dias entre duas datas civis. Ambas em UTC, então não há fuso nem horário de verão no meio. */
function diffDays(de: string, ate: string): number {
  const inicio = Date.parse(`${de}T00:00:00Z`);
  const fim = Date.parse(`${ate}T00:00:00Z`);
  return Math.round((fim - inicio) / 86_400_000);
}

function ym(iso: string): YearMonth {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

function juntar(...partes: (string | null | undefined)[]): string | null {
  const texto = partes.filter((parte): parte is string => Boolean(parte)).join(" · ");
  return texto === "" ? null : texto;
}

// ── Finanças ────────────────────────────────────────────────────────────────────────────────────

interface RecurringRow {
  id: string;
  description: string | null;
  value: number;
  frequency: string | null;
  validity: string | null;
  due_day: number | null;
  installment_count: number | null;
  payment_start_date: string | null;
  created_at: string | null;
  paid_parcels: number[] | null;
  class: { name: string; type: { nature: { name: string } | null } | null } | null;
}

/**
 * Vencimentos de uma recorrência ABERTA — sem `installment_count` e sem `validity`, o caso em que
 * `calculateInstallmentDueDates` devolve `null` ("isto não é um parcelamento").
 *
 * A tela de Finanças ignora essas recorrências nos alertas justamente porque não consegue expandi-las
 * em parcelas; aqui elas precisam aparecer, senão a assinatura mensal do dia 10 some da resposta de
 * "o que vence essa semana". A conta da DATA continua sendo a das funções compartilhadas — o que se
 * calcula aqui é só QUAL número de parcela cai na janela, para não expandir do início dos tempos.
 */
function vencimentosDeRecorrenciaAberta(
  startDate: string,
  dueDay: number,
  frequency: string | null,
  inicio: string,
  fim: string
): InstallmentDue[] {
  const dues: InstallmentDue[] = [];
  const inicioDaSerie = ym(startDate);

  if (frequency === "Anual") {
    for (let ano = Number(inicio.slice(0, 4)); ano <= Number(fim.slice(0, 4)); ano++) {
      const numero = ano - inicioDaSerie.year + 1;
      if (numero < 1) continue;
      dues.push({
        number: numero,
        dueDate: toIsoDateLocal(getAnnualInstallmentDueDate(startDate, dueDay, numero)),
      });
    }
    return dues;
  }

  const ultimoMes = ym(fim);
  for (let mes = ym(inicio); compareYearMonth(mes, ultimoMes) <= 0; mes = shiftYearMonth(mes, 1)) {
    // `compareYearMonth` devolve a diferença em meses, então +1 dá o número da parcela (1-based).
    const numero = compareYearMonth(mes, inicioDaSerie) + 1;
    if (numero < 1) continue;
    dues.push({
      number: numero,
      dueDate: toIsoDateLocal(getInstallmentDueDate(startDate, dueDay, numero)),
    });
  }
  return dues;
}

async function lerFinancas(
  ctx: OrbToolContext,
  inicio: string,
  fim: string
): Promise<ItemDaLinhaDoTempo[]> {
  const rows = unwrap<RecurringRow[]>(
    await ctx.db
      .from("recurring_transaction")
      .select(
        "id, description, value, frequency, validity, due_day, installment_count, payment_start_date, created_at, paid_parcels, class:class_id(name, type:type_id(nature:nature_id(name)))"
      )
      .eq("user_id", ctx.userId)
      .eq("status", true)
      .order("created_at", { ascending: false })
      .limit(RECORRENCIAS_MAX),
    "as recorrências"
  );

  const itens: ItemDaLinhaDoTempo[] = [];
  for (const row of rows) {
    const startDate = resolvePaymentStartDate({
      payment_start_date: row.payment_start_date ?? null,
      created_at: row.created_at ?? "",
    });
    // Sem data de início não há como situar a parcela 1, e toda a série sairia como `Invalid Date`.
    if (!ISO_DATE_RE.test(startDate)) continue;

    const parcelas =
      calculateInstallmentDueDates(
        startDate,
        row.due_day,
        row.installment_count,
        row.validity,
        row.frequency
      ) ??
      (row.due_day
        ? vencimentosDeRecorrenciaAberta(startDate, row.due_day, row.frequency, inicio, fim)
        : []);

    const pagas = new Set((row.paid_parcels ?? []).map((numero) => Number(numero)));
    const total = row.installment_count ?? null;
    const nature = row.class?.type?.nature?.name ?? null;

    for (const parcela of parcelas) {
      if (parcela.dueDate < inicio || parcela.dueDate > fim) continue;
      // Parcela já quitada não vence mais — é a mesma regra de `getRecurringDueAlerts`.
      if (pagas.has(parcela.number)) continue;
      itens.push({
        module: "financas",
        kind: "recorrencia",
        id: row.id,
        date: parcela.dueDate,
        days_until: diffDays(ctx.today, parcela.dueDate),
        title: row.description?.trim() || row.class?.name || "Conta",
        detail: juntar(
          nature,
          total && total > 1 ? `parcela ${parcela.number}/${total}` : null,
          row.class?.name
        ),
        value: money(Number(row.value) || 0),
      });
    }
  }
  return itens;
}

// ── Tarefas ─────────────────────────────────────────────────────────────────────────────────────

async function lerTarefas(
  ctx: OrbToolContext,
  inicio: string,
  fim: string,
  limite: number
): Promise<ItemDaLinhaDoTempo[]> {
  const rows = unwrap<
    {
      id: string;
      title: string;
      due_date: string;
      due_time: string | null;
      priority: string | null;
      status: string;
    }[]
  >(
    await ctx.db
      .from("task")
      .select("id, title, due_date, due_time, priority, status")
      .eq("user_id", ctx.userId)
      .neq("status", "done")
      .gte("due_date", inicio)
      .lte("due_date", fim)
      .order("due_date", { ascending: true })
      // +1 para saber que sobrou item sem precisar de um `count` separado.
      .limit(limite + 1),
    "as tarefas"
  );

  return rows.map((row) => ({
    module: "tarefas" as const,
    kind: "tarefa" as const,
    id: row.id,
    date: row.due_date,
    days_until: diffDays(ctx.today, row.due_date),
    title: row.title,
    detail: juntar(row.due_time, row.priority ? `prioridade ${row.priority}` : null, row.status),
    value: null,
  }));
}

// ── Agenda ──────────────────────────────────────────────────────────────────────────────────────

async function lerAgenda(
  ctx: OrbToolContext,
  inicio: string,
  fim: string,
  limite: number
): Promise<ItemDaLinhaDoTempo[]> {
  // `starts_at` é `timestamptz` e uma fronteira `YYYY-MM-DD` é lida como meia-noite UTC, não a do
  // usuário — mesmo tratamento de `query_agenda`: busca um dia a mais para cada lado (cobre
  // qualquer fuso, de -12 a +14) e quem decide o que entra é a data local calculada abaixo. Por
  // isso o `limit` pede uma folga: parte do que vem é descartada no filtro local.
  const rows = unwrap<{ id: string; title: string; starts_at: string; ends_at: string | null }[]>(
    await ctx.db
      .from("project_event")
      .select("id, title, starts_at, ends_at")
      .eq("user_id", ctx.userId)
      .gte("starts_at", shiftDays(inicio, -1))
      .lt("starts_at", exclusiveEnd(shiftDays(fim, 1)))
      .order("starts_at", { ascending: true })
      .limit(limite + 3),
    "os eventos"
  );

  const itens: ItemDaLinhaDoTempo[] = [];
  for (const row of rows) {
    const data = localDateInTz(row.starts_at, ctx.timezone);
    if (data < inicio || data > fim) continue;
    itens.push({
      module: "agenda",
      kind: "evento",
      id: row.id,
      date: data,
      days_until: diffDays(ctx.today, data),
      title: row.title,
      detail: row.starts_at,
      value: null,
    });
  }
  return itens;
}

// ── Veículos ────────────────────────────────────────────────────────────────────────────────────

async function lerVeiculos(
  ctx: OrbToolContext,
  inicio: string,
  fim: string,
  limite: number
): Promise<ItemDaLinhaDoTempo[]> {
  // `vehicle` tem `user_id`; `vehicle_document` e `vehicle_maintenance` NÃO (grupo (b) da regra de
  // escopo em `types.ts`) e são escopadas pelos ids do dono. Lê-se a tabela-pai inteira em vez de
  // `ownedIds` só para trazer junto marca/modelo — mesma consulta, e sem eles o item sairia como
  // "IPVA" sem dizer de qual carro.
  const veiculos = unwrap<{ id: string; brand: string; model: string; plate: string | null }[]>(
    await ctx.db.from("vehicle").select("id, brand, model, plate").eq("user_id", ctx.userId),
    "os veículos"
  );
  if (veiculos.length === 0) return [];

  const ids = veiculos.map((veiculo) => veiculo.id);
  const nomeDoVeiculo = (vehicleId: string): string => {
    const veiculo = veiculos.find((item) => item.id === vehicleId);
    if (!veiculo) return "veículo";
    return [veiculo.brand, veiculo.model].filter(Boolean).join(" ") || "veículo";
  };

  const [documentos, manutencoes] = await Promise.all([
    unwrapAsync<
      {
        id: string;
        vehicle_id: string;
        type: string;
        custom_type: string | null;
        due_date: string;
        cost: number | null;
      }[]
    >(
      ctx.db
        .from("vehicle_document")
        .select("id, vehicle_id, type, custom_type, due_date, cost")
        .in("vehicle_id", ids)
        // Documento pago não vence mais — mesma regra de `getDocumentAlerts` (`src/domain/car`).
        .eq("paid", false)
        .gte("due_date", inicio)
        .lte("due_date", fim)
        .order("due_date", { ascending: true })
        .limit(limite + 1),
      "os documentos do veículo"
    ),
    unwrapAsync<
      {
        id: string;
        vehicle_id: string;
        type: string;
        custom_type: string | null;
        service_date: string;
        next_date: string | null;
      }[]
    >(
      ctx.db
        .from("vehicle_maintenance")
        .select("id, vehicle_id, type, custom_type, service_date, next_date")
        .in("vehicle_id", ids)
        .not("next_date", "is", null)
        .order("service_date", { ascending: false })
        .limit(MANUTENCOES_MAX),
      "as manutenções do veículo"
    ),
  ]);

  const itens: ItemDaLinhaDoTempo[] = documentos.map((doc) => ({
    module: "veiculos" as const,
    kind: "documento_veiculo" as const,
    id: doc.id,
    date: doc.due_date,
    days_until: diffDays(ctx.today, doc.due_date),
    title:
      doc.type === "other" && doc.custom_type?.trim()
        ? doc.custom_type.trim()
        : doc.type.toUpperCase(),
    detail: nomeDoVeiculo(doc.vehicle_id),
    value: doc.cost === null ? null : money(Number(doc.cost) || 0),
  }));

  // Só a manutenção mais RECENTE de cada (veículo, tipo) manda no próximo vencimento — é o que
  // `getLatestMaintenanceByType` (`src/domain/car/alerts.ts`) faz. Sem isso, uma troca de óleo
  // adiantada deixa o `next_date` do registro antigo dentro da janela e a Orb avisa de um serviço
  // que já foi feito. As linhas vêm ordenadas por `service_date` desc, então a primeira de cada
  // chave é a que vale.
  const maisRecentePorTipo = new Map<string, (typeof manutencoes)[number]>();
  for (const manutencao of manutencoes) {
    const chave = `${manutencao.vehicle_id}|${manutencao.type}|${manutencao.custom_type ?? ""}`;
    if (!maisRecentePorTipo.has(chave)) maisRecentePorTipo.set(chave, manutencao);
  }

  for (const manutencao of maisRecentePorTipo.values()) {
    const proxima = manutencao.next_date;
    if (!proxima || proxima < inicio || proxima > fim) continue;
    itens.push({
      module: "veiculos",
      kind: "manutencao_veiculo",
      id: manutencao.id,
      date: proxima,
      days_until: diffDays(ctx.today, proxima),
      title:
        manutencao.type === "other" && manutencao.custom_type?.trim()
          ? manutencao.custom_type.trim()
          : manutencao.type,
      detail: nomeDoVeiculo(manutencao.vehicle_id),
      value: null,
    });
  }

  return itens;
}

// ── Viagens ─────────────────────────────────────────────────────────────────────────────────────

async function lerViagens(
  ctx: OrbToolContext,
  inicio: string,
  fim: string,
  limite: number
): Promise<ItemDaLinhaDoTempo[]> {
  // `trip` tem `user_id`; `trip_milestone` NÃO (grupo (b)) e é escopada pelos ids do dono. A leitura
  // é única — sem filtro de data — porque a MESMA lista serve para os dois usos: as viagens que
  // começam na janela e o escopo dos marcos. Uma segunda consulta só para os ids (`ownedIds`) seria
  // um round-trip a mais lendo exatamente a mesma tabela.
  const viagens = unwrap<
    {
      id: string;
      title: string;
      destination: string | null;
      start_date: string | null;
      status: string;
    }[]
  >(
    await ctx.db
      .from("trip")
      .select("id, title, destination, start_date, status")
      .eq("user_id", ctx.userId)
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(VIAGENS_MAX),
    "as viagens"
  );
  if (viagens.length === 0) return [];

  const marcos = unwrap<
    { id: string; trip_id: string; title: string; type: string; due_date: string }[]
  >(
    await ctx.db
      .from("trip_milestone")
      .select("id, trip_id, title, type, due_date")
      .in(
        "trip_id",
        viagens.map((viagem) => viagem.id)
      )
      .eq("done", false)
      .gte("due_date", inicio)
      .lte("due_date", fim)
      .order("due_date", { ascending: true })
      .limit(limite + 1),
    "os marcos das viagens"
  );

  const tituloDaViagem = (tripId: string): string =>
    viagens.find((viagem) => viagem.id === tripId)?.title ?? "viagem";

  const itens: ItemDaLinhaDoTempo[] = [];
  for (const viagem of viagens) {
    const inicioDaViagem = viagem.start_date;
    if (!inicioDaViagem || inicioDaViagem < inicio || inicioDaViagem > fim) continue;
    // Viagem cancelada continua na tabela, mas não é algo "que vem por aí".
    if (viagem.status === "cancelled") continue;
    itens.push({
      module: "viagens",
      kind: "viagem",
      id: viagem.id,
      date: inicioDaViagem,
      days_until: diffDays(ctx.today, inicioDaViagem),
      title: viagem.title,
      detail: juntar(viagem.destination, viagem.status),
      value: null,
    });
  }

  for (const marco of marcos) {
    itens.push({
      module: "viagens",
      kind: "marco_viagem",
      id: marco.id,
      date: marco.due_date,
      days_until: diffDays(ctx.today, marco.due_date),
      title: marco.title,
      detail: juntar(tituloDaViagem(marco.trip_id), marco.type),
      value: null,
    });
  }

  return itens;
}

// ── Metas ───────────────────────────────────────────────────────────────────────────────────────

async function lerMetas(
  ctx: OrbToolContext,
  inicio: string,
  fim: string,
  limite: number
): Promise<ItemDaLinhaDoTempo[]> {
  const rows = unwrap<
    {
      id: string;
      title: string;
      deadline: string;
      target_value: number;
      current_value: number;
      unit: string | null;
    }[]
  >(
    await ctx.db
      .from("personal_goal")
      .select("id, title, deadline, target_value, current_value, unit")
      .eq("user_id", ctx.userId)
      .eq("status", "active")
      .gte("deadline", inicio)
      .lte("deadline", fim)
      .order("deadline", { ascending: true })
      .limit(limite + 1),
    "as metas"
  );

  return rows.map((row) => {
    const alvo = Number(row.target_value) || 0;
    const atual = Number(row.current_value) || 0;
    return {
      module: "metas" as const,
      kind: "meta" as const,
      id: row.id,
      date: row.deadline,
      days_until: diffDays(ctx.today, row.deadline),
      title: row.title,
      detail: juntar(
        `${atual} de ${alvo}${row.unit ? ` ${row.unit}` : ""}`,
        alvo > 0 ? `${Math.round((atual / alvo) * 100)}%` : null
      ),
      value: null,
    };
  });
}

// ── Orquestração ────────────────────────────────────────────────────────────────────────────────

/** `unwrap` sobre uma query ainda não aguardada — só para caber dentro de um `Promise.all`. */
async function unwrapAsync<T>(
  query: PromiseLike<{ data: unknown; error: unknown; status?: number }>,
  what: string
): Promise<T> {
  return unwrap<T>(await query, what);
}

interface ResultadoDeModulo {
  modulo: Modulo;
  itens: ItemDaLinhaDoTempo[];
  truncado: boolean;
  erro?: OrbToolError;
}

/**
 * Roda a leitura de um módulo sem deixar a falha dele derrubar os outros: um veículo sem documento
 * não pode esconder as tarefas da semana. O erro vira dado (`modules_failed`), não exceção.
 */
async function coletar(
  modulo: Modulo,
  limite: number,
  ler: () => Promise<ItemDaLinhaDoTempo[]>
): Promise<ResultadoDeModulo> {
  try {
    const itens = (await ler()).sort(
      (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
    );
    return { modulo, itens: itens.slice(0, limite), truncado: itens.length > limite };
  } catch (erro) {
    if (erro instanceof OrbToolError) return { modulo, itens: [], truncado: false, erro };
    // Erro que não passou por `unwrap` (bug aqui dentro): a mensagem crua nunca foi escrita para o
    // modelo ler, então vai só para o log.
    console.error(`[orb] falha ao ler "${modulo}" em query_upcoming: ${describeDbError(erro)}`);
    return {
      modulo,
      itens: [],
      truncado: false,
      erro: new OrbToolError(`Não consegui ler ${ROTULO_DO_MODULO[modulo]} agora.`, "erro_de_banco"),
    };
  }
}

export const queryUpcoming: OrbTool = {
  name: "query_upcoming",
  title: "O que vem por aí",
  description:
    "Painel TRANSVERSAL do que vence ou acontece nos próximos dias, juntando num retorno só seis " +
    "módulos: contas e parcelas a vencer, tarefas com prazo, eventos da agenda, documentos e " +
    "manutenções de veículo, viagens e marcos de viagem, e metas com prazo. Use SÓ quando a " +
    "pergunta for ampla e sem módulo definido: 'o que vence essa semana?', 'o que eu tenho pela " +
    "frente?', 'tem alguma coisa importante chegando?', 'me dá um resumo do meu mês'. " +
    "NÃO USE quando a pergunta é de um módulo só — ela custa seis consultas e responde pior que a " +
    "tool específica: 'o que eu tenho pra fazer hoje' / 'o que está atrasado' → query_tasks; 'o " +
    "que tenho amanhã' / 'como está minha semana' → query_agenda; 'quantas parcelas faltam' / " +
    "'quanto tenho de despesa fixa' → query_recurring; 'quando vence o IPVA' → a tool de veículos; " +
    "'como está minha meta X' → query_goals. Também NÃO traz nada anterior a hoje: para o que já " +
    "venceu, use a tool do módulo (ex.: query_tasks com overdue: true).",
  inputSchema: {
    type: "object",
    properties: {
      start_date: {
        type: "string",
        description: "Início da janela em YYYY-MM-DD. Padrão: hoje.",
      },
      days: {
        type: "number",
        description:
          "Tamanho da janela em dias a partir do início, incluindo o próprio dia inicial (1 a 60, padrão 7).",
      },
      limit_per_module: {
        type: "number",
        description:
          "Máximo de itens por módulo (1 a 20, padrão 10). Os mais próximos vêm primeiro; quando corta, o módulo aparece em modules_truncated.",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const inicio = isoDate(input, "start_date") ?? ctx.today;
    const dias = clampLimit(num(input, "days"), DIAS_PADRAO, DIAS_MAX);
    const limite = clampLimit(
      num(input, "limit_per_module"),
      ITENS_POR_MODULO_PADRAO,
      ITENS_POR_MODULO_MAX
    );
    const fim = shiftDays(inicio, dias - 1);

    const resultados = await Promise.all([
      coletar("financas", limite, () => lerFinancas(ctx, inicio, fim)),
      coletar("tarefas", limite, () => lerTarefas(ctx, inicio, fim, limite)),
      coletar("agenda", limite, () => lerAgenda(ctx, inicio, fim, limite)),
      coletar("veiculos", limite, () => lerVeiculos(ctx, inicio, fim, limite)),
      coletar("viagens", limite, () => lerViagens(ctx, inicio, fim, limite)),
      coletar("metas", limite, () => lerMetas(ctx, inicio, fim, limite)),
    ]);

    // Sessão expirada não é falha de UM módulo: o JWT morto derruba os seis, e engolir isso aqui
    // tiraria do host a chance de reautenticar e repetir (ele decide por `code`, não pelo texto).
    const sessaoExpirada = resultados.find((item) => item.erro?.code === "auth_expirada");
    if (sessaoExpirada?.erro) throw sessaoExpirada.erro;

    const items = resultados
      .flatMap((resultado) => resultado.itens)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          MODULOS.indexOf(a.module) - MODULOS.indexOf(b.module) ||
          a.title.localeCompare(b.title)
      );

    const countByModule: Record<string, number> = {};
    const modulesTruncated: Modulo[] = [];
    const modulesFailed: { module: Modulo; error: string }[] = [];
    for (const resultado of resultados) {
      if (resultado.erro) {
        modulesFailed.push({ module: resultado.modulo, error: resultado.erro.message });
        continue;
      }
      countByModule[resultado.modulo] = resultado.itens.length;
      if (resultado.truncado) modulesTruncated.push(resultado.modulo);
    }

    return {
      today: ctx.today,
      timezone: ctx.timezone,
      start_date: inicio,
      end_date: fim,
      days: dias,
      limit_per_module: limite,
      returned: items.length,
      items,
      /** Quantos itens vieram de cada módulo LIDO COM SUCESSO — módulo que falhou não aparece. */
      count_by_module: countByModule,
      modules_truncated: modulesTruncated,
      modules_failed: modulesFailed,
      ...(modulesTruncated.length > 0
        ? {
            truncated_warning:
              `Os módulos em modules_truncated tinham mais de ${limite} itens na janela: só os mais ` +
              "próximos entraram. Avise que a lista está cortada e, se o usuário quiser aquele módulo " +
              "inteiro, chame a tool específica dele.",
          }
        : {}),
      ...(modulesFailed.length > 0
        ? {
            failed_warning:
              "Os módulos em modules_failed NÃO puderam ser lidos. O resto do retorno continua válido: " +
              "responda com o que veio e diga quais áreas ficaram de fora, em vez de afirmar que não há " +
              "nada nelas.",
          }
        : {}),
    };
  },
};

export const timelineTools: OrbTool[] = [queryUpcoming];
