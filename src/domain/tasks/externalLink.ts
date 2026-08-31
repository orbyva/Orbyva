import type { TaskExternalLinkDraft } from "@/types/tasks";

export interface GitHubLinkInfo {
  owner: string;
  repo: string;
  number: number;
  kind: "issues" | "pull";
}

const GITHUB_ISSUE_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/(issues|pull)\/(\d+)(?:[/?#].*)?$/i;

/**
 * Detecta se uma URL é uma issue/PR do GitHub, extraindo owner/repo/número — só regex sobre a
 * própria URL, sem chamada de rede nem token (decisão do usuário: sem depender de credencial).
 * `null` se não bater com o formato esperado.
 */
export function detectGitHubLink(url: string): GitHubLinkInfo | null {
  const match = url.trim().match(GITHUB_ISSUE_RE);
  if (!match) return null;
  const [, owner, repo, kind, number] = match;
  return { owner, repo, number: Number(number), kind: kind as "issues" | "pull" };
}

/** Provider detectado pra um link externo qualquer — hoje só reconhece GitHub. */
export function detectExternalProvider(url: string): string | null {
  return detectGitHubLink(url) ? "github" : null;
}

/** O que a UI precisa saber pra desenhar um link externo: qual ícone e qual texto. Vem de
 * `describeExternalLink`. */
export interface ExternalLinkAppearance {
  /** Chave do ícone, resolvida pra um componente na camada de UI — `"github"` ou o genérico
   * `"external"`. String (e não o componente) pra manter `src/domain` livre de React. */
  iconKey: "github" | "external";
  /** Texto do chip: `owner/repo#N` no GitHub, o host nos demais. */
  label: string;
}

/** Acima disto o rótulo do chip é cortado com `…`. Um chip de card divide a linha com prazo, tags e
 * status; um rótulo maior que isso empurraria todo o resto pra linha de baixo. */
export const EXTERNAL_LINK_LABEL_MAX = 60;

/**
 * Aparência de um link externo a partir **só da URL** — sem rede, sem token (a decisão da 013
 * segue valendo). GitHub continua saindo como `owner/repo#N`; qualquer outra URL cai no host
 * (`docs.google.com`), sem o `www.`; o que não parseia como URL vira a própria string.
 *
 * **Este é o ramo "nenhuma regra casa" da feature 087.** Quando a tela de regras existir,
 * `resolveLinkAppearance(url, rules)` procura a primeira regra que casa e, não achando, chama esta
 * função — em vez de reimplementar corte de host e rótulo numa segunda versão que envelhece
 * diferente. Por isso o corte (`EXTERNAL_LINK_LABEL_MAX`) mora aqui e é exportado.
 */
export function describeExternalLink(url: string): ExternalLinkAppearance {
  const trimmed = url.trim();

  const github = detectGitHubLink(trimmed);
  if (github) {
    return {
      iconKey: "github",
      label: truncateExternalLinkLabel(`${github.owner}/${github.repo}#${github.number}`),
    };
  }

  return {
    iconKey: "external",
    label: truncateExternalLinkLabel(externalLinkHostLabel(trimmed)),
  };
}

/**
 * O rótulo cru de uma URL sem regra nenhuma: o **host** sem `www.` (`docs.google.com`), ou a
 * própria string quando ela nem parseia como URL.
 *
 * Exportado porque a feature 087 usa exatamente este texto em dois lugares — o ramo "nenhuma regra
 * casa" (via `describeExternalLink`) e o `label_template` que resultou vazio, que cai no host em
 * vez de virar um chip sem texto. Uma segunda versão disto divergiria na primeira mudança de
 * tratamento de `www.`.
 */
export function externalLinkHostLabel(url: string): string {
  if (!url) return "";
  try {
    // `URL` sem protocolo lança — e é o que queremos: cai no fallback da string crua, que é o que o
    // usuário digitou e ainda não terminou de colar.
    const host = new URL(url).hostname;
    return host.replace(/^www\./i, "") || url;
  } catch {
    return url;
  }
}

/** Corta o rótulo em `EXTERNAL_LINK_LABEL_MAX` com `…`. Exportado pelo mesmo motivo que
 * `externalLinkHostLabel`: o rótulo gerado por regra da 087 vive no mesmo chip e é cortado pela
 * mesma régua. */
export function truncateExternalLinkLabel(label: string): string {
  return label.length > EXTERNAL_LINK_LABEL_MAX
    ? `${label.slice(0, EXTERNAL_LINK_LABEL_MAX)}…`
    : label;
}

/** O que `normalizeExternalLinkDrafts` devolve: a lista pronta pra gravar e o que a UI precisa
 * avisar antes de gravar. */
export interface NormalizedExternalLinkDrafts {
  drafts: TaskExternalLinkDraft[];
  /** URLs que apareceram mais de uma vez (já aparadas, uma entrada por URL repetida). A UI acusa
   * antes de o `unique (task_id, url)` do banco estourar em erro genérico. */
  duplicates: string[];
}

/**
 * Deixa a lista de rascunhos do formulário pronta pra gravar (feature 085):
 *
 * - linha com URL vazia sai, **levando o comentário junto** — comentário é atributo do link, então
 *   uma linha só com comentário é engano, não pedido (decisão da feature);
 * - espaços aparados na URL e no comentário; comentário que sobra vazio vira `null`;
 * - `position` recalculada em sequência (0..n-1), então remover uma linha do meio não deixa buraco;
 * - URL repetida é mantida **uma vez** (a primeira ocorrência) e reportada em `duplicates`.
 *
 * Função pura: quem grava é `saveExternalLinksForTask`, quem avisa é a UI.
 */
export function normalizeExternalLinkDrafts(
  drafts: readonly TaskExternalLinkDraft[]
): NormalizedExternalLinkDrafts {
  const kept: TaskExternalLinkDraft[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const draft of drafts) {
    const url = draft.url.trim();
    if (!url) continue;

    if (seen.has(url)) {
      if (!duplicates.includes(url)) duplicates.push(url);
      continue;
    }
    seen.add(url);

    const comment = draft.comment?.trim();
    kept.push({
      ...(draft.id ? { id: draft.id } : {}),
      url,
      comment: comment ? comment : null,
      position: kept.length,
    });
  }

  return { drafts: kept, duplicates };
}
