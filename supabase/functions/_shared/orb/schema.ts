/**
 * O MAPA DO BANCO que a Orb enxerga (feature 100).
 *
 * As 34 tools de intenção respondem bem o que alguém perguntaria num dia normal ("quanto gastei com
 * mercado?"). O que elas não cobrem é a pergunta torta: um filtro composto, uma ordenação
 * específica, uma coluna que nenhuma tool devolve. Este catálogo, com `describe_data` e
 * `query_data`, é a saída para isso — o modelo lê a estrutura e monta a consulta.
 *
 * Três decisões que sustentam o resto:
 *
 * 1. **O catálogo NÃO entra no system prompt.** Escrito por extenso ele passa de 8 mil tokens, e
 *    seria pago em todo turno de toda pergunta, inclusive nas que nem tocam no banco. Ele é buscado
 *    sob demanda por `describe_data`, e o que fica no prompt é só a lista de nomes de tabela.
 * 2. **A whitelist é aqui.** `query_data` só enxerga tabela e coluna que estão neste arquivo. Isso
 *    não substitui o RLS (a fronteira de verdade continua sendo o Postgres), mas impede o modelo de
 *    inventar tabela, tropeçar numa view interna ou pedir uma coluna que não existe e receber um
 *    erro cru de Postgres como se fosse resposta.
 * 3. **O escopo por dono vem declarado**, tabela por tabela, com a mesma taxonomia do cabeçalho de
 *    `types.ts`: coluna `user_id` própria, herança do pai (`trip`/`vehicle`/`habit`) ou dimensão
 *    global. Errar isso é o bug de 42703 que a feature 099 documentou, agora impossível de repetir
 *    à mão: quem executa lê daqui.
 */

export type OrbColumnType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "timestamp"
  | "time"
  | "uuid"
  | "id"
  | "array"
  | "json";

export interface OrbColumn {
  name: string;
  type: OrbColumnType;
  /** Só quando o nome não se explica sozinho — cada palavra aqui é token pago na hora da consulta. */
  description?: string;
  enum?: readonly string[];
  /** Tabela referenciada, quando a coluna é chave estrangeira. */
  references?: string;
}

/**
 * Como escopar a tabela pelo dono.
 * - `user_id`: a coluna existe na tabela (a maioria).
 * - `parent`: a tabela NÃO tem `user_id`; o RLS vem do pai e a query escopa por `.in(column, ids)`.
 * - `global`: dimensão compartilhada (só `nature`), sem dono.
 */
export type OrbTableScope =
  | { kind: "user_id" }
  | { kind: "parent"; column: string; parent: "trip" | "vehicle" | "habit" }
  | { kind: "global" };

export interface OrbTable {
  name: string;
  label: string;
  description: string;
  scope: OrbTableScope;
  columns: readonly OrbColumn[];
  /** Colunas do `select` quando a consulta não pede nada — evita `select *` por acidente. */
  defaultColumns: readonly string[];
  defaultOrder?: { column: string; ascending: boolean };
  /** Tool de intenção que responde melhor que uma consulta crua, quando existe. */
  preferTool?: string;
}

const CRIADO_EM: OrbColumn = { name: "created_at", type: "timestamp" };

export const ORB_TABLES: readonly OrbTable[] = [
  {
    name: "transaction",
    label: "Lançamentos",
    description:
      "Todo dinheiro que entrou ou saiu. A categoria vem por class_id → class → type → nature (Receita/Despesa/Investimento).",
    scope: { kind: "user_id" },
    preferTool: "query_transactions",
    defaultColumns: ["id", "transaction_at", "description", "value", "class_id"],
    defaultOrder: { column: "transaction_at", ascending: false },
    columns: [
      { name: "id", type: "id" },
      { name: "value", type: "number", description: "Sempre positivo; o sinal vem da natureza." },
      { name: "description", type: "text" },
      { name: "transaction_at", type: "timestamp", description: "Quando aconteceu." },
      { name: "class_id", type: "id", references: "class" },
      { name: "recurring_transaction_id", type: "uuid", references: "recurring_transaction" },
      { name: "installment_number", type: "number", description: "Número da parcela, quando é uma." },
      { name: "paid_at", type: "date", description: "Data efetiva do pagamento, em recorrências." },
      CRIADO_EM,
    ],
  },
  {
    name: "class",
    label: "Categorias",
    description: "Categoria de finanças (o nível que aparece na tela). Pertence a um type.",
    scope: { kind: "user_id" },
    preferTool: "query_finance_categories",
    defaultColumns: ["id", "name", "type_id"],
    defaultOrder: { column: "name", ascending: true },
    columns: [
      { name: "id", type: "id" },
      { name: "name", type: "text" },
      { name: "type_id", type: "id", references: "type" },
    ],
  },
  {
    name: "type",
    label: "Tipos de categoria",
    description: "Agrupa categorias (Moradia, Transporte…) e pendura a natureza.",
    scope: { kind: "user_id" },
    defaultColumns: ["id", "name", "nature_id", "exclude_from_spend"],
    defaultOrder: { column: "order", ascending: true },
    columns: [
      { name: "id", type: "id" },
      { name: "name", type: "text" },
      { name: "nature_id", type: "id", references: "nature" },
      { name: "exclude_from_spend", type: "boolean", description: "Fora das somas de gasto." },
      { name: "order", type: "number" },
      { name: "hex_color", type: "text" },
    ],
  },
  {
    name: "nature",
    label: "Naturezas",
    description: "Dimensão global: Receita, Despesa, Investimento. Não tem dono.",
    scope: { kind: "global" },
    defaultColumns: ["id", "name"],
    columns: [
      { name: "id", type: "id" },
      { name: "name", type: "text", enum: ["Receita", "Despesa", "Investimento"] },
    ],
  },
  {
    name: "monthly_budget",
    label: "Orçamento",
    description: "Valor planejado por mês para um type ou uma class. budget_month é sempre dia 1.",
    scope: { kind: "user_id" },
    preferTool: "query_budget_status",
    defaultColumns: ["id", "budget_month", "type_id", "class_id", "planned_value"],
    defaultOrder: { column: "budget_month", ascending: false },
    columns: [
      { name: "id", type: "id" },
      { name: "budget_month", type: "date" },
      { name: "type_id", type: "id", references: "type" },
      { name: "class_id", type: "id", references: "class" },
      { name: "planned_value", type: "number" },
      CRIADO_EM,
    ],
  },
  {
    name: "recurring_transaction",
    label: "Recorrências",
    description: "Conta fixa ou compra parcelada. paid_parcels lista as parcelas já pagas.",
    scope: { kind: "user_id" },
    preferTool: "query_recurring",
    defaultColumns: ["id", "description", "value", "frequency", "due_day", "status"],
    columns: [
      { name: "id", type: "uuid" },
      { name: "description", type: "text" },
      { name: "value", type: "number" },
      { name: "class_id", type: "id", references: "class" },
      { name: "frequency", type: "text", enum: ["monthly", "yearly", "weekly", "daily"] },
      { name: "due_day", type: "number", description: "Dia do mês do vencimento." },
      { name: "installment_count", type: "number", description: "Total de parcelas; nulo = infinita." },
      { name: "paid_parcels", type: "array", description: "Números das parcelas já pagas." },
      { name: "payment_start_date", type: "date" },
      { name: "validity", type: "date", description: "Até quando vale." },
      { name: "status", type: "boolean", description: "true = ativa." },
      {
        name: "link_url",
        type: "text",
        description: "Link da recorrência (ex.: onde se faz o pagamento).",
      },
      CRIADO_EM,
    ],
  },
  {
    name: "task",
    label: "Tarefas",
    description:
      "Tarefas e subtarefas (parent_task_id). Séries recorrentes materializam ocorrências com recurrence_origin_id.",
    scope: { kind: "user_id" },
    preferTool: "query_tasks",
    defaultColumns: ["id", "title", "status", "due_date", "priority", "project_id"],
    defaultOrder: { column: "due_date", ascending: true },
    columns: [
      { name: "id", type: "uuid" },
      { name: "title", type: "text" },
      { name: "description", type: "text" },
      { name: "status", type: "text", enum: ["todo", "doing", "done"] },
      { name: "priority", type: "text", enum: ["low", "medium", "high"] },
      { name: "due_date", type: "date" },
      { name: "due_time", type: "time" },
      { name: "start_date", type: "date" },
      { name: "completed_at", type: "timestamp" },
      { name: "project_id", type: "uuid", references: "project" },
      { name: "parent_task_id", type: "uuid", references: "task", description: "Preenchido = é subtarefa." },
      { name: "recurrence_origin_id", type: "uuid", references: "task" },
      { name: "tag_ids", type: "array", references: "tag" },
      { name: "estimated_duration", type: "number", description: "Minutos." },
      { name: "is_milestone", type: "boolean" },
      { name: "is_quick", type: "boolean" },
      { name: "is_medication", type: "boolean" },
      { name: "is_consultation", type: "boolean" },
      { name: "medication_id", type: "uuid", references: "medication" },
      { name: "linked_recurring_id", type: "id", references: "recurring_transaction" },
      { name: "linked_installment_number", type: "number" },
      { name: "sort_order", type: "number" },
      CRIADO_EM,
      { name: "updated_at", type: "timestamp" },
    ],
  },
  {
    name: "project",
    label: "Projetos",
    description: "Projeto que agrupa tarefas, eventos e notas.",
    scope: { kind: "user_id" },
    preferTool: "query_projects",
    defaultColumns: ["id", "name", "status", "goal_id"],
    defaultOrder: { column: "updated_at", ascending: false },
    columns: [
      { name: "id", type: "uuid" },
      { name: "name", type: "text" },
      { name: "description", type: "text" },
      { name: "status", type: "text", enum: ["planned", "active", "completed", "archived"] },
      { name: "goal_id", type: "uuid", references: "personal_goal" },
      { name: "color", type: "text" },
      { name: "tag_ids", type: "array", references: "tag" },
      CRIADO_EM,
      { name: "updated_at", type: "timestamp" },
    ],
  },
  {
    name: "tag",
    label: "Etiquetas",
    description: "Catálogo de tags, usado por tarefas, projetos e links.",
    scope: { kind: "user_id" },
    preferTool: "query_tags",
    defaultColumns: ["id", "name", "color"],
    defaultOrder: { column: "name", ascending: true },
    columns: [
      { name: "id", type: "uuid" },
      { name: "name", type: "text" },
      { name: "color", type: "text" },
      CRIADO_EM,
    ],
  },
  {
    name: "task_time_entry",
    label: "Tempo registrado",
    description: "Sessões de cronômetro por tarefa. ended_at nulo = rodando agora.",
    scope: { kind: "user_id" },
    preferTool: "query_time_tracking",
    defaultColumns: ["id", "task_id", "started_at", "ended_at"],
    defaultOrder: { column: "started_at", ascending: false },
    columns: [
      { name: "id", type: "uuid" },
      { name: "task_id", type: "uuid", references: "task" },
      { name: "started_at", type: "timestamp" },
      { name: "ended_at", type: "timestamp" },
      CRIADO_EM,
    ],
  },
  {
    name: "project_event",
    label: "Eventos da agenda",
    description: "Compromissos com hora marcada.",
    scope: { kind: "user_id" },
    preferTool: "query_agenda",
    defaultColumns: ["id", "title", "starts_at", "ends_at", "project_id"],
    defaultOrder: { column: "starts_at", ascending: true },
    columns: [
      { name: "id", type: "uuid" },
      { name: "title", type: "text" },
      { name: "starts_at", type: "timestamp" },
      { name: "ends_at", type: "timestamp" },
      { name: "project_id", type: "uuid", references: "project" },
      CRIADO_EM,
    ],
  },
  {
    name: "note",
    label: "Notas",
    description: "Notas em markdown e canvas (kind = canvas guarda o desenho em canvas_data).",
    scope: { kind: "user_id" },
    preferTool: "query_notes",
    defaultColumns: ["id", "title", "kind", "project_id", "updated_at"],
    defaultOrder: { column: "updated_at", ascending: false },
    columns: [
      { name: "id", type: "uuid" },
      { name: "title", type: "text" },
      { name: "content", type: "text", description: "Corpo em markdown; pode ser enorme." },
      { name: "kind", type: "text", enum: ["markdown", "canvas"] },
      { name: "project_id", type: "uuid", references: "project" },
      CRIADO_EM,
      { name: "updated_at", type: "timestamp" },
    ],
  },
  {
    name: "habit",
    label: "Hábitos",
    description: "Hábito a construir (kind=build) ou a largar (kind=quit).",
    scope: { kind: "user_id" },
    preferTool: "query_habits",
    defaultColumns: ["id", "name", "frequency", "target_per_week", "kind"],
    columns: [
      { name: "id", type: "uuid" },
      { name: "name", type: "text" },
      { name: "description", type: "text" },
      { name: "frequency", type: "text" },
      { name: "target_per_week", type: "number" },
      { name: "kind", type: "text", enum: ["build", "quit"] },
      { name: "is_health", type: "boolean" },
      { name: "goal_id", type: "uuid", references: "personal_goal" },
      CRIADO_EM,
    ],
  },
  {
    name: "habit_log",
    label: "Check-ins de hábito",
    description: "Um dia marcado (ou não) de um hábito. NÃO tem user_id: o escopo vem do hábito.",
    scope: { kind: "parent", column: "habit_id", parent: "habit" },
    defaultColumns: ["id", "habit_id", "date", "completed"],
    defaultOrder: { column: "date", ascending: false },
    columns: [
      { name: "id", type: "uuid" },
      { name: "habit_id", type: "uuid", references: "habit" },
      { name: "date", type: "date" },
      { name: "completed", type: "boolean" },
      CRIADO_EM,
    ],
  },
  {
    name: "personal_goal",
    label: "Metas",
    description: "Meta com valor alvo, valor atual e prazo.",
    scope: { kind: "user_id" },
    preferTool: "query_goals",
    defaultColumns: ["id", "title", "target_value", "current_value", "unit", "deadline", "status"],
    columns: [
      { name: "id", type: "uuid" },
      { name: "title", type: "text" },
      { name: "description", type: "text" },
      { name: "category", type: "text" },
      { name: "target_value", type: "number" },
      { name: "current_value", type: "number" },
      { name: "unit", type: "text" },
      { name: "deadline", type: "date" },
      { name: "status", type: "text" },
      CRIADO_EM,
      { name: "updated_at", type: "timestamp" },
    ],
  },
  {
    name: "movie",
    label: "Filmes e séries",
    description: "Lista de filmes e séries. watched_dates guarda cada vez que foi assistido.",
    scope: { kind: "user_id" },
    preferTool: "query_movies",
    defaultColumns: ["imdb_id", "title", "year", "status", "rating", "type"],
    defaultOrder: { column: "created_at", ascending: false },
    columns: [
      { name: "imdb_id", type: "text", description: "Chave primária." },
      { name: "title", type: "text" },
      { name: "year", type: "number" },
      { name: "type", type: "text", enum: ["movie", "series"] },
      { name: "status", type: "text", enum: ["to_watch", "watching", "watched", "abandoned"] },
      { name: "rating", type: "number", description: "Nota do usuário, 0 a 10." },
      { name: "score_imdb", type: "number" },
      { name: "genre", type: "array" },
      { name: "director", type: "text" },
      { name: "watched_dates", type: "array" },
      { name: "would_recommend", type: "boolean" },
      { name: "is_favorite", type: "boolean" },
      { name: "episode_count", type: "number" },
      CRIADO_EM,
    ],
  },
  {
    name: "book",
    label: "Livros",
    description: "Estante. current_page é o marca-página.",
    scope: { kind: "user_id" },
    preferTool: "query_books",
    defaultColumns: ["google_id", "title", "authors", "status", "current_page", "page_count"],
    defaultOrder: { column: "created_at", ascending: false },
    columns: [
      { name: "google_id", type: "text", description: "Chave primária." },
      { name: "title", type: "text" },
      { name: "authors", type: "array" },
      { name: "status", type: "text", enum: ["to_read", "reading", "read", "abandoned"] },
      { name: "current_page", type: "number" },
      { name: "page_count", type: "number" },
      { name: "rating", type: "number" },
      { name: "categories", type: "array" },
      { name: "published_year", type: "number" },
      { name: "read_dates", type: "array" },
      { name: "is_favorite", type: "boolean" },
      CRIADO_EM,
    ],
  },
  {
    name: "album",
    label: "Álbuns",
    description: "Discos ouvidos ou para ouvir.",
    scope: { kind: "user_id" },
    preferTool: "query_albums",
    defaultColumns: ["musicbrainz_id", "title", "artists", "status", "rating", "release_year"],
    defaultOrder: { column: "created_at", ascending: false },
    columns: [
      { name: "musicbrainz_id", type: "text", description: "Chave primária." },
      { name: "title", type: "text" },
      { name: "artists", type: "array" },
      { name: "status", type: "text" },
      { name: "rating", type: "number" },
      { name: "release_year", type: "number" },
      { name: "album_type", type: "text" },
      { name: "listened_dates", type: "array" },
      { name: "is_favorite", type: "boolean" },
      CRIADO_EM,
    ],
  },
  {
    name: "place_visit",
    label: "Lugares",
    description: "Lugares visitados ou para visitar; podem estar ligados a uma viagem.",
    scope: { kind: "user_id" },
    preferTool: "query_places",
    defaultColumns: ["id", "name", "type", "status", "rating", "visited_date"],
    columns: [
      { name: "id", type: "uuid" },
      { name: "name", type: "text" },
      { name: "type", type: "text", description: "Restaurante, bar, museu…" },
      { name: "status", type: "text", enum: ["to_visit", "visited"] },
      { name: "rating", type: "number" },
      { name: "visited_date", type: "date" },
      { name: "address", type: "text" },
      { name: "amount", type: "number", description: "Quanto se gastou lá." },
      { name: "trip_id", type: "uuid", references: "trip" },
      { name: "would_recommend", type: "boolean" },
      CRIADO_EM,
    ],
  },
  {
    name: "trip",
    label: "Viagens",
    description: "Viagem com destino, datas e orçamento.",
    scope: { kind: "user_id" },
    preferTool: "query_trips",
    defaultColumns: ["id", "title", "destination", "start_date", "end_date", "status"],
    defaultOrder: { column: "start_date", ascending: false },
    columns: [
      { name: "id", type: "uuid" },
      { name: "title", type: "text" },
      { name: "destination", type: "text" },
      { name: "start_date", type: "date" },
      { name: "end_date", type: "date" },
      { name: "budget", type: "number" },
      { name: "spent", type: "number" },
      { name: "status", type: "text" },
      CRIADO_EM,
    ],
  },
  {
    name: "shopping_item",
    label: "Itens de compra",
    description: "Item da lista de compras.",
    scope: { kind: "user_id" },
    preferTool: "query_shopping_list",
    defaultColumns: ["id", "title", "status", "quantity", "unit", "shopping_category_id"],
    columns: [
      { name: "id", type: "uuid" },
      { name: "title", type: "text" },
      { name: "description", type: "text" },
      { name: "status", type: "text", enum: ["pending", "purchased"] },
      { name: "quantity", type: "number" },
      { name: "unit", type: "text" },
      { name: "provider_link", type: "text" },
      { name: "shopping_category_id", type: "uuid", references: "shopping_category" },
      CRIADO_EM,
      { name: "updated_at", type: "timestamp" },
    ],
  },
  {
    name: "shopping_category",
    label: "Categorias de compra",
    description: "Agrupa itens da lista; pode pertencer a um projeto.",
    scope: { kind: "user_id" },
    defaultColumns: ["id", "name", "project_id"],
    defaultOrder: { column: "name", ascending: true },
    columns: [
      { name: "id", type: "uuid" },
      { name: "name", type: "text" },
      { name: "description", type: "text" },
      { name: "project_id", type: "uuid", references: "project" },
      { name: "color", type: "text" },
      CRIADO_EM,
    ],
  },
  {
    name: "medication",
    label: "Tratamentos",
    description: "Medicação em uso; times são os horários do dia.",
    scope: { kind: "user_id" },
    preferTool: "query_medications",
    defaultColumns: ["id", "name", "dose_amount", "dose_unit", "times", "active"],
    columns: [
      { name: "id", type: "uuid" },
      { name: "name", type: "text" },
      { name: "dose_amount", type: "number" },
      { name: "dose_unit", type: "text" },
      { name: "times", type: "array", description: "Horários do dia (HH:MM)." },
      { name: "interval_days", type: "number" },
      { name: "started_on", type: "date" },
      { name: "ended_on", type: "date" },
      { name: "active", type: "boolean" },
      { name: "instructions", type: "text" },
      CRIADO_EM,
    ],
  },
  {
    name: "health_metric",
    label: "Métricas de saúde",
    description: "Medida registrada (peso, pressão, sono…) numa data.",
    scope: { kind: "user_id" },
    preferTool: "query_health_metrics",
    defaultColumns: ["id", "metric_type", "value", "recorded_date"],
    defaultOrder: { column: "recorded_date", ascending: false },
    columns: [
      { name: "id", type: "uuid" },
      { name: "metric_type", type: "text" },
      { name: "value", type: "number" },
      { name: "recorded_date", type: "date" },
      { name: "notes", type: "text" },
      CRIADO_EM,
    ],
  },
  {
    name: "content_link",
    label: "Links salvos",
    description: "Link guardado para ler/ver depois.",
    scope: { kind: "user_id" },
    preferTool: "query_content_links",
    defaultColumns: ["id", "title", "url", "type", "status"],
    defaultOrder: { column: "created_at", ascending: false },
    columns: [
      { name: "id", type: "uuid" },
      { name: "title", type: "text" },
      { name: "url", type: "text" },
      { name: "type", type: "text" },
      { name: "status", type: "text" },
      { name: "tag_ids", type: "array", references: "tag" },
      { name: "consumed_at", type: "timestamp" },
      { name: "is_favorite", type: "boolean" },
      CRIADO_EM,
    ],
  },
  {
    name: "vehicle",
    label: "Veículos",
    description: "Carro ou moto do usuário.",
    scope: { kind: "user_id" },
    preferTool: "query_vehicles",
    defaultColumns: ["id", "brand", "model", "year", "plate", "current_km"],
    columns: [
      { name: "id", type: "uuid" },
      { name: "brand", type: "text" },
      { name: "model", type: "text" },
      { name: "year", type: "number" },
      { name: "plate", type: "text" },
      { name: "current_km", type: "number" },
      { name: "fuel_type", type: "text" },
      { name: "kind", type: "text" },
      { name: "purchase_date", type: "date" },
      { name: "purchase_value", type: "number" },
      CRIADO_EM,
    ],
  },
  {
    name: "vehicle_maintenance",
    label: "Manutenções",
    description: "Serviço feito num veículo. NÃO tem user_id: o escopo vem do veículo.",
    scope: { kind: "parent", column: "vehicle_id", parent: "vehicle" },
    defaultColumns: ["id", "vehicle_id", "type", "service_date", "km_at_service", "cost"],
    defaultOrder: { column: "service_date", ascending: false },
    columns: [
      { name: "id", type: "uuid" },
      { name: "vehicle_id", type: "uuid", references: "vehicle" },
      { name: "type", type: "text" },
      { name: "custom_type", type: "text" },
      { name: "service_date", type: "date" },
      { name: "km_at_service", type: "number" },
      { name: "cost", type: "number" },
      { name: "shop", type: "text" },
      { name: "next_km", type: "number" },
      { name: "next_date", type: "date" },
      { name: "notes", type: "text" },
      CRIADO_EM,
    ],
  },
  {
    name: "vehicle_fuel_log",
    label: "Abastecimentos",
    description: "Abastecimento de um veículo. NÃO tem user_id: o escopo vem do veículo.",
    scope: { kind: "parent", column: "vehicle_id", parent: "vehicle" },
    defaultColumns: ["id", "vehicle_id", "date", "liters", "total_cost", "km"],
    defaultOrder: { column: "date", ascending: false },
    columns: [
      { name: "id", type: "uuid" },
      { name: "vehicle_id", type: "uuid", references: "vehicle" },
      { name: "date", type: "date" },
      { name: "liters", type: "number" },
      { name: "total_cost", type: "number" },
      { name: "km", type: "number", description: "Odômetro no abastecimento." },
      { name: "station", type: "text" },
      { name: "notes", type: "text" },
      CRIADO_EM,
    ],
  },
];

export function findOrbTable(name: string): OrbTable | undefined {
  return ORB_TABLES.find((tabela) => tabela.name === name);
}

export const ORB_TABLE_NAMES: readonly string[] = ORB_TABLES.map((tabela) => tabela.name);

/** Índice compacto (uma linha por tabela) — é o que cabe no `description` da tool. */
export function describeOrbTables(): string {
  return ORB_TABLES.map((tabela) => `- ${tabela.name}: ${tabela.description}`).join("\n");
}

/** Ficha completa de uma tabela, para o `describe_data`. */
export function describeOrbTable(tabela: OrbTable): Record<string, unknown> {
  return {
    table: tabela.name,
    label: tabela.label,
    description: tabela.description,
    scope:
      tabela.scope.kind === "user_id"
        ? "linhas do próprio usuário"
        : tabela.scope.kind === "global"
          ? "dimensão global, sem dono"
          : `herdado de ${tabela.scope.parent} por ${tabela.scope.column}`,
    default_columns: tabela.defaultColumns,
    default_order: tabela.defaultOrder ?? null,
    prefer_tool: tabela.preferTool ?? null,
    columns: tabela.columns.map((coluna) => ({
      name: coluna.name,
      type: coluna.type,
      ...(coluna.description ? { description: coluna.description } : {}),
      ...(coluna.enum ? { values: coluna.enum } : {}),
      ...(coluna.references ? { references: coluna.references } : {}),
    })),
  };
}
