import type { ContentLinkType } from "@/types/contentLinks";

/** Acrescenta `https://` quando a URL não tem esquema — cobre o caso comum de colar sem `http(s)://`. */
export function normalizeContentLinkUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** `true` só quando a URL normalizada tem um host com pelo menos um ponto (ex.: `youtube.com`). */
export function isValidContentLinkUrl(url: string): boolean {
  try {
    const { hostname } = new URL(normalizeContentLinkUrl(url));
    return hostname.includes(".");
  } catch {
    return false;
  }
}

/** Domínio pra exibir como "fonte" do link (ex.: `youtube.com`), sem o prefixo `www.`. `null` se a URL for inválida (mesmo critério de `isValidContentLinkUrl`). */
export function extractContentLinkDomain(url: string): string | null {
  if (!isValidContentLinkUrl(url)) return null;
  const { hostname } = new URL(normalizeContentLinkUrl(url));
  return hostname.replace(/^www\./i, "");
}

const VIDEO_DOMAINS = new Set(["youtube.com", "youtu.be", "vimeo.com"]);

/**
 * Sugere o `type` a partir do domínio da URL — só reconhece domínios de vídeo conhecidos
 * (youtube/vimeo); pra qualquer outro domínio a escolha entre artigo/site fica manual (o usuário
 * decide, não dá pra inferir isso com segurança só pela URL). `null` = sem sugestão, mantém o
 * valor atual do formulário.
 */
export function suggestContentLinkType(url: string): ContentLinkType | null {
  const domain = extractContentLinkDomain(url);
  if (!domain) return null;
  return VIDEO_DOMAINS.has(domain) ? "video" : null;
}
