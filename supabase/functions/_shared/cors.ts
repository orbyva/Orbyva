/** CORS: SITE_URL em produção + localhost/ngrok em desenvolvimento. */

export function siteOriginFromEnv(): string | null {
  const siteRaw = (Deno.env.get("SITE_URL") ?? "").trim().replace(/\/$/, "");
  if (!siteRaw) return null;
  try {
    const site = new URL(siteRaw);
    if (site.protocol !== "http:" && site.protocol !== "https:") return null;
    return site.origin;
  } catch {
    return null;
  }
}

/** Domínios de túnel ngrok (free tier sorteia um subdomínio novo a cada `ngrok http`, então
 * checa o sufixo em vez de fixar um host específico). */
const NGROK_HOST_SUFFIXES = [".ngrok-free.dev", ".ngrok-free.app", ".ngrok.app", ".ngrok.io"];

function isLocalDevOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]") {
      return true;
    }
    return NGROK_HOST_SUFFIXES.some((suffix) => u.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

export function corsHeadersForRequest(req: Request): Record<string, string> {
  const siteOrigin = siteOriginFromEnv();
  const origin = req.headers.get("Origin");

  let allowOrigin = siteOrigin ?? "null";
  if (origin && siteOrigin && origin === siteOrigin) {
    allowOrigin = origin;
  } else if (origin && isLocalDevOrigin(origin)) {
    // Vite / preview local chamando functions remotas.
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
