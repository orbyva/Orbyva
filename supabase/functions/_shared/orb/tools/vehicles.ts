/** Tools de veículos da Orb: a garagem (com abastecimentos e manutenções) e o que está vencendo. */

import { OrbToolError } from "../types.ts";
import type { OrbTool, OrbToolContext } from "../types.ts";
import { clampLimit, ilikeOr, money, num, str, unwrap } from "../helpers.ts";
import {
  DATE_WARNING_DAYS,
  calculateFuelConsumption,
  getDocumentAlerts,
  getMaintenanceAlerts,
  getMaintenanceTypeLabel,
  normalizeVehicleKind,
} from "../vehicles.ts";
import type { MaintenanceType } from "../vehicles.ts";

/**
 * ESCOPO DESTE ARQUIVO (ver a REGRA DE ESCOPO POR TABELA no cabeçalho de `types.ts`):
 * `vehicle` é do grupo (a) — tem `user_id` (`20240101000100_tenancy_rls.sql:112`) e leva
 * `.eq("user_id", ctx.userId)` obrigatório. `vehicle_maintenance`, `vehicle_fuel_log` e
 * `vehicle_document` são do grupo (b): NÃO têm a coluna (`20240101000050_baseline_core_schema.sql`
 * :239, :255, :267 — o RLS delas vai pelo pai) e só podem ser escopadas por
 * `.in("vehicle_id", <ids do dono>)`. Um `.eq("user_id", …)` nelas dá 42703 em runtime, que
 * `registry.ts` engole e entrega ao modelo como "não consegui consultar".
 *
 * Os ids saem SEMPRE de `fetchVehicles`, que é `vehicle` filtrada por `user_id` — a mesma consulta
 * que `ownedIds(ctx, "vehicle")` faria, só que trazendo junto marca/modelo/km, que as duas tools
 * precisam de qualquer jeito. Nunca monte a lista de ids de outra origem.
 */

const VEHICLE_SELECT =
  "id, kind, brand, model, year, plate, color, current_km, fuel_type, purchase_date, notes";

const FUEL_SELECT = "id, vehicle_id, date, liters, total_cost, km, station";

const MAINTENANCE_SELECT =
  "id, vehicle_id, type, custom_type, service_date, km_at_service, cost, shop, next_km, next_date";

const DOCUMENT_SELECT = "id, vehicle_id, type, custom_type, due_date, cost, paid";

/**
 * Tetos de leitura por tabela, independentes do `limit` que o modelo pede: o `limit` recorta a
 * RESPOSTA, estes recortam o que sai do banco. Manutenção tem o maior porque a regra de alerta
 * precisa da última troca de CADA tipo acompanhado (até 14 por veículo).
 */
const TETO_VEICULOS = 50;
const TETO_ABASTECIMENTOS = 400;
const TETO_MANUTENCOES = 600;
const TETO_DOCUMENTOS = 300;

/** Quantos registros recentes de cada tipo entram no resumo de um veículo. */
const ULTIMOS_POR_VEICULO = 3;

/** Abaixo disso o `ilike` casa quase todo veículo — mesmo piso de `tools/places.ts`. */
const MIN_SEARCH_CHARS = 2;

/** Teto do texto livre devolvido por veículo. Mesmo valor de `tools/places.ts`. */
const MAX_NOTES_CHARS = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface VehicleRow {
  id: string;
  kind: string | null;
  brand: string;
  model: string;
  year: number | null;
  plate: string | null;
  color: string | null;
  current_km: number | null;
  fuel_type: string | null;
  purchase_date: string | null;
  notes: string | null;
}

interface FuelLogRow {
  id: string;
  vehicle_id: string;
  date: string;
  /** `numeric(8,3)` — o PostgREST pode devolver como texto; sempre passe por `Number`. */
  liters: number | string;
  /** `numeric(12,2)`, mesmo caso. */
  total_cost: number | string;
  km: number;
  station: string | null;
}

interface MaintenanceRow {
  id: string;
  vehicle_id: string;
  type: string;
  custom_type: string | null;
  service_date: string;
  km_at_service: number;
  cost: number | string | null;
  shop: string | null;
  next_km: number | null;
  next_date: string | null;
}

interface DocumentRow {
  id: string;
  vehicle_id: string;
  type: string;
  custom_type: string | null;
  due_date: string;
  cost: number | string | null;
  paid: boolean;
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

/** Como o veículo é chamado numa frase: "Fiat Argo (ABC1D23)". */
function rotulo(veiculo: VehicleRow): string {
  const nome = [veiculo.brand, veiculo.model].filter(Boolean).join(" ").trim() || "veículo";
  return veiculo.plate ? `${nome} (${veiculo.plate})` : nome;
}

/**
 * Valida o `vehicle_id` ANTES de ir ao banco: um id inventado pelo modelo vira `22P02 (invalid
 * input syntax for uuid)`, que chega ao usuário como "não consegui ler os veículos" — erro de banco
 * no lugar de um recado que o modelo consegue corrigir sozinho.
 */
function vehicleIdArg(input: Record<string, unknown>): string | undefined {
  const raw = str(input, "vehicle_id");
  if (raw === undefined) return undefined;
  if (!UUID.test(raw)) {
    throw new OrbToolError(
      '"vehicle_id" precisa ser o id (uuid) de um veículo — use query_vehicles para descobrir o id.'
    );
  }
  return raw;
}

/**
 * Veículos do usuário. É a RAIZ do escopo das duas tools: os ids daqui são o único caminho até
 * `vehicle_fuel_log`, `vehicle_maintenance` e `vehicle_document`, que não têm `user_id` próprio.
 *
 * `search` casa por `ilike` em marca, modelo, placa e observações — o APELIDO do carro ("o Goleta")
 * não tem coluna própria no banco e é escrito pelo usuário justamente em `model` ou em `notes`.
 */
async function fetchVehicles(
  ctx: OrbToolContext,
  opcoes: { vehicleId?: string; search?: string } = {}
): Promise<VehicleRow[]> {
  let query = ctx.db.from("vehicle").select(VEHICLE_SELECT).eq("user_id", ctx.userId);
  if (opcoes.vehicleId) query = query.eq("id", opcoes.vehicleId);
  if (opcoes.search) query = query.or(ilikeOr(["brand", "model", "plate", "notes"], opcoes.search));
  return unwrap<VehicleRow[]>(
    await query.order("created_at", { ascending: true }).limit(TETO_VEICULOS),
    "os veículos"
  );
}

/** Agrupa linhas-filhas por veículo, preservando a ordem em que vieram do banco. */
function agruparPorVeiculo<T extends { vehicle_id: string }>(rows: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const row of rows) {
    const lista = mapa.get(row.vehicle_id) ?? [];
    lista.push(row);
    mapa.set(row.vehicle_id, lista);
  }
  return mapa;
}

export const queryVehicles: OrbTool = {
  name: "query_vehicles",
  title: "Veículos",
  description:
    "Carros e motos do usuário: marca, modelo, ano, placa, cor, combustível, km atual e um resumo dos últimos abastecimentos e das últimas manutenções. O km/l (km_per_liter) é ESTIMATIVA pelos dois últimos abastecimentos — o app não registra se o tanque foi enchido, então diga que é aproximado e olhe logs_read antes de tratar o número como consumo médio. Use para 'qual a placa do meu carro?', 'quanto tá o km do Corolla?', 'quando eu troquei o óleo?' ou 'quanto eu gastei no último abastecimento?'. O APELIDO do veículo ('o Goleta') não tem campo próprio: mande em 'search' que a busca cobre marca, modelo, placa e observações. Quando nada casar, a resposta traz TODOS os veículos com search_matched:false — nesse caso pergunte qual deles é, não diga que não existe. Para o que está vencendo (IPVA, revisão, troca atrasada) use query_vehicle_alerts.",
  inputSchema: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description:
          "Como o usuário chamou o veículo: marca, modelo, placa ou apelido (casa também com as observações). Mínimo 2 caracteres.",
      },
      vehicle_id: {
        type: "string",
        description: "Id (uuid) do veículo, quando a pergunta já apontar um.",
      },
      kind: {
        type: "string",
        enum: ["car", "motorcycle"],
        description: "Filtra por tipo: 'car' (carro) ou 'motorcycle' (moto).",
      },
      limit: { type: "number", description: "Máximo de veículos na resposta (1 a 20, padrão 10)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 10, 20);
    const vehicleId = vehicleIdArg(input);
    const kind = str(input, "kind");
    const search = str(input, "search");

    if (search !== undefined && search.trim().length < MIN_SEARCH_CHARS) {
      throw new OrbToolError(
        `"search" precisa de pelo menos ${MIN_SEARCH_CHARS} caracteres — com menos que isso a busca casa quase todos os veículos.`
      );
    }
    if (kind !== undefined && kind !== "car" && kind !== "motorcycle") {
      throw new OrbToolError('"kind" precisa ser "car" ou "motorcycle".');
    }

    const termo = search?.trim();
    const encontrados = await fetchVehicles(ctx, { vehicleId, search: termo });
    if (vehicleId && encontrados.length === 0) {
      throw new OrbToolError("Não achei esse veículo na sua garagem.", "nao_encontrado");
    }

    // FALLBACK DA BUSCA: apelido só existe na cabeça do usuário ("o Goleta" pode estar gravado como
    // "Gol G4"), então uma busca vazia quase nunca significa "não tem veículo" — significa que o
    // termo não bate com o que foi digitado no cadastro. Devolver a garagem inteira é o que permite
    // ao modelo perguntar "qual deles?" em vez de afirmar que o veículo não existe.
    const semCasar = termo !== undefined && encontrados.length === 0;
    const todos = semCasar ? await fetchVehicles(ctx) : encontrados;
    const filtrados = kind ? todos.filter((v) => normalizeVehicleKind(v.kind) === kind) : todos;

    if (filtrados.length === 0) {
      return {
        today: ctx.today,
        returned: 0,
        matched: 0,
        limit,
        search: termo ?? null,
        search_matched: termo === undefined ? null : !semCasar,
        vehicles: [],
      };
    }

    const pagina = filtrados.slice(0, limit);
    const ids = pagina.map((veiculo) => veiculo.id);

    const [abastecimentos, manutencoes] = await Promise.all([
      unwrap<FuelLogRow[]>(
        await ctx.db
          .from("vehicle_fuel_log")
          .select(FUEL_SELECT)
          .in("vehicle_id", ids)
          .order("date", { ascending: false })
          .order("km", { ascending: false })
          .limit(TETO_ABASTECIMENTOS),
        "os abastecimentos"
      ),
      unwrap<MaintenanceRow[]>(
        await ctx.db
          .from("vehicle_maintenance")
          .select(MAINTENANCE_SELECT)
          .in("vehicle_id", ids)
          .order("service_date", { ascending: false })
          .limit(TETO_MANUTENCOES),
        "as manutenções"
      ),
    ]);

    const abastecimentosPorVeiculo = agruparPorVeiculo(abastecimentos);
    const manutencoesPorVeiculo = agruparPorVeiculo(manutencoes);

    const vehicles = pagina.map((veiculo) => {
      const logs = abastecimentosPorVeiculo.get(veiculo.id) ?? [];
      const servicos = manutencoesPorVeiculo.get(veiculo.id) ?? [];
      const { notes, notes_truncated } = corta(veiculo.notes);

      // km/l pelos dois últimos abastecimentos, com a MESMA conta da tela de Carro
      // (`calculateFuelConsumption`, em `_shared/orb/vehicles.ts`). É estimativa: não existe coluna
      // dizendo se o tanque foi enchido, e a description avisa isso.
      const consumo = calculateFuelConsumption(
        logs.map((log) => ({
          km: log.km,
          liters: numero(log.liters) ?? 0,
          date: log.date,
        }))
      );

      return {
        id: veiculo.id,
        kind: normalizeVehicleKind(veiculo.kind),
        brand: veiculo.brand,
        model: veiculo.model,
        year: veiculo.year,
        plate: veiculo.plate,
        color: veiculo.color,
        fuel_type: veiculo.fuel_type,
        current_km: veiculo.current_km ?? 0,
        purchase_date: veiculo.purchase_date,
        notes,
        ...(notes_truncated ? { notes_truncated: true } : {}),
        fuel: {
          logs_read: logs.length,
          km_per_liter: consumo === null ? null : money(consumo),
          last: logs.slice(0, ULTIMOS_POR_VEICULO).map((log) => {
            const litros = numero(log.liters) ?? 0;
            const custo = numero(log.total_cost) ?? 0;
            return {
              date: log.date,
              km: log.km,
              liters: money(litros),
              total_cost: money(custo),
              price_per_liter: litros > 0 ? money(custo / litros) : null,
              station: log.station,
            };
          }),
        },
        maintenance: {
          records_read: servicos.length,
          last: servicos.slice(0, ULTIMOS_POR_VEICULO).map((servico) => ({
            type: servico.type,
            label: getMaintenanceTypeLabel(servico.type as MaintenanceType, servico.custom_type),
            service_date: servico.service_date,
            km_at_service: servico.km_at_service,
            cost: numero(servico.cost) === null ? null : money(numero(servico.cost) as number),
            shop: servico.shop,
            next_km: servico.next_km,
            next_date: servico.next_date,
          })),
        },
      };
    });

    // Três cortes possíveis, e todos mentiriam calados: mais veículos que o `limit`, e as duas
    // leituras-filhas batendo o teto (aí `km_per_liter` e as "últimas" valem só para o que veio).
    const truncated = filtrados.length > limit;
    const filhasTruncadas =
      abastecimentos.length >= TETO_ABASTECIMENTOS || manutencoes.length >= TETO_MANUTENCOES;

    return {
      today: ctx.today,
      returned: vehicles.length,
      matched: filtrados.length,
      limit,
      search: termo ?? null,
      search_matched: termo === undefined ? null : !semCasar,
      ...(semCasar
        ? {
            no_match_hint:
              `Nenhum veículo casou com "${termo}" em marca, modelo, placa ou observações — ` +
              "a lista abaixo é a garagem inteira. Pergunte qual deles é em vez de dizer que não existe.",
          }
        : {}),
      vehicles,
      ...(truncated
        ? {
            truncated: true,
            truncated_warning:
              `A lista foi cortada em ${limit} veículos. Refine com search, kind ou vehicle_id ` +
              "para ver o resto.",
          }
        : {}),
      ...(filhasTruncadas
        ? {
            history_truncated: true,
            history_truncated_warning:
              "O histórico de abastecimentos ou de manutenções bateu o teto de leitura, então o " +
              "resumo por veículo pode estar incompleto. Peça menos veículos por vez.",
          }
        : {}),
    };
  },
};

/** Um alerta já achatado, de qualquer origem, pronto para a resposta. */
interface AlertaDeVeiculo {
  vehicle_id: string;
  vehicle: string;
  kind: "manutencao" | "documento";
  status: "overdue" | "upcoming";
  title: string;
  message: string;
  next_date: string | null;
  next_km: number | null;
  km_remaining: number | null;
  days_remaining: number | null;
  cost: number | null;
}

/**
 * Ordem de urgência entre alertas de origens diferentes. É a MESMA escala do `sort` de
 * `getMaintenanceAlerts` (`_shared/orb/vehicles.ts`): km e dias viram um número só por um fator
 * grosseiro de 50 km/dia, único jeito de comparar "faltam 300 km" com "vence em 5 dias".
 */
function urgencia(alerta: AlertaDeVeiculo): number {
  return Math.min(
    alerta.km_remaining ?? Number.POSITIVE_INFINITY,
    (alerta.days_remaining ?? Number.POSITIVE_INFINITY) * 50
  );
}

export const queryVehicleAlerts: OrbTool = {
  name: "query_vehicle_alerts",
  title: "Alertas do veículo",
  description:
    "O que está vencendo nos veículos do usuário: documento não pago (IPVA, licenciamento, seguro, multa) e manutenção com troca prevista por data ou por quilometragem (óleo, pneus, freios, correia, revisão geral). Use para 'tem algo vencendo no carro?', 'quando vence o IPVA?', 'já passou da hora de trocar o óleo?'. Cada item vem como 'overdue' (já passou) ou 'upcoming' (está perto). É a MESMA regra da tela de Carro do app: manutenção entra no alerta a até 1.000 km ou 30 dias do previsto — esse limiar é fixo de propósito, para a Orb e o app não discordarem sobre o mesmo óleo. Só 'document_days' é ajustável, e vale apenas para os documentos. Para o cadastro do veículo e o histórico use query_vehicles.",
  inputSchema: {
    type: "object",
    properties: {
      vehicle_id: {
        type: "string",
        description: "Id (uuid) do veículo. Ver query_vehicles. Omita para olhar todos.",
      },
      status: {
        type: "string",
        enum: ["overdue", "upcoming"],
        description:
          "Filtra: 'overdue' só o que já venceu, 'upcoming' só o que está próximo. Padrão: os dois.",
      },
      document_days: {
        type: "number",
        description:
          "Antecedência, em dias, para um DOCUMENTO entrar na lista (1 a 365, padrão 30 — o mesmo da tela de Carro). Não afeta os alertas de manutenção.",
      },
      limit: { type: "number", description: "Máximo de alertas na resposta (1 a 50, padrão 20)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 20, 50);
    const vehicleId = vehicleIdArg(input);
    const status = str(input, "status");
    const documentDays = clampLimit(num(input, "document_days"), DATE_WARNING_DAYS, 365);

    if (status !== undefined && status !== "overdue" && status !== "upcoming") {
      throw new OrbToolError('"status" precisa ser "overdue" ou "upcoming".');
    }

    const veiculos = await fetchVehicles(ctx, { vehicleId });
    if (vehicleId && veiculos.length === 0) {
      throw new OrbToolError("Não achei esse veículo na sua garagem.", "nao_encontrado");
    }
    if (veiculos.length === 0) {
      return {
        today: ctx.today,
        document_warning_days: documentDays,
        overdue_count: 0,
        upcoming_count: 0,
        returned: 0,
        limit,
        alerts: [],
        vehicles: [],
      };
    }

    const ids = veiculos.map((veiculo) => veiculo.id);

    const [documentos, manutencoes] = await Promise.all([
      unwrap<DocumentRow[]>(
        await ctx.db
          .from("vehicle_document")
          .select(DOCUMENT_SELECT)
          .in("vehicle_id", ids)
          // Documento pago não vence mais. O filtro repete `getDocumentAlerts` de propósito: aqui
          // ele economiza leitura, lá é a regra — a garantia continua sendo a função.
          .eq("paid", false)
          .order("due_date", { ascending: true })
          .limit(TETO_DOCUMENTOS),
        "os documentos do veículo"
      ),
      unwrap<MaintenanceRow[]>(
        await ctx.db
          .from("vehicle_maintenance")
          .select(MAINTENANCE_SELECT)
          .in("vehicle_id", ids)
          .order("service_date", { ascending: false })
          .limit(TETO_MANUTENCOES),
        "as manutenções"
      ),
    ]);

    const documentosPorVeiculo = agruparPorVeiculo(documentos);
    const manutencoesPorVeiculo = agruparPorVeiculo(manutencoes);

    const alertas: AlertaDeVeiculo[] = [];
    const porVeiculo = veiculos.map((veiculo) => {
      const nome = rotulo(veiculo);

      // A regra é a compartilhada (`_shared/orb/vehicles.ts`), a mesma que a tela de Carro chama
      // via `src/domain/car`. `ctx.today` entra como referência porque a Edge roda em UTC e o dia
      // do usuário pode ser outro.
      const deManutencao = getMaintenanceAlerts(
        { kind: veiculo.kind, current_km: veiculo.current_km ?? 0 },
        (manutencoesPorVeiculo.get(veiculo.id) ?? []).map((servico) => ({
          // `type` é `text` no banco (sem check): um valor fora da lista simplesmente não casa
          // nenhum tipo acompanhado, que é o comportamento certo.
          type: servico.type as MaintenanceType,
          service_date: servico.service_date,
          km_at_service: servico.km_at_service,
          next_km: servico.next_km,
          next_date: servico.next_date,
        })),
        ctx.today
      );

      const deDocumento = getDocumentAlerts(
        documentosPorVeiculo.get(veiculo.id) ?? [],
        ctx.today,
        documentDays
      );

      for (const alerta of deManutencao) {
        alertas.push({
          vehicle_id: veiculo.id,
          vehicle: nome,
          kind: "manutencao",
          status: alerta.status,
          title: alerta.label,
          message: alerta.message,
          next_date: alerta.nextDate ?? null,
          next_km: alerta.nextKm ?? null,
          km_remaining: alerta.kmRemaining ?? null,
          days_remaining: alerta.daysRemaining ?? null,
          cost: null,
        });
      }

      for (const alerta of deDocumento) {
        const doc = alerta.document;
        alertas.push({
          vehicle_id: veiculo.id,
          vehicle: nome,
          kind: "documento",
          status: alerta.status,
          title:
            doc.type === "other" && doc.custom_type?.trim()
              ? doc.custom_type.trim()
              : doc.type.toUpperCase(),
          message: alerta.message,
          next_date: doc.due_date,
          next_km: null,
          km_remaining: null,
          days_remaining: alerta.daysRemaining,
          cost: numero(doc.cost) === null ? null : money(numero(doc.cost) as number),
        });
      }

      const doVeiculo = [...deManutencao, ...deDocumento];
      return {
        id: veiculo.id,
        brand: veiculo.brand,
        model: veiculo.model,
        plate: veiculo.plate,
        current_km: veiculo.current_km ?? 0,
        overdue_count: doVeiculo.filter((alerta) => alerta.status === "overdue").length,
        upcoming_count: doVeiculo.filter((alerta) => alerta.status === "upcoming").length,
      };
    });

    const selecionados = status ? alertas.filter((alerta) => alerta.status === status) : alertas;
    // Atrasado antes de próximo, e dentro de cada grupo o mais urgente primeiro: é a ordem em que a
    // pessoa precisa ouvir ("o IPVA venceu ontem" nunca pode vir depois de "o óleo vence em 20 dias").
    const ordenados = [...selecionados].sort((a, b) => {
      if (a.status !== b.status) return a.status === "overdue" ? -1 : 1;
      return urgencia(a) - urgencia(b);
    });

    const truncated = ordenados.length > limit;
    const leituraTruncada =
      documentos.length >= TETO_DOCUMENTOS || manutencoes.length >= TETO_MANUTENCOES;

    return {
      today: ctx.today,
      document_warning_days: documentDays,
      overdue_count: selecionados.filter((alerta) => alerta.status === "overdue").length,
      upcoming_count: selecionados.filter((alerta) => alerta.status === "upcoming").length,
      returned: Math.min(ordenados.length, limit),
      limit,
      alerts: ordenados.slice(0, limit),
      vehicles: porVeiculo,
      ...(truncated
        ? {
            truncated: true,
            truncated_warning:
              `A lista foi cortada em ${limit} alertas — as contagens acima valem para todos os ` +
              "que casaram o filtro. Refine com vehicle_id ou status para ver o resto.",
          }
        : {}),
      ...(leituraTruncada
        ? {
            history_truncated: true,
            history_truncated_warning:
              "A leitura de documentos ou manutenções bateu o teto, então pode faltar alerta de " +
              "algum veículo. Pergunte por um veículo de cada vez (vehicle_id).",
          }
        : {}),
    };
  },
};

export const vehiclesTools: OrbTool[] = [queryVehicles, queryVehicleAlerts];
