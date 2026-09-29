/**
 * Contrato de propostas da Orb — cópia de `supabase/functions/_shared/orb/actions.ts`.
 *
 * Porquê copiar: o Metro do mobile não resolve o tree Deno com imports `*.ts`, e o tsc do Expo
 * não inclui `_shared` sem puxar o registry inteiro. Ao mudar o shared, atualize este arquivo.
 */

/** Nome da tool. O client reconhece o cartão de proposta por ele. */
export const ORB_CREATE_TOOL_NAME = "propose_create";

export type OrbCreateKind =
  | "task"
  | "transaction"
  | "note"
  | "shopping_item"
  | "project"
  | "event"
  | "recurring"
  | "budget"
  | "finance_type"
  | "finance_class"
  | "budget_delete"
  | "budget_replicate"
  | "recurring_payment"
  | "recurring_quit"
  | "habit_checkin"
  | "habit_create"
  | "movie_mark"
  | "book_progress"
  | "album_wishlist"
  | "place_visit"
  | "goal_update"
  | "fuel_log"
  | "maintenance"
  | "vehicle_create"
  | "series_episode"
  | "medication_create"
  | "consultation_create"
  | "trip"
  | "trip_expense"
  | "trip_activity"
  | "trip_day_plan";

export const ORB_CREATE_KINDS: readonly OrbCreateKind[] = [
  "task",
  "transaction",
  "note",
  "shopping_item",
  "project",
  "event",
  "recurring",
  "budget",
  "finance_type",
  "finance_class",
  "budget_delete",
  "budget_replicate",
  "recurring_payment",
  "recurring_quit",
  "habit_checkin",
  "habit_create",
  "movie_mark",
  "book_progress",
  "album_wishlist",
  "place_visit",
  "goal_update",
  "fuel_log",
  "maintenance",
  "vehicle_create",
  "series_episode",
  "medication_create",
  "consultation_create",
  "trip",
  "trip_expense",
  "trip_activity",
  "trip_day_plan",
];

/** Uma linha do cartão de confirmação: "Prazo · 12/09/2026". */
export interface OrbProposalField {
  label: string;
  value: string;
}

export interface OrbProposal {
  kind: OrbCreateKind;
  /** Cabeçalho do cartão: "Nova tarefa". */
  label: string;
  /** O que vai ser criado, em português, para a pessoa conferir ANTES de confirmar. */
  fields: OrbProposalField[];
  /** Payload para o `src/api/*`. Só chaves da whitelist de cada tipo. */
  payload: Record<string, unknown>;
}

/**
 * Campos aceitos por tipo, com o tipo esperado de cada um. É a whitelist que os DOIS lados usam: o
 * servidor para montar, o client para reconstruir. Chave fora daqui não chega no `insert`.
 */
const CAMPOS: Record<OrbCreateKind, Record<string, "text" | "number" | "boolean" | "id">> = {
  task: {
    title: "text",
    description: "text",
    status: "text",
    priority: "text",
    due_date: "text",
    due_time: "text",
    start_date: "text",
    estimated_duration: "number",
    project_id: "id",
  },
  transaction: {
    description: "text",
    value: "number",
    class_id: "id",
    transaction_at: "text",
  },
  note: {
    title: "text",
    content: "text",
    project_id: "id",
  },
  shopping_item: {
    title: "text",
    description: "text",
    quantity: "number",
    unit: "text",
    status: "text",
    shopping_category_id: "id",
  },
  project: {
    name: "text",
    description: "text",
    status: "text",
  },
  event: {
    title: "text",
    starts_at: "text",
    ends_at: "text",
    project_id: "id",
  },
  recurring: {
    description: "text",
    value: "number",
    class_id: "id",
    frequency: "text",
    validity: "text",
    due_day: "number",
    installment_count: "number",
    payment_start_date: "text",
    status: "boolean",
  },
  budget: {
    type_id: "id",
    class_id: "id",
    budget_month: "text",
    planned_value: "number",
  },
  finance_type: {
    name: "text",
    nature_id: "id",
  },
  finance_class: {
    name: "text",
    type_id: "id",
  },
  budget_delete: {
    id: "id",
  },
  budget_replicate: {
    from_month: "text",
    until_month: "text",
    mode: "text",
  },
  recurring_payment: {
    recurring_id: "id",
    installment_number: "number",
  },
  recurring_quit: {
    recurring_id: "id",
  },
  habit_checkin: {
    habit_id: "id",
    date: "text",
    completed: "boolean",
  },
  habit_create: {
    name: "text",
    frequency: "text",
    target_per_week: "number",
    kind: "text",
    description: "text",
    is_health: "boolean",
  },
  movie_mark: {
    imdb_id: "id",
    title: "text",
    status: "text",
    rating: "number",
    notes: "text",
    watched_date: "text",
    is_new: "boolean",
    year: "number",
  },
  book_progress: {
    google_id: "id",
    title: "text",
    status: "text",
    current_page: "number",
    rating: "number",
    notes: "text",
    is_new: "boolean",
  },
  series_episode: {
    imdb_id: "id",
    title: "text",
    season: "number",
    episode: "number",
    episode_name: "text",
    rating: "number",
    notes: "text",
    is_new: "boolean",
    year: "number",
  },
  medication_create: {
    name: "text",
    times: "text",
    dose_amount: "number",
    dose_unit: "text",
    instructions: "text",
    interval_days: "number",
    started_on: "text",
  },
  consultation_create: {
    title: "text",
    description: "text",
    due_date: "text",
    due_time: "text",
  },
  vehicle_create: {
    brand: "text",
    model: "text",
    kind: "text",
    current_km: "number",
    plate: "text",
    year: "number",
    notes: "text",
  },
  album_wishlist: {
    musicbrainz_id: "id",
    title: "text",
    artists: "text",
    status: "text",
    is_new: "boolean",
  },
  place_visit: {
    place_visit_id: "id",
    name: "text",
    type: "text",
    status: "text",
    visited_date: "text",
    rating: "number",
    notes: "text",
    amount: "number",
  },
  goal_update: {
    goal_id: "id",
    current_value: "number",
    add_value: "number",
  },
  fuel_log: {
    vehicle_id: "id",
    date: "text",
    liters: "number",
    total_cost: "number",
    km: "number",
    station: "text",
    notes: "text",
  },
  maintenance: {
    vehicle_id: "id",
    type: "text",
    custom_type: "text",
    service_date: "text",
    km_at_service: "number",
    cost: "number",
    shop: "text",
    notes: "text",
  },
  trip: {
    title: "text",
    start_date: "text",
    end_date: "text",
    destination: "text",
    budget: "number",
    status: "text",
    notes: "text",
    origin_label: "text",
    outbound_depart: "text",
    transport_mode: "text",
    stop1_name: "text",
    stop1_start: "text",
    stop1_end: "text",
    stop2_name: "text",
    stop2_start: "text",
    stop2_end: "text",
  },
  trip_expense: {
    trip_id: "id",
    description: "text",
    amount: "number",
    category: "text",
    expense_date: "text",
  },
  trip_activity: {
    day_id: "id",
    trip_id: "id",
    title: "text",
    activity_time: "text",
    category: "text",
    notes: "text",
    sort_order: "number",
  },
  trip_day_plan: {
    trip_id: "id",
    day_id: "id",
    plan_date: "text",
    activities_json: "text",
    /** Título da viagem ainda não confirmada — o roteiro espera o cartão da viagem. */
    pending_trip_title: "text",
  },
};

/** Campos obrigatórios por tipo — a validação roda no servidor e de novo no client. */
const OBRIGATORIOS: Record<OrbCreateKind, string[]> = {
  task: ["title"],
  transaction: ["description", "value", "class_id", "transaction_at"],
  note: ["title"],
  shopping_item: ["title"],
  project: ["name"],
  event: ["title", "starts_at"],
  recurring: ["description", "value", "class_id", "frequency", "payment_start_date", "due_day", "status"],
  budget: ["type_id", "class_id", "budget_month", "planned_value"],
  finance_type: ["name", "nature_id"],
  finance_class: ["name", "type_id"],
  budget_delete: ["id"],
  budget_replicate: ["from_month", "until_month", "mode"],
  recurring_payment: ["recurring_id", "installment_number"],
  recurring_quit: ["recurring_id"],
  habit_checkin: ["habit_id", "date", "completed"],
  habit_create: ["name", "frequency", "target_per_week"],
  // imdb_id só quando já está na lista; filme novo vai com title + is_new e o client resolve no OMDb.
  movie_mark: ["title", "status"],
  // google_id só quando já está na estante; livro novo vai com title + is_new (Google Books no client).
  book_progress: ["title"],
  series_episode: ["title", "season", "episode"],
  medication_create: ["name", "times", "started_on"],
  consultation_create: ["title", "due_date"],
  album_wishlist: ["musicbrainz_id", "title", "status"],
  place_visit: ["name", "visited_date"],
  goal_update: ["goal_id"],
  fuel_log: ["vehicle_id", "date", "liters", "total_cost", "km"],
  maintenance: ["vehicle_id", "type", "service_date", "km_at_service"],
  vehicle_create: ["brand", "model", "kind", "current_km"],
  trip: ["title", "start_date", "end_date", "status"],
  trip_expense: ["trip_id", "description", "amount", "category", "expense_date"],
  trip_activity: ["day_id", "title", "sort_order"],
  // trip_id/day_id só depois da viagem existir; com pending_trip_title o cartão fica aguardando.
  trip_day_plan: ["plan_date", "activities_json"],
};

export function isOrbCreateKind(valor: unknown): valor is OrbCreateKind {
  return typeof valor === "string" && (ORB_CREATE_KINDS as readonly string[]).includes(valor);
}

/**
 * Devolve o payload reconstruído a partir da whitelist do tipo, ou `null` quando falta obrigatório
 * ou algum valor tem o tipo errado. `null` é recusa: o client não grava, e mostra o cartão como
 * inválido em vez de mandar lixo para o banco.
 */
export function sanitizeOrbProposalPayload(
  kind: OrbCreateKind,
  bruto: unknown
): Record<string, unknown> | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const entrada = bruto as Record<string, unknown>;
  const permitidos = CAMPOS[kind];
  const saida: Record<string, unknown> = {};

  for (const [campo, tipo] of Object.entries(permitidos)) {
    const valor = entrada[campo];
    if (valor === undefined || valor === null || valor === "") continue;
    if (tipo === "number") {
      if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
      saida[campo] = valor;
    } else if (tipo === "boolean") {
      if (typeof valor !== "boolean") return null;
      saida[campo] = valor;
    } else if (tipo === "id") {
      if (typeof valor !== "string" && typeof valor !== "number") return null;
      saida[campo] = valor;
    } else {
      if (typeof valor !== "string") return null;
      saida[campo] = valor;
    }
  }

  for (const campo of OBRIGATORIOS[kind]) {
    if (saida[campo] === undefined) return null;
  }
  return saida;
}

export function isOrbProposal(valor: unknown): valor is OrbProposal {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const proposta = valor as Record<string, unknown>;
  if (!isOrbCreateKind(proposta.kind)) return false;
  if (typeof proposta.label !== "string") return false;
  if (!Array.isArray(proposta.fields)) return false;
  const camposOk = proposta.fields.every(
    (campo) =>
      Boolean(campo) &&
      typeof campo === "object" &&
      typeof (campo as OrbProposalField).label === "string" &&
      typeof (campo as OrbProposalField).value === "string"
  );
  if (!camposOk) return false;
  return sanitizeOrbProposalPayload(proposta.kind, proposta.payload) !== null;
}

/**
 * Campo que dá IDENTIDADE à proposta — o texto que a pessoa usa para reconhecer do que se trata.
 */
const CAMPO_DE_IDENTIDADE: Record<OrbCreateKind, string> = {
  task: "title",
  transaction: "description",
  note: "title",
  shopping_item: "title",
  project: "name",
  event: "title",
  recurring: "description",
  budget: "budget_month",
  finance_type: "name",
  finance_class: "name",
  budget_delete: "id",
  budget_replicate: "from_month",
  recurring_payment: "recurring_id",
  recurring_quit: "recurring_id",
  habit_checkin: "habit_id",
  habit_create: "name",
  movie_mark: "title",
  book_progress: "title",
  series_episode: "title",
  medication_create: "name",
  consultation_create: "title",
  album_wishlist: "musicbrainz_id",
  place_visit: "name",
  goal_update: "goal_id",
  fuel_log: "vehicle_id",
  maintenance: "vehicle_id",
  vehicle_create: "model",
  trip: "title",
  trip_expense: "description",
  trip_activity: "title",
  trip_day_plan: "plan_date",
};

/**
 * Chave de identidade de uma proposta: tipo + texto principal, sem acento e sem caixa.
 *
 * PORQUÊ existir: ajustar uma proposta ("com prazo para sexta") faz o modelo chamar
 * `propose_create` de novo, com TODOS os campos — é o único jeito, já que a tool não edita. Sem
 * esta chave as duas chamadas viram dois cartões da mesma tarefa lado a lado, e confirmar o de cima
 * (o desatualizado) grava justamente a versão sem o ajuste que a pessoa acabou de pedir.
 */
export function orbProposalIdentity(proposal: OrbProposal): string {
  if (proposal.kind === "budget") {
    // Mês + categoria: dois orçamentos no mesmo mês não podem colidir na bandeja.
    const mes = String(proposal.payload?.budget_month ?? "");
    const classId = String(proposal.payload?.class_id ?? "");
    return `budget\0${mes}|${classId}`;
  }
  if (proposal.kind === "budget_delete") {
    return `budget_delete\0${String(proposal.payload?.id ?? "")}`;
  }
  if (proposal.kind === "recurring_payment") {
    return `recurring_payment\0${String(proposal.payload?.recurring_id ?? "")}|${String(proposal.payload?.installment_number ?? "")}`;
  }
  if (proposal.kind === "habit_checkin") {
    return `habit_checkin\0${String(proposal.payload?.habit_id ?? "")}|${String(proposal.payload?.date ?? "")}`;
  }
  if (proposal.kind === "series_episode") {
    return `series_episode\0${String(proposal.payload?.title ?? proposal.payload?.imdb_id ?? "").toLowerCase()}|${String(proposal.payload?.season ?? "")}|${String(proposal.payload?.episode ?? "")}`;
  }
  if (proposal.kind === "goal_update") {
    return `goal_update\0${String(proposal.payload?.goal_id ?? "")}`;
  }
  if (proposal.kind === "fuel_log") {
    return `fuel_log\0${String(proposal.payload?.vehicle_id ?? "")}|${String(proposal.payload?.date ?? "")}|${String(proposal.payload?.km ?? "")}`;
  }
  if (proposal.kind === "trip_activity") {
    return `trip_activity\0${String(proposal.payload?.day_id ?? "")}|${String(proposal.payload?.title ?? "").toLowerCase()}`;
  }
  if (proposal.kind === "trip_day_plan") {
    return `trip_day_plan\0${String(proposal.payload?.day_id ?? proposal.payload?.pending_trip_title ?? "")}|${String(proposal.payload?.plan_date ?? "")}`;
  }
  const campo = CAMPO_DE_IDENTIDADE[proposal.kind];
  const valor = proposal.payload?.[campo];
  const texto = typeof valor === "string" || typeof valor === "number" ? String(valor) : "";
  const normalizado = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return `${proposal.kind}\0${normalizado}`;
}

/** Rótulo do cartão por tipo — o mesmo texto no servidor e na tela. */
export const ORB_CREATE_LABELS: Record<OrbCreateKind, string> = {
  task: "Nova tarefa",
  transaction: "Novo lançamento",
  note: "Nova nota",
  shopping_item: "Novo item de compra",
  project: "Novo projeto",
  event: "Novo evento",
  recurring: "Nova recorrência",
  budget: "Novo orçamento",
  finance_type: "Novo tipo financeiro",
  finance_class: "Nova subcategoria",
  budget_delete: "Excluir orçamento",
  budget_replicate: "Replicar orçamento",
  recurring_payment: "Registrar pagamento",
  recurring_quit: "Quitar recorrência",
  habit_checkin: "Check-in de hábito",
  habit_create: "Novo hábito",
  movie_mark: "Filme / série",
  book_progress: "Livro",
  series_episode: "Episódio de série",
  medication_create: "Nova medicação",
  consultation_create: "Nova consulta",
  album_wishlist: "Álbum na lista",
  place_visit: "Registrar visita",
  goal_update: "Atualizar meta",
  fuel_log: "Abastecimento",
  maintenance: "Manutenção",
  vehicle_create: "Novo veículo",
  trip: "Nova viagem",
  trip_expense: "Gasto de viagem",
  trip_activity: "Atividade no roteiro",
  trip_day_plan: "Roteiro do dia",
};
