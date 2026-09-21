/**
 * Regra de alerta dos veículos: manutenção vencendo (por km ou por data) e documento a vencer.
 *
 * Este arquivo é a FONTE ÚNICA da regra. `src/domain/car/{alerts,constants}.ts` reexporta daqui e a
 * tool `query_vehicle_alerts` (`tools/vehicles.ts`) chama as MESMAS funções — o mesmo arranjo de
 * `recurring.ts`. Reimplementar qualquer coisa abaixo criaria uma segunda verdade sobre o mesmo
 * alerta, que diverge na primeira mudança de limiar: o usuário abriria a tela de Carro vendo "óleo
 * atrasado" e ouviria da Orb que está tudo em dia.
 *
 * Vale a regra do diretório (cabeçalho de `types.ts`): nada de import externo, nada de API de
 * runtime. É por isso que **"hoje" entra como parâmetro** (`YYYY-MM-DD`) em vez de sair de um
 * `new Date()` interno: o front tem o relógio do usuário, a Edge roda em UTC e a Orb já resolve o
 * dia no fuso dele (`ctx.today`). Deixar cada runtime ler o próprio relógio faria o mesmo documento
 * vencer em dias diferentes conforme quem perguntou.
 */

export type VehicleKind = "car" | "motorcycle";

export type MaintenanceType =
  | "oil"
  | "oil_filter"
  | "air_filter"
  | "fuel_filter"
  | "tires"
  | "brakes"
  | "battery"
  | "timing_belt"
  | "spark_plugs"
  | "coolant"
  | "transmission_oil"
  | "chain"
  | "drive_belt"
  | "sprockets"
  | "fork_oil"
  | "general_service"
  | "other";

export type MaintenanceAlertStatus = "ok" | "upcoming" | "overdue" | "none";

/** Faltando isto (ou menos) para o `next_km`, a troca já entra como "próxima". */
export const KM_WARNING = 1000;
/** Mesma ideia do `KM_WARNING`, no eixo do tempo — vale para manutenção e para documento. */
export const DATE_WARNING_DAYS = 30;

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  oil: "Óleo do motor",
  oil_filter: "Filtro de óleo",
  air_filter: "Filtro de ar",
  fuel_filter: "Filtro de combustível",
  tires: "Pneus",
  brakes: "Freios",
  battery: "Bateria",
  timing_belt: "Correia dentada",
  spark_plugs: "Velas de ignição",
  coolant: "Fluido de arrefecimento",
  transmission_oil: "Óleo de câmbio",
  chain: "Corrente",
  drive_belt: "Correia de transmissão",
  sprockets: "Coroa / pinhão",
  fork_oil: "Óleo de suspensão",
  general_service: "Revisão geral",
  other: "Outro",
};

const CAR_TRACKED: MaintenanceType[] = [
  "oil",
  "oil_filter",
  "air_filter",
  "fuel_filter",
  "tires",
  "brakes",
  "battery",
  "timing_belt",
  "spark_plugs",
  "coolant",
  "transmission_oil",
  "general_service",
];

const MOTORCYCLE_TRACKED: MaintenanceType[] = [
  "oil",
  "oil_filter",
  "air_filter",
  "fuel_filter",
  "tires",
  "brakes",
  "battery",
  "spark_plugs",
  "chain",
  "drive_belt",
  "sprockets",
  "fork_oil",
  "transmission_oil",
  "general_service",
];

/** @deprecated Use getTrackedMaintenanceTypes(kind) */
export const TRACKED_MAINTENANCE_TYPES = CAR_TRACKED;

export function getTrackedMaintenanceTypes(kind: VehicleKind = "car"): MaintenanceType[] {
  return kind === "motorcycle" ? MOTORCYCLE_TRACKED : CAR_TRACKED;
}

/** `kind` é `text` no banco (com `check`), então qualquer valor estranho cai em carro. */
export function normalizeVehicleKind(value: unknown): VehicleKind {
  return value === "motorcycle" ? "motorcycle" : "car";
}

/**
 * Formas mínimas que a regra consome. São estruturais de propósito: `Vehicle`, `Maintenance` e
 * `VehicleDocument` de `src/types/car.ts` encaixam sem conversão, e a linha crua do PostgREST que a
 * tool lê também — sem este diretório precisar conhecer nenhum dos dois.
 */
export interface VehicleForAlerts {
  kind?: unknown;
  current_km: number;
}

export interface MaintenanceForAlerts {
  type: MaintenanceType;
  service_date: string;
  km_at_service: number;
  next_km?: number | null;
  next_date?: string | null;
}

export interface DocumentForAlerts {
  type: string;
  custom_type?: string | null;
  due_date: string;
  paid: boolean;
}

export interface MaintenanceScheduleItem {
  type: MaintenanceType;
  label: string;
  status: MaintenanceAlertStatus;
  lastServiceDate?: string | null;
  lastKm?: number | null;
  nextKm?: number | null;
  nextDate?: string | null;
  kmRemaining?: number | null;
  daysRemaining?: number | null;
  message: string;
}

export interface MaintenanceAlert {
  type: MaintenanceType;
  label: string;
  status: "upcoming" | "overdue";
  nextKm?: number | null;
  nextDate?: string | null;
  kmRemaining?: number | null;
  daysRemaining?: number | null;
  message: string;
}

/**
 * Genérica no documento para o chamador receber de volta a MESMA linha que passou (o front devolve
 * `VehicleDocument` inteiro para a tela abrir o item; a tool devolve a linha enxuta que leu).
 */
export interface DocumentAlert<TDoc extends DocumentForAlerts = DocumentForAlerts> {
  document: TDoc;
  status: "upcoming" | "overdue";
  daysRemaining: number;
  message: string;
}

/**
 * Diferença em dias entre duas datas CIVIS (`YYYY-MM-DD`), positiva quando `ate` vem depois.
 *
 * `Date.UTC` em vez do construtor local: no Deno da Edge o processo roda em UTC e no browser roda
 * no fuso do usuário — a conta precisa dar o mesmo inteiro nos dois. Como as duas pontas são datas
 * civis (sem hora), não há horário de verão para atrapalhar.
 */
function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(Number(de.slice(0, 4)), Number(de.slice(5, 7)) - 1, Number(de.slice(8, 10)));
  const b = Date.UTC(Number(ate.slice(0, 4)), Number(ate.slice(5, 7)) - 1, Number(ate.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/**
 * `2026-09-08` → `08/09/2026`. Mesma saída de `formatDateBR` (`src/lib/currency.ts`) para uma data
 * válida; replicada porque este diretório não pode importar de `src/`. É só apresentação dentro da
 * mensagem — a regra em si não depende dela.
 */
function dataBR(iso: string): string {
  const parte = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parte)) return iso;
  return parte.split("-").reverse().join("/");
}

function resolveAlertStatus(
  kmRemaining: number | null,
  daysRemaining: number | null
): "ok" | "upcoming" | "overdue" {
  const kmOverdue = kmRemaining !== null && kmRemaining < 0;
  const daysOverdue = daysRemaining !== null && daysRemaining < 0;
  if (kmOverdue || daysOverdue) return "overdue";

  const kmUpcoming = kmRemaining !== null && kmRemaining >= 0 && kmRemaining <= KM_WARNING;
  const daysUpcoming =
    daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= DATE_WARNING_DAYS;
  if (kmUpcoming || daysUpcoming) return "upcoming";

  return "ok";
}

/**
 * Última manutenção de cada tipo. "Última" é por `service_date`, com `km_at_service` desempatando
 * duas trocas no mesmo dia — é o registro cujo `next_km`/`next_date` ainda vale.
 */
function getLatestMaintenanceByType<T extends MaintenanceForAlerts>(
  maintenances: T[]
): Map<MaintenanceType, T> {
  const map = new Map<MaintenanceType, T>();

  for (const item of maintenances) {
    const existing = map.get(item.type);
    if (!existing || item.service_date > existing.service_date) {
      map.set(item.type, item);
    } else if (
      item.service_date === existing.service_date &&
      item.km_at_service > existing.km_at_service
    ) {
      map.set(item.type, item);
    }
  }

  return map;
}

export function getMaintenanceTypeLabel(
  type: MaintenanceType,
  customType?: string | null
): string {
  if (type === "other" && customType?.trim()) return customType.trim();
  return MAINTENANCE_TYPE_LABELS[type];
}

/**
 * Situação de CADA tipo acompanhado do veículo (inclusive os que estão em dia e os que nunca foram
 * trocados). `today` é a data civil de referência — ver o cabeçalho.
 */
export function getMaintenanceSchedule(
  vehicle: VehicleForAlerts,
  maintenances: MaintenanceForAlerts[],
  today: string
): MaintenanceScheduleItem[] {
  const latestByType = getLatestMaintenanceByType(maintenances);
  const kind = normalizeVehicleKind(vehicle.kind);
  const tracked = getTrackedMaintenanceTypes(kind);

  return tracked.map((type) => {
    const label = MAINTENANCE_TYPE_LABELS[type];
    const latest = latestByType.get(type);

    if (!latest || (!latest.next_km && !latest.next_date)) {
      return {
        type,
        label,
        status: "none" as const,
        message: "Sem registro de troca",
      };
    }

    const kmRemaining = latest.next_km != null ? latest.next_km - vehicle.current_km : null;
    const daysRemaining = latest.next_date ? diasEntre(today, latest.next_date) : null;

    const status = resolveAlertStatus(kmRemaining, daysRemaining);

    let message = "Em dia";
    if (status === "overdue") {
      if (kmRemaining !== null && kmRemaining < 0) {
        message = `Atrasado em ${Math.abs(kmRemaining).toLocaleString("pt-BR")} km`;
      } else if (daysRemaining !== null && daysRemaining < 0) {
        message = `Atrasado há ${Math.abs(daysRemaining)} dias`;
      } else {
        message = "Troca atrasada";
      }
    } else if (status === "upcoming") {
      const parts: string[] = [];
      if (kmRemaining !== null && kmRemaining >= 0 && kmRemaining <= KM_WARNING) {
        parts.push(`faltam ${kmRemaining.toLocaleString("pt-BR")} km`);
      }
      if (daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= DATE_WARNING_DAYS) {
        parts.push(daysRemaining === 0 ? "vence hoje" : `vence em ${daysRemaining} dias`);
      }
      message = parts.join(" · ") || "Troca próxima";
    }

    return {
      type,
      label,
      status,
      lastServiceDate: latest.service_date,
      lastKm: latest.km_at_service,
      nextKm: latest.next_km,
      nextDate: latest.next_date,
      kmRemaining,
      daysRemaining,
      message,
    };
  });
}

/** Só o que já está atrasado ou perto de vencer, do mais urgente para o menos. */
export function getMaintenanceAlerts(
  vehicle: VehicleForAlerts,
  maintenances: MaintenanceForAlerts[],
  today: string
): MaintenanceAlert[] {
  const schedule = getMaintenanceSchedule(vehicle, maintenances, today);

  return schedule
    .filter((item) => item.status === "upcoming" || item.status === "overdue")
    .map((item) => ({
      type: item.type,
      label: item.label,
      status: item.status as "upcoming" | "overdue",
      nextKm: item.nextKm,
      nextDate: item.nextDate,
      kmRemaining: item.kmRemaining,
      daysRemaining: item.daysRemaining,
      message: `${item.label}: ${item.message}`,
    }))
    .sort((a, b) => {
      // Km e dias na mesma escala por um fator grosseiro (≈50 km/dia rodados), que é o único jeito
      // de ordenar "faltam 300 km" contra "vence em 5 dias" numa lista só.
      const aScore = Math.min(
        a.kmRemaining ?? Number.POSITIVE_INFINITY,
        (a.daysRemaining ?? Number.POSITIVE_INFINITY) * 50
      );
      const bScore = Math.min(
        b.kmRemaining ?? Number.POSITIVE_INFINITY,
        (b.daysRemaining ?? Number.POSITIVE_INFINITY) * 50
      );
      return aScore - bScore;
    });
}

/** Documentos não pagos vencendo dentro de `warningDays` (ou já vencidos), do mais urgente. */
export function getDocumentAlerts<TDoc extends DocumentForAlerts>(
  documents: TDoc[],
  today: string,
  warningDays = DATE_WARNING_DAYS
): DocumentAlert<TDoc>[] {
  const alerts: DocumentAlert<TDoc>[] = [];

  for (const doc of documents) {
    // Documento pago não vence mais — é o que tira o IPVA quitado da lista em janeiro.
    if (doc.paid) continue;

    const daysRemaining = diasEntre(today, doc.due_date);
    if (daysRemaining > warningDays) continue;

    const typeLabel =
      doc.type === "other" && doc.custom_type ? doc.custom_type : doc.type.toUpperCase();

    alerts.push({
      document: doc,
      status: daysRemaining < 0 ? "overdue" : "upcoming",
      daysRemaining,
      message:
        daysRemaining < 0
          ? `${typeLabel} venceu em ${dataBR(doc.due_date)}`
          : daysRemaining === 0
            ? `${typeLabel} vence hoje`
            : `${typeLabel} vence em ${daysRemaining} dias (${dataBR(doc.due_date)})`,
    });
  }

  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Consumo (km/l) estimado pelos dois últimos abastecimentos, por quilometragem.
 *
 * É ESTIMATIVA: não existe coluna dizendo se o tanque foi enchido, então a conta assume
 * tanque-cheio → tanque-cheio. Quem reporta o número precisa dizer isso.
 */
export function calculateFuelConsumption(
  logs: { km: number; liters: number; date: string }[]
): number | null {
  if (logs.length < 2) return null;

  const sorted = [...logs].sort((a, b) => {
    if (a.km !== b.km) return a.km - b.km;
    return a.date.localeCompare(b.date);
  });
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const kmDiff = latest.km - previous.km;

  if (kmDiff <= 0 || latest.liters <= 0) return null;
  return kmDiff / latest.liters;
}
