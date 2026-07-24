/** CORS restrito ao origin de SITE_URL (checkout/portal). */

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

export function corsHeadersForRequest(req: Request): Record<string, string> {
  const allowed = siteOriginFromEnv();
  const origin = req.headers.get("Origin");
  const allowOrigin =
    allowed && origin && origin === allowed ? origin : allowed ?? "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
