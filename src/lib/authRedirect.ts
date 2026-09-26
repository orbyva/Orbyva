/** Destinos internos permitidos após login (evita open redirect). */
const ALLOWED = new Set(["/home", "/ext"]);

export function safePostAuthPath(raw: string | null | undefined): string {
  if (!raw) return "/home";
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return "/home";
  }
  const path = value.split("?")[0]?.split("#")[0] ?? "";
  if (ALLOWED.has(path)) return path;
  return "/home";
}

export function postAuthRedirectUrl(
  origin: string,
  next: string | null | undefined
): string {
  return `${origin}${safePostAuthPath(next)}`;
}
