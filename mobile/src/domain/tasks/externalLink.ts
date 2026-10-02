export interface GitHubLinkInfo {
  owner: string;
  repo: string;
  number: number;
  kind: "issues" | "pull";
}

const GITHUB_ISSUE_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/(issues|pull)\/(\d+)(?:[/?#].*)?$/i;

export function detectGitHubLink(url: string): GitHubLinkInfo | null {
  const match = url.trim().match(GITHUB_ISSUE_RE);
  if (!match) return null;
  const [, owner, repo, kind, number] = match;
  return { owner, repo, number: Number(number), kind: kind as "issues" | "pull" };
}

export interface ExternalLinkAppearance {
  iconKey: "github" | "external";
  label: string;
}

export const EXTERNAL_LINK_LABEL_MAX = 60;

/** Aparência de um link sem regra do usuário: GitHub issue/PR ou o host. */
export function describeExternalLink(url: string): ExternalLinkAppearance {
  const trimmed = url.trim();
  const github = detectGitHubLink(trimmed);
  if (github) {
    return {
      iconKey: "github",
      label: truncateExternalLinkLabel(
        `${github.owner}/${github.repo}#${github.number}`
      ),
    };
  }
  return {
    iconKey: "external",
    label: truncateExternalLinkLabel(externalLinkHostLabel(trimmed)),
  };
}

export function externalLinkHostLabel(url: string): string {
  if (!url) return "";
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\./i, "") || url;
  } catch {
    return url;
  }
}

export function truncateExternalLinkLabel(label: string): string {
  return label.length > EXTERNAL_LINK_LABEL_MAX
    ? `${label.slice(0, EXTERNAL_LINK_LABEL_MAX)}…`
    : label;
}
