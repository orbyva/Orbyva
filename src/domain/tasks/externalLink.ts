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
