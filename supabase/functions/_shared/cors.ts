/** CORS: SITE_URL em produção + localhost/ngrok/LAN em desenvolvimento + cliente nativo. */

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

function isPrivateLanHost(hostname: string): boolean {
  return (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]") {
      return true;
    }
    if (isPrivateLanHost(u.hostname)) return true;
    return NGROK_HOST_SUFFIXES.some((suffix) => u.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

/** Expo / React Native: sem Origin de browser, ou scheme do app, ou header do cliente. */
export function isNativeMobileRequest(req: Request): boolean {
  if (req.headers.get("x-orbyva-client") === "mobile") return true;
  const origin = req.headers.get("Origin");
  if (!origin || origin === "null") return true;
  try {
    const protocol = new URL(origin).protocol;
    return protocol === "orbyva:" || protocol === "exp:" || protocol === "exps:";
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
    // Vite / Expo Metro local chamando functions remotas.
    allowOrigin = origin;
  } else if (isNativeMobileRequest(req)) {
    // Native não aplica CORS; nunca refletir Origin arbitrário.
    allowOrigin = siteOrigin ?? "null";
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-orbyva-client",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
