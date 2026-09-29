/**
 * As pílulas de sugestão da primeira tela da Orb — uma fonte só para o chat, para o dock da barra
 * lateral e para o catálogo de prompts do servidor MCP (`mcp/prompts.ts`), que aponta para cá via
 * o reexport de `prompts.ts`.
 *
 * Módulo próprio, e não uma constante no fim de `prompts.ts`, por causa do bundle: o dock aparece em
 * TODA página do app, e importar daquele arquivo trazia junto a política inteira e os prompts do
 * MCP (~18 KB de texto) para o chunk carregado sempre.
 */

/**
 * Perguntas tiradas de `docs/planning/orb-ia/brainstorm.md`, todas respondíveis pelo catálogo atual.
 *
 * Uma por área, de propósito: com três sugestões financeiras de quatro, a primeira tela ensinava que
 * a Orb é um app de finanças que também tem tarefas. Ela lê dezenas de consultas em dez módulos.
 */
export const ORB_SUGESTOES_DE_CHAT = [
  "Tenho algum orçamento estourado esse mês?",
  "Posso parcelar uma compra de R$ 5.000 em 12x?",
  "O que eu tenho pra fazer hoje?",
  "O que vence nos próximos 7 dias?",
  "Me indica um filme que eu ainda não vi",
  "Como estão meus hábitos essa semana?",
];
