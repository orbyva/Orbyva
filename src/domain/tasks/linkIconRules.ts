/**
 * Regras de aparência de link externo (feature 087) — a parte pura: **casar uma URL contra as
 * regras do usuário** e decidir ícone e rótulo. Sem React e sem I/O, de propósito: é o que permite
 * testar "qual regra vence" e "que texto sai" sem montar tela nem banco.
 *
 * Até aqui, reconhecer um link era **código**: `detectGitHubLink` tinha a regex de issue/PR do
 * GitHub embutida e o chip escolhia entre dois ícones num `if`. Aqui a regra vira **dado** do
 * usuário (`public.link_icon_rule`), e este arquivo é o único lugar em que a semântica dela vive.
 */

import {
  describeExternalLink,
  externalLinkHostLabel,
  truncateExternalLinkLabel,
} from "./externalLink";

/**
 * Teto de caracteres da `pattern`. É a metade barata da defesa contra ReDoS: o casamento roda
 * sempre contra uma URL (string curta), o que já limita muito o estrago de um backtracking
 * patológico, e um limite de tamanho corta o resto sem custar nada ao uso legítimo — as regras
 * semente mais longas não chegam perto disto.
 */
export const LINK_ICON_PATTERN_MAX = 200;

/**
 * O que uma regra precisa ter para ser **avaliada**. `LinkIconRule` (a linha do banco, em
 * `src/types/tasks.ts`) satisfaz esta forma e acrescenta `id`/`user_id`/`name`/`created_at`, que
 * o casamento não usa — daí a forma mínima aqui, que também é o que os testes montam à mão.
 */
export interface LinkIconRuleShape {
  /** A regex, como o usuário digitou. Compilada sempre com `i` e nunca com `g`. */
  pattern: string;
  /** O "texto que deriva do link": texto livre com `$1`…`$9` referindo os grupos capturados. */
  label_template?: string | null;
  /** Preset de `TASK_ICON_PRESETS` — mutuamente exclusivo com `icon_url`, como em `task`. */
  icon_key?: string | null;
  /** Ícone da biblioteca do usuário (feature 086). Tem prioridade sobre `icon_key`. */
  icon_url?: string | null;
  /** Ordem de avaliação (crescente). A **primeira** regra que casa vence. */
  position: number;
  /** Regra desligada continua na lista e é pulada — o "desligar sem perder". */
  enabled: boolean;
}

/**
 * Compila a `pattern` da regra, ou devolve `null` quando ela não serve.
 *
 * Devolver `null` em vez de lançar é o que permite ao chamador **pular** a regra ruim em tempo de
 * execução: o dado pode ter sido gravado antes de uma validação mudar, e uma regex inválida no
 * banco não pode derrubar a lista de tarefas inteira.
 *
 * As flags não são configuráveis. `i` porque host e caminho de URL aparecem em qualquer caixa
 * (`GitHub.com`); **sem `g`** porque uma regex global guardada em variável carrega `lastIndex` de
 * uma chamada para a outra e passa a falhar de forma intermitente — o clássico.
 */
export function compileLinkIconRule(rule: Pick<LinkIconRuleShape, "pattern">): RegExp | null {
  const pattern = rule.pattern ?? "";
  if (!pattern.trim() || pattern.length > LINK_ICON_PATTERN_MAX) return null;
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

/**
 * A mesma checagem de `compileLinkIconRule`, mas contando **por que** falhou — é o que o formulário
 * mostra no campo. `null` quando a `pattern` serve.
 *
 * Existe separada porque os dois chamadores querem coisas diferentes do mesmo `try/catch`: quem
 * renderiza a lista quer seguir em frente sem a regra, quem está salvando quer a mensagem do
 * `RegExp` (`Invalid regular expression: ...`) para poder corrigir.
 */
export function validateLinkIconPattern(pattern: string): string | null {
  if (!pattern.trim()) return "Informe a expressão regular.";
  if (pattern.length > LINK_ICON_PATTERN_MAX) {
    return `A expressão deve ter no máximo ${LINK_ICON_PATTERN_MAX} caracteres.`;
  }
  try {
    new RegExp(pattern, "i");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Expressão regular inválida.";
  }
}

/**
 * `$$` (um `$` literal) **ou** `$1`…`$9` (um grupo capturado). A alternância nesta ordem é o que
 * faz `$$1` sair como o texto `$1`: o `$$` casa primeiro, e o `1` que sobra é literal.
 */
const TEMPLATE_TOKEN_RE = /\$\$|\$([1-9])/g;

/**
 * O "texto que deriva do link" da regra: aplica `label_template` sobre os grupos capturados.
 *
 * Ex.: `$1/$2#$3` com a pattern de issue do GitHub produz `owner/repo#123` — exatamente o que o
 * chip mostrava quando isso era código, agora como dado.
 *
 * As bordas, todas decididas na feature:
 * - grupo referenciado que não existe (ou não capturou) vira **string vazia**, não `undefined`
 *   nem o literal `$7`;
 * - `$$` escapa um `$` literal;
 * - template vazio — ou que resultou em vazio/só espaços — cai no **host** da URL
 *   (`externalLinkHostLabel`), nunca num chip sem texto;
 * - o resultado é cortado em `EXTERNAL_LINK_LABEL_MAX` com `…`, a mesma régua do chip sem regra.
 */
export function applyLabelTemplate(
  template: string | null | undefined,
  match: RegExpMatchArray,
  url: string
): string {
  const rendered = (template ?? "")
    .replace(TEMPLATE_TOKEN_RE, (_token, group?: string) =>
      group ? (match[Number(group)] ?? "") : "$"
    )
    .trim();

  return truncateExternalLinkLabel(rendered || externalLinkHostLabel(url.trim()));
}

/** O que `matchLinkIconRule` devolve: a regra vencedora e o rótulo que ela produziu. O rótulo vem
 * junto porque calculá-lo exige o `match`, que morre dentro da função. */
export interface LinkIconRuleMatch<R extends LinkIconRuleShape = LinkIconRuleShape> {
  rule: R;
  label: string;
}

/**
 * A **primeira** regra que casa a URL, em ordem de `position` crescente — ou `null`.
 *
 * "Primeira que casa vence" não é um detalhe de implementação, é o mecanismo: as regras seguintes
 * nem chegam a ser testadas, e é assim que "GitHub issue" (específica) fica acima de "GitHub"
 * (genérica). Duas regras casando a mesma URL não é erro nem aviso — é o uso pretendido, e a ordem
 * é decidida num lugar só, a tela de configuração.
 *
 * Regra pulada (nunca lançando):
 * - `enabled: false` — o "desligar sem perder", que evita apagar uma regra só para testar outra;
 * - `pattern` que não compila — o dado pode ter sido gravado antes de uma validação mudar, e uma
 *   regex inválida no banco não pode derrubar a lista de tarefas inteira.
 *
 * Não ordena no lugar: `rules` costuma ser o array do cache do hook, compartilhado por toda a
 * página.
 */
export function matchLinkIconRule<R extends LinkIconRuleShape>(
  url: string,
  rules: readonly R[]
): LinkIconRuleMatch<R> | null {
  const target = url.trim();
  if (!target) return null;

  const ordered = [...rules].sort((a, b) => a.position - b.position);
  for (const rule of ordered) {
    if (!rule.enabled) continue;
    const re = compileLinkIconRule(rule);
    if (!re) continue;
    const match = target.match(re);
    if (!match) continue;
    return { rule, label: applyLabelTemplate(rule.label_template, match, target) };
  }
  return null;
}

/** Ícone e texto de um link externo, já resolvidos: é o que o chip (e a prévia do formulário)
 * desenham. `iconUrl` tem prioridade sobre `iconKey`, a mesma regra de `TaskIconBadge`. */
export interface LinkAppearance {
  /** Preset de `TASK_ICON_PRESETS` — incluindo `"github"`/`"external"`, que são o que o fallback
   * sem regra devolve. String (e não componente) para manter `src/domain` livre de React. */
  iconKey: string | null;
  /** Ícone da biblioteca do usuário (feature 086). */
  iconUrl: string | null;
  label: string;
}

/**
 * Como um link externo aparece: a primeira regra que casa, ou o comportamento sem configuração
 * nenhuma.
 *
 * O ramo "nenhuma regra casa" **delega a `describeExternalLink`** (feature 085) em vez de
 * reimplementar host e corte: é a mesma função que alimenta a prévia por link do formulário, e
 * duas versões dela divergiriam na primeira mudança de tratamento de `www.` ou de tamanho máximo.
 *
 * Sempre devolve algo — lista de regras vazia (inclusive por falha de carregamento) só significa
 * que todo link cai no fallback: a aparência piora, a tela não quebra.
 */
export function resolveLinkAppearance(
  url: string,
  rules: readonly LinkIconRuleShape[]
): LinkAppearance {
  const matched = matchLinkIconRule(url, rules);
  if (matched) {
    const iconUrl = matched.rule.icon_url ?? null;
    return {
      // Mutuamente exclusivos, como em `task`: com um ícone da biblioteca escolhido, o preset que
      // por acaso tenha sobrado na linha não concorre.
      iconKey: iconUrl ? null : (matched.rule.icon_key ?? null),
      iconUrl,
      label: matched.label,
    };
  }

  const fallback = describeExternalLink(url);
  return { iconKey: fallback.iconKey, iconUrl: null, label: fallback.label };
}

/** Uma regra semente: o mesmo conteúdo que o usuário digitaria no diálogo. `position` é o índice na
 * lista, e a ordem **é** a semântica (a específica antes da genérica). */
export interface LinkIconRuleSeed {
  name: string;
  pattern: string;
  label_template: string | null;
  /** Sempre um preset (`LINK_ICON_PRESETS`): a semente não pode depender de a biblioteca do
   * usuário ter algum ícone dentro. */
  icon_key: string;
}

/**
 * As regras oferecidas pelo botão "Criar regras padrão" da tela vazia.
 *
 * **Não são migration.** Inseridas por botão, elas nascem como regras normais — editáveis,
 * reordenáveis e apagáveis. Gravadas por migration, seriam uma preferência decidida pelo app, e um
 * `delete` do usuário voltaria no push seguinte.
 *
 * A ordem importa e é a própria demonstração do mecanismo: "GitHub issue/PR" vem **antes** de
 * "GitHub repositório" porque a primeira que casa vence — invertê-las faria toda issue virar
 * `owner/repo`.
 */
export const DEFAULT_LINK_ICON_RULES: LinkIconRuleSeed[] = [
  {
    name: "GitHub issue/PR",
    pattern: "^https?://(?:www\\.)?github\\.com/([^/]+)/([^/]+)/(?:issues|pull)/(\\d+)",
    label_template: "$1/$2#$3",
    icon_key: "github",
  },
  {
    name: "GitHub repositório",
    pattern: "^https?://(?:www\\.)?github\\.com/([^/]+)/([^/?#]+)",
    label_template: "$1/$2",
    icon_key: "github",
  },
  {
    name: "GitLab",
    pattern: "^https?://(?:www\\.)?gitlab\\.com/([^/]+)/([^/?#]+)",
    label_template: "$1/$2",
    icon_key: "gitlab",
  },
  {
    name: "Jira",
    pattern: "atlassian\\.net/browse/([A-Z][A-Z0-9]*-\\d+)",
    label_template: "$1",
    icon_key: "kanban",
  },
  {
    name: "Figma",
    pattern: "^https?://(?:www\\.)?figma\\.com/(?:file|design|board)/[^/]+/([^/?#]+)",
    label_template: "$1",
    icon_key: "figma",
  },
  {
    name: "Notion",
    pattern: "^https?://(?:www\\.)?notion\\.(?:so|site)/",
    label_template: "Notion",
    icon_key: "notebook",
  },
  {
    name: "YouTube",
    pattern: "^https?://(?:www\\.)?(?:youtube\\.com|youtu\\.be)/",
    label_template: "YouTube",
    icon_key: "youtube",
  },
  {
    name: "Google Docs",
    pattern: "^https?://docs\\.google\\.com/",
    label_template: "Google Docs",
    icon_key: "file-text",
  },
];
