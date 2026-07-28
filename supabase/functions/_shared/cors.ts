/** CORS: SITE_URL em produção + localhost em desenvolvimento. */

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

function isLocalDevOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      (u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.hostname === "[::1]")
    );
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
