/**
 * Link único e opcional de uma recorrência — "onde se paga isso". Espelho de
 * `src/domain/recurring/links.ts` do web: mesma regra, mesma frase de erro.
 */

export const RECURRING_LINK_HINT = "Comece com https://";

/** `trim`, e `null` quando não sobrou nada — "apagou o link" chega ao banco como `null`. */
export function normalizeRecurringLink(
  raw: string | null | undefined
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Texto curto da lista: o domínio sem `www.`; se a URL não parsear, ela mesma sem protocolo. */
export function linkLabel(url: string): string {
  const trimmed = url.trim();
  const match = /^https?:\/\/([^/?#]+)/i.exec(trimmed);
  const host = match?.[1] ?? trimmed.replace(/^[a-z]+:\/\//i, "");
  return host.replace(/^www\./i, "");
}

/** `true` só para `http://` e `https://`; o app não corrige a URL do usuário. */
export function isHttpLink(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  return value.startsWith("http://") || value.startsWith("https://");
}
