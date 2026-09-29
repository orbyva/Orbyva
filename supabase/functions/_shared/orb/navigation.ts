/**
 * Catálogo de telas do Orbyva e montagem dos links que a Orb usa para NAVEGAR o app (feature 100).
 *
 * Uma fonte só, e portátil (TS puro, sem import externo e sem API de runtime — a regra deste
 * diretório), porque três lados precisam concordar sobre o mesmo caminho:
 *
 *   1. a tool `open_screen` (`tools/navigation.ts`), que monta a URL no servidor;
 *   2. o client (`src/hooks/useOrbChat.ts`), que VALIDA de novo antes de chamar `navigate()` —
 *      caminho que veio de um modelo não entra no router sem passar por whitelist;
 *   3. as telas, que leem esses mesmos parâmetros da URL.
 *
 * Se um parâmetro aqui não existir na tela, a Orb "navega com filtro" e o filtro não acontece: o
 * elenco de `filters` de cada tela é contrato com a página, não sugestão.
 */

/** Nome da tool de navegação. O client reconhece o evento por ele — não é string solta na UI. */
export const ORB_NAVIGATION_TOOL_NAME = "open_screen";

/** Campos da tool que viram parâmetro de URL. Um mesmo campo significa coisas diferentes por tela. */
export type OrbNavField =
  | "project"
  | "search"
  | "status"
  | "view"
  | "priority"
  | "tag"
  | "nature"
  | "tab"
  | "today"
  // Acrescentado no FIM pelo mesmo motivo das telas: a ordem faz parte do prefixo cacheado.
  | "task";

export interface OrbScreenFilter {
  /** Campo da tool que alimenta este parâmetro. */
  field: OrbNavField;
  /** Nome do parâmetro na URL, como a tela lê. */
  param: string;
  /** Para o modelo: o que este filtro faz NESTA tela. */
  description: string;
  /** Conjunto fechado de valores aceitos. Ausente = texto livre. */
  values?: readonly string[];
  /** Vocabulário que o modelo costuma usar → valor que a tela entende. */
  aliases?: Readonly<Record<string, string>>;
}

/** Entidade que preenche o `:id` do caminho de uma tela de detalhe. */
export type OrbScreenEntity = "project" | "trip" | "note";

export interface OrbScreen {
  id: string;
  /** Rótulo humano, usado no texto que a Orb escreve e no cartão da tool. */
  label: string;
  /** Caminho fixo, ou com `:id` quando a tela é de detalhe (ver `entity`). */
  path: string;
  /** Quando existe, o `:id` do caminho vem desta entidade, resolvida por nome no banco. */
  entity?: OrbScreenEntity;
  /** Uma linha para o modelo escolher a tela certa. */
  hint: string;
  filters: readonly OrbScreenFilter[];
}

const BUSCA_LIVRE = (oQue: string): OrbScreenFilter => ({
  field: "search",
  param: "q",
  description: `Texto a procurar ${oQue}.`,
});

const FILTRO_PROJETO: OrbScreenFilter = {
  field: "project",
  param: "project",
  description: "Nome (ou id) do projeto. Aceita o nome; eu resolvo o id.",
};

/** Status de tarefa como a lista entende — `pending` é o padrão da tela, não "todas". */
const STATUS_DE_TAREFA: OrbScreenFilter = {
  field: "status",
  param: "status",
  description: "Recorte por conclusão.",
  values: ["pending", "done", "all"],
  aliases: {
    abertas: "pending",
    pendentes: "pending",
    todo: "pending",
    doing: "pending",
    concluidas: "done",
    concluídas: "done",
    feitas: "done",
    todas: "all",
  },
};

/**
 * O CATÁLOGO.
 *
 * A ordem importa por dois motivos: ela é o enum `screen` que o modelo lê (as telas mais pedidas
 * primeiro ajudam a escolha) e faz parte do prefixo do prompt, que é cacheado — acrescente tela
 * nova no FIM, como manda a regra de `registry.ts`.
 */
export const ORB_SCREENS: readonly OrbScreen[] = [
  {
    id: "tasks",
    label: "Tarefas",
    path: "/tasks",
    hint: "Lista de tarefas, com abas Lista/Kanban/Gantt/Agenda. É a tela para 'as tarefas do projeto X'.",
    filters: [
      FILTRO_PROJETO,
      BUSCA_LIVRE("no título da tarefa"),
      STATUS_DE_TAREFA,
      {
        field: "view",
        param: "view",
        description: "Aba da tela.",
        values: ["lista", "kanban", "gantt", "agenda"],
        aliases: { list: "lista", board: "kanban", calendario: "agenda", calendário: "agenda" },
      },
      {
        field: "priority",
        param: "priority",
        description: "Só tarefas desta prioridade.",
        values: ["low", "medium", "high"],
        aliases: { baixa: "low", media: "medium", média: "medium", alta: "high" },
      },
      { field: "tag", param: "tag", description: "Nome (ou id) da etiqueta.", },
      {
        field: "today",
        param: "today",
        description: "true mostra só o que vence hoje ou está atrasado.",
        values: ["1"],
      },
      // Feature 102 — o único parâmetro desta tela que NÃO é filtro, e por isso entra por último
      // (acrescentar no meio quebraria o prefixo cacheado do prompt, regra do topo de `registry.ts`).
      {
        field: "task",
        param: "task",
        description:
          "Id (uuid) de UMA tarefa. Não recorta a lista: abre aquela tarefa para edição. " +
          "Use quando a pessoa pedir para abrir/ver uma tarefa específica cujo id você já tem de " +
          "uma consulta — é mais preciso que busca por título, que repete em recorrências.",
      },
    ],
  },
  {
    id: "task_projects",
    label: "Projetos",
    path: "/tasks/projects",
    hint: "Painel dos projetos (progresso, prazo, tarefas por projeto).",
    filters: [],
  },
  {
    id: "project_detail",
    label: "Projeto",
    path: "/tasks/projects/:id",
    entity: "project",
    hint: "A página de um projeto específico. Exige o projeto.",
    filters: [
      {
        field: "tab",
        param: "tab",
        description: "Aba dentro do projeto.",
        values: ["visao", "tarefas", "eventos", "notas"],
      },
    ],
  },
  {
    id: "tasks_agenda",
    label: "Agenda",
    path: "/tasks/agenda",
    hint: "Calendário de compromissos e prazos.",
    filters: [],
  },
  {
    id: "tasks_live",
    label: "Foco",
    path: "/tasks/live",
    hint: "Modo foco: a tarefa de agora e o cronômetro.",
    filters: [FILTRO_PROJETO],
  },
  {
    id: "notes",
    label: "Notas",
    path: "/notes",
    hint: "Notas e canvas. Também é a tela para 'as notas do projeto X'.",
    // Feature 114 — `project` entra no FIM, como manda a convenção do arquivo: acrescentar no meio
    // muda o prefixo cacheado do prompt. `/notes` lê o parâmetro e recorta a lista pelo projeto.
    filters: [BUSCA_LIVRE("no título e no corpo da nota"), FILTRO_PROJETO],
  },
  {
    id: "note_detail",
    label: "Nota",
    path: "/notes/:id",
    entity: "note",
    hint: "Uma nota específica, aberta. Exige a nota.",
    filters: [],
  },
  {
    id: "shopping_list",
    label: "Lista de compras",
    path: "/shopping-list",
    hint: "Lista de compras.",
    filters: [FILTRO_PROJETO],
  },
  {
    id: "finance_dashboard",
    label: "Painel de finanças",
    path: "/finance/dashboard",
    hint: "Resumo do mês: entradas, saídas, saldo e gráficos.",
    filters: [],
  },
  {
    id: "transactions",
    label: "Transações",
    path: "/finance/transactions",
    hint: "Extrato de lançamentos, com busca e filtro por natureza.",
    filters: [
      BUSCA_LIVRE("na descrição do lançamento"),
      {
        field: "nature",
        param: "nature",
        description: "Natureza do lançamento.",
        values: ["Receita", "Despesa", "Investimento"],
        aliases: {
          receita: "Receita",
          entrada: "Receita",
          despesa: "Despesa",
          gasto: "Despesa",
          saida: "Despesa",
          saída: "Despesa",
          investimento: "Investimento",
        },
      },
    ],
  },
  {
    id: "recurring",
    label: "Recorrências",
    path: "/finance/recurring",
    hint: "Contas fixas e parcelas, com a aba de projeção.",
    filters: [
      {
        field: "tab",
        param: "tab",
        description: "Aba da tela.",
        values: ["registros", "projecao"],
        aliases: { projeção: "projecao", previsao: "projecao", previsão: "projecao" },
      },
    ],
  },
  {
    id: "budget",
    label: "Orçamento",
    path: "/finance/budget",
    hint: "Orçamento do mês por categoria.",
    filters: [],
  },
  {
    id: "finance_categories",
    label: "Categorias",
    path: "/finance/categories",
    hint: "Categorias e subcategorias de finanças.",
    filters: [],
  },
  {
    id: "habits",
    label: "Hábitos",
    path: "/habits",
    hint: "Hábitos e check-ins.",
    filters: [],
  },
  {
    id: "goals",
    label: "Metas",
    path: "/goals",
    hint: "Metas pessoais e progresso.",
    filters: [],
  },
  {
    id: "health",
    label: "Saúde",
    path: "/life/health",
    hint: "Painel de saúde: métricas, medicações e adesão.",
    filters: [],
  },
  {
    id: "places",
    label: "Lugares",
    path: "/places",
    hint: "Lugares para visitar e já visitados.",
    filters: [
      BUSCA_LIVRE("no nome do lugar"),
      {
        field: "status",
        param: "status",
        description: "Recorte por visita.",
        values: ["to_visit", "visited"],
        aliases: {
          quero: "to_visit",
          pendentes: "to_visit",
          visitados: "visited",
          visitado: "visited",
        },
      },
    ],
  },
  {
    id: "travel",
    label: "Viagens",
    path: "/travel",
    hint: "Lista de viagens.",
    filters: [],
  },
  {
    id: "trip_detail",
    label: "Viagem",
    path: "/travel/:id",
    entity: "trip",
    hint: "Uma viagem específica (roteiro, gastos, checklist). Exige a viagem.",
    filters: [],
  },
  {
    id: "car",
    label: "Veículos",
    path: "/car",
    hint: "Veículos, manutenções e abastecimentos.",
    filters: [],
  },
  {
    id: "movies",
    label: "Cinema",
    path: "/movies",
    hint: "Filmes e séries.",
    filters: [
      BUSCA_LIVRE("no título do filme ou série"),
      {
        field: "status",
        param: "status",
        description: "Recorte por situação.",
        values: ["to_watch", "watching", "watched", "abandoned"],
        aliases: {
          assistir: "to_watch",
          quero: "to_watch",
          assistindo: "watching",
          assistidos: "watched",
          vistos: "watched",
          abandonados: "abandoned",
        },
      },
    ],
  },
  {
    id: "books",
    label: "Livros",
    path: "/books",
    hint: "Livros e progresso de leitura.",
    filters: [
      BUSCA_LIVRE("no título ou autor"),
      {
        field: "status",
        param: "status",
        description: "Recorte por situação.",
        values: ["to_read", "reading", "read", "abandoned"],
        aliases: {
          ler: "to_read",
          quero: "to_read",
          lendo: "reading",
          lidos: "read",
          abandonados: "abandoned",
        },
      },
    ],
  },
  {
    id: "music",
    label: "Música",
    path: "/music",
    hint: "Álbuns e artistas.",
    filters: [],
  },
  {
    id: "links",
    label: "Links",
    path: "/links",
    hint: "Links salvos.",
    filters: [],
  },
  {
    id: "timeline",
    label: "Timeline",
    path: "/timeline",
    hint: "Linha do tempo com o que aconteceu e o que vem.",
    filters: [],
  },
  {
    id: "home",
    label: "Início",
    path: "/home",
    hint: "Painel inicial, com o resumo de todos os módulos.",
    filters: [],
  },
] as const;

export function findOrbScreen(id: string): OrbScreen | undefined {
  return ORB_SCREENS.find((screen) => screen.id === id);
}

/** Ids das telas, na ordem do catálogo — é o `enum` do schema da tool. */
export const ORB_SCREEN_IDS: readonly string[] = ORB_SCREENS.map((screen) => screen.id);

/** Uma linha por tela, para o `description` da tool. */
export function describeOrbScreens(): string {
  return ORB_SCREENS.map((screen) => `- ${screen.id} (${screen.label}): ${screen.hint}`).join("\n");
}

/**
 * Normaliza o valor de um filtro de conjunto fechado: primeiro o alias (o modelo escreve
 * "concluídas", a tela lê "done"), depois o próprio valor, sem diferenciar caixa nem acento no
 * caminho do alias. Devolve `undefined` quando o valor não pertence ao conjunto — quem chama
 * decide se isso é erro ou se ignora.
 */
export function normalizeOrbFilterValue(
  filtro: OrbScreenFilter,
  bruto: string
): string | undefined {
  const valor = bruto.trim();
  if (!valor) return undefined;
  if (!filtro.values) return valor;
  if (filtro.values.includes(valor)) return valor;

  const chave = valor.toLowerCase();
  const alias = filtro.aliases?.[chave];
  if (alias && filtro.values.includes(alias)) return alias;

  const casaSemCaixa = filtro.values.find((opcao) => opcao.toLowerCase() === chave);
  return casaSemCaixa;
}

/** O que a tool devolve e o client consome — a forma é contrato entre os dois. */
export interface OrbNavigationTarget {
  /** Caminho relativo, sempre começando com `/`. */
  path: string;
  /** Rótulo pronto para a UI: "Tarefas · Sacada". */
  label: string;
  /** Id da tela no catálogo, para a UI não ter que reparsear o caminho. */
  screen: string;
  /** Filtros que entraram, em PT-BR, para a Orb poder repetir o que fez. */
  applied: string[];
}

export interface OrbNavigationInput {
  screen: OrbScreen;
  /** Id da entidade da rota de detalhe (`:id`), já resolvido e conferido no banco. */
  entityId?: string;
  /** Nome da entidade, para o rótulo ("Viagem · Chile"). */
  entityLabel?: string;
  /** Valores dos filtros, já resolvidos (id no lugar de nome). */
  values?: Partial<Record<OrbNavField, string>>;
  /** Rótulo humano de um filtro, quando o valor é um id ("projeto: Sacada"). */
  labels?: Partial<Record<OrbNavField, string>>;
}

/**
 * Monta o alvo da navegação. Filtro que a tela não declara nunca entra na URL — a whitelist é o
 * `filters` do catálogo, e é a mesma que o client usa para validar o caminho de volta.
 */
export function buildOrbNavigationTarget({
  screen,
  entityId,
  entityLabel,
  values = {},
  labels = {},
}: OrbNavigationInput): OrbNavigationTarget {
  let path = screen.path;
  if (screen.entity) {
    if (!entityId) {
      throw new Error(`Tela "${screen.id}" exige o id de ${screen.entity}.`);
    }
    path = path.replace(":id", encodeURIComponent(entityId));
  }

  const applied: string[] = [];
  const partes: string[] = [];
  for (const filtro of screen.filters) {
    const bruto = values[filtro.field];
    if (bruto === undefined || bruto === null || `${bruto}`.trim() === "") continue;
    const valor = normalizeOrbFilterValue(filtro, `${bruto}`);
    if (valor === undefined) continue;
    partes.push(`${encodeURIComponent(filtro.param)}=${encodeURIComponent(valor)}`);
    applied.push(`${filtro.param}: ${labels[filtro.field] ?? valor}`);
  }
  if (partes.length > 0) path = `${path}?${partes.join("&")}`;

  return {
    path,
    screen: screen.id,
    label: entityLabel ? `${screen.label} · ${entityLabel}` : screen.label,
    applied,
  };
}

/** Segmento de rota de detalhe: id de banco, nunca `..` nem caminho inventado. */
const SEGMENTO_DE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * VALIDAÇÃO DO LADO DO CLIENT.
 *
 * Um caminho que chegou pelo stream não entra em `navigate()` sem passar por aqui: o texto veio de
 * um modelo, e o `path` é montado no servidor mas trafega por um canal que a UI não controla. A
 * checagem é a mesma whitelist que montou a URL — tela do catálogo, parâmetro declarado por ela, e
 * valor dentro do conjunto fechado quando existe um.
 */
export function isOrbNavigablePath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\") || path.includes("..")) return false;

  const [semHash] = path.split("#");
  const [pathname, query = ""] = semHash.split("?");
  const screen = matchOrbScreen(pathname);
  if (!screen) return false;

  if (query === "") return true;
  const parametros = new URLSearchParams(query);
  for (const [chave, valor] of parametros.entries()) {
    const filtro = screen.filters.find((f) => f.param === chave);
    if (!filtro) return false;
    if (filtro.values && !filtro.values.includes(valor)) return false;
    if (valor.length > 200) return false;
  }
  return true;
}

/** A tela do catálogo que responde por um pathname, com `:id` casando um segmento de id. */
export function matchOrbScreen(pathname: string): OrbScreen | undefined {
  const alvo = pathname.replace(/\/+$/, "") || "/";
  for (const screen of ORB_SCREENS) {
    if (!screen.path.includes(":id")) {
      if (screen.path === alvo) return screen;
      continue;
    }
    const molde = screen.path.split("/");
    const partes = alvo.split("/");
    if (molde.length !== partes.length) continue;
    const casa = molde.every((parte, indice) =>
      parte === ":id" ? SEGMENTO_DE_ID.test(decodeURIComponent(partes[indice])) : parte === partes[indice]
    );
    if (casa) return screen;
  }
  return undefined;
}

/** Aceita o resultado da tool só quando ele tem a forma completa e um caminho navegável. */
export function isOrbNavigationTarget(valor: unknown): valor is OrbNavigationTarget {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const alvo = valor as Record<string, unknown>;
  if (!isOrbNavigablePath(alvo.path)) return false;
  if (typeof alvo.label !== "string" || typeof alvo.screen !== "string") return false;
  return Array.isArray(alvo.applied) && alvo.applied.every((item) => typeof item === "string");
}
