/**
 * Catálogo das tools da Orb no mobile: nome, título e área de cada uma.
 *
 * É uma cópia estática de `supabase/functions/_shared/orb/registry.ts` porque importar o registro
 * arrastaria o código de todas as tools (SQL, descrições) para o bundle do app. O teste
 * `__tests__/toolCatalog.test.ts` importa o registro de verdade e falha se esta lista divergir:
 * tool nova no servidor exige uma linha aqui.
 */

export interface OrbCatalogTool {
  name: string;
  title: string;
}

export interface OrbCatalogArea {
  nome: string;
  tools: OrbCatalogTool[];
}

/** Mesmas áreas e mesma ordem do painel da web (`src/components/orb/OrbCapabilities.tsx`). */
export const ORB_CONSULT_AREAS: OrbCatalogArea[] = [
  {
    nome: "Finanças",
    tools: [
      { name: "query_budget_status", title: "Orçamento do mês" },
      { name: "query_spend_by_category", title: "Gastos por categoria" },
      { name: "query_transactions", title: "Lançamentos" },
      { name: "query_recurring", title: "Recorrências e parcelas" },
      { name: "simulate_installment_impact", title: "Simulação de parcelamento" },
      { name: "query_finance_categories", title: "Categorias financeiras" },
      { name: "query_monthly_history", title: "Histórico mensal" },
      { name: "simulate_budget_cut", title: "Onde cortar gasto" },
      { name: "simulate_month_balance", title: "Projeção de saldo mensal" },
    ],
  },
  {
    nome: "Tarefas e projetos",
    tools: [
      { name: "query_tasks", title: "Tarefas" },
      { name: "query_projects", title: "Projetos" },
      { name: "query_agenda", title: "Agenda" },
      { name: "query_tags", title: "Tags" },
      { name: "query_content_links", title: "Links salvos" },
      { name: "query_time_tracking", title: "Tempo registrado" },
    ],
  },
  {
    nome: "Rotina e conteúdo",
    tools: [
      { name: "query_habits", title: "Hábitos" },
      { name: "query_goals", title: "Metas" },
      { name: "query_movies", title: "Filmes e séries" },
      { name: "query_books", title: "Livros" },
      { name: "query_reading_progress", title: "Progresso de leitura" },
      { name: "query_albums", title: "Álbuns" },
      { name: "query_series_progress", title: "Progresso de séries" },
    ],
  },
  {
    nome: "Viagens",
    tools: [
      { name: "query_trips", title: "Viagens" },
      { name: "query_trip_day_plan", title: "Roteiro do dia" },
      { name: "query_trip_expenses", title: "Gastos de viagem" },
    ],
  },
  { nome: "Compras", tools: [{ name: "query_shopping_list", title: "Lista de compras" }] },
  {
    nome: "Saúde",
    tools: [
      { name: "query_medications", title: "Medicações" },
      { name: "query_health_metrics", title: "Medições corporais" },
    ],
  },
  { nome: "Notas", tools: [{ name: "query_notes", title: "Notas" }] },
  { nome: "Próximos compromissos", tools: [{ name: "query_upcoming", title: "O que vem por aí" }] },
  { nome: "Lugares", tools: [{ name: "query_places", title: "Lugares" }] },
  {
    nome: "Veículos",
    tools: [
      { name: "query_vehicles", title: "Veículos" },
      { name: "query_vehicle_alerts", title: "Alertas do veículo" },
    ],
  },
  {
    nome: "Consulta livre",
    tools: [
      { name: "describe_data", title: "Estrutura dos dados" },
      { name: "query_data", title: "Consulta livre" },
    ],
  },
];

/** Tools que só existem dentro do app (`ORB_APP_ONLY_TOOLS`): não contam como consulta. */
export const ORB_APP_ONLY_CATALOG: OrbCatalogTool[] = [
  { name: "open_screen", title: "Abrir tela" },
  { name: "propose_create", title: "Criar (com confirmação)" },
  { name: "ask_user", title: "Perguntar" },
];

export const ORB_CONSULT_COUNT = ORB_CONSULT_AREAS.reduce((n, a) => n + a.tools.length, 0);

const TITLES = new Map(
  [...ORB_CONSULT_AREAS.flatMap((a) => a.tools), ...ORB_APP_ONLY_CATALOG].map((t) => [
    t.name,
    t.title,
  ])
);

export function orbCatalogTitle(name: string): string | undefined {
  return TITLES.get(name);
}
