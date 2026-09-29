/** Rótulos curtos para o cartão de tool. Fallback: nome humanizado, nunca o snake_case cru se der. */

const LABELS: Record<string, string> = {
  query_tasks: "Tarefas",
  query_budget_status: "Orçamento do mês",
  query_transactions: "Lançamentos",
  query_finance_categories: "Categorias",
  query_recurring: "Recorrências",
  query_habits: "Hábitos",
  query_goals: "Metas",
  query_notes: "Notas",
  query_places: "Lugares",
  query_trips: "Viagens",
  query_movies: "Cinema",
  query_books: "Livros",
  query_music: "Música",
  query_health: "Saúde",
  query_vehicles: "Veículos",
  query_shopping: "Lista de compras",
  open_screen: "Abrir tela",
  propose_create: "Proposta de criação",
  ask_user: "Pergunta",
};

function humanize(name: string): string {
  return name
    .replace(/^query_/, "")
    .replace(/^propose_/, "")
    .replace(/_/g, " ")
    .trim();
}

export function orbToolLabel(name: string): string {
  return LABELS[name] ?? humanize(name);
}
