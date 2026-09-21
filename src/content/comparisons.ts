/**
 * Scaffold de comparações factuais.
 * Não publicar claims sobre concorrentes sem pesquisa documentada.
 * Ver docs/SEO-GEO.md § Comparações.
 */

export type ComparisonDimension = {
  id: string;
  label: string;
  /** Valor factual do Orbyva (só o que existe no produto). */
  orbyva: string;
  /** Preencher só com fonte verificável; senão deixar null. */
  notion?: string | null;
  organizze?: string | null;
  notes?: string;
};

export const COMPARISON_DIMENSIONS: ComparisonDimension[] = [
  {
    id: "purpose",
    label: "Finalidade",
    orbyva: "Life OS / organização pessoal com finanças no núcleo",
    notion: null,
    organizze: null,
    notes: "Pesquisar posicionamento oficial de cada produto.",
  },
  {
    id: "finance",
    label: "Finanças nativas",
    orbyva: "Sim: teto, contas, parcelas, projeção; ferramenta pública sem login",
    notion: null,
    organizze: null,
  },
  {
    id: "goals",
    label: "Metas",
    orbyva: "Sim: metas com progresso no mesmo login",
    notion: null,
    organizze: null,
  },
  {
    id: "setup",
    label: "Necessidade de configuração",
    orbyva: "App pronto; módulos ligados à conta",
    notion: null,
    organizze: null,
  },
  {
    id: "audience",
    label: "Público-alvo",
    orbyva: "Pessoa física no Brasil (PT-BR), vida pessoal",
    notion: null,
    organizze: null,
  },
  {
    id: "model",
    label: "Modelo de uso",
    orbyva: "PWA web; teste 7 dias; Pro R$ 19,90/mês",
    notion: null,
    organizze: null,
  },
];

export const COMPARISON_RESEARCH_TODO = [
  "Confirmar no site oficial Notion: finanças nativas, metas, preço BR, idioma.",
  "Confirmar no site oficial Organizze: escopo além de finanças, metas, preço.",
  "Só então publicar /orbyva-vs-notion, /alternativas-ao-notion, /alternativas-ao-organizze.",
  "Evitar linguagem de ranking (“melhor”, “número 1”).",
] as const;
