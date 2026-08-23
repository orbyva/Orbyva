/** Para onde ir depois de entrar, quando o `?next=` não diz nada utilizável. */
export const DEFAULT_POST_LOGIN_PATH = "/home";

/**
 * Destino pós-login vindo de `?next=` (feature 076: quem clica no link de um convite sem estar
 * logado precisa voltar para o convite, não cair no dashboard e perder o link).
 *
 * É um vetor clássico de **open redirect**, então a validação é por lista de permissão de forma:
 * só caminho absoluto do próprio app. Qualquer coisa que possa virar outra origem — `//evil.com`,
 * `https://evil.com`, `/\evil.com`, `javascript:` — cai no default.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_POST_LOGIN_PATH;
  const value = raw.trim();
  if (!value.startsWith("/")) return DEFAULT_POST_LOGIN_PATH;
  // `//host` e `/\host` são interpretados como URL protocol-relative pelo navegador.
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  if (value.includes("://")) return DEFAULT_POST_LOGIN_PATH;
  // Caracteres de controle (incluindo \n) dão para forjar cabeçalho/URL em alguns contextos.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_POST_LOGIN_PATH;
  return value;
}
