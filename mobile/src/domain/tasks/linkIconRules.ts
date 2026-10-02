import {
  describeExternalLink,
  externalLinkHostLabel,
  truncateExternalLinkLabel,
} from "./externalLink";

/** Teto da `pattern`: limita o custo de uma regex patológica (ReDoS). */
export const LINK_ICON_PATTERN_MAX = 200;

export interface LinkIconRuleShape {
  pattern: string;
  label_template?: string | null;
  icon_key?: string | null;
  icon_url?: string | null;
  position: number;
  enabled: boolean;
}

/** Compila com `i` e nunca com `g` (um `lastIndex` guardado faria o casamento falhar intermitente). */
export function compileLinkIconRule(
  rule: Pick<LinkIconRuleShape, "pattern">
): RegExp | null {
  const pattern = rule.pattern ?? "";
  if (!pattern.trim() || pattern.length > LINK_ICON_PATTERN_MAX) return null;
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

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

const TEMPLATE_TOKEN_RE = /\$\$|\$([1-9])/g;

/** `$1`…`$9` viram os grupos capturados, `$$` um `$` literal; vazio cai no host da URL. */
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

export interface LinkIconRuleMatch<R extends LinkIconRuleShape = LinkIconRuleShape> {
  rule: R;
  label: string;
}

/** A primeira regra ligada e válida que casa, em `position` crescente. */
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

export interface LinkAppearance {
  iconKey: string | null;
  iconUrl: string | null;
  label: string;
}

export function resolveLinkAppearance(
  url: string,
  rules: readonly LinkIconRuleShape[]
): LinkAppearance {
  const matched = matchLinkIconRule(url, rules);
  if (matched) {
    const iconUrl = matched.rule.icon_url ?? null;
    return {
      iconKey: iconUrl ? null : (matched.rule.icon_key ?? null),
      iconUrl,
      label: matched.label,
    };
  }
  const fallback = describeExternalLink(url);
  return { iconKey: fallback.iconKey, iconUrl: null, label: fallback.label };
}

/** Ícones oferecidos no formulário de regra (presets que `TaskIconBadge` desenha). */
export const LINK_ICON_PRESETS: { key: string; label: string }[] = [
  { key: "external", label: "Link" },
  { key: "github", label: "GitHub" },
  { key: "gitlab", label: "GitLab" },
  { key: "kanban", label: "Kanban" },
  { key: "figma", label: "Figma" },
  { key: "notebook", label: "Notion" },
  { key: "youtube", label: "YouTube" },
  { key: "file-text", label: "Documento" },
  { key: "globe", label: "Site" },
  { key: "bookmark", label: "Favorito" },
];

export interface LinkIconRuleSeed {
  name: string;
  pattern: string;
  label_template: string | null;
  icon_key: string;
}

/** Oferecidas por botão (não migration): nascem como regras normais, editáveis e apagáveis. */
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

/** Move a regra uma casa (↑ = -1, ↓ = +1) e devolve os ids na nova ordem; `null` na borda. */
export function moveRuleId(
  ids: readonly string[],
  id: string,
  delta: -1 | 1
): string[] | null {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
