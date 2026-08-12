/** Detecta link real do Google Maps / Places. */
export function isGoogleMapsUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    if (
      host === "maps.google.com" ||
      host.endsWith(".maps.google.com") ||
      host === "maps.app.goo.gl" ||
      host === "goo.gl" ||
      host === "g.page"
    ) {
      return true;
    }
    if (host === "www.google.com" || host === "google.com") {
      return parsed.pathname.toLowerCase().includes("/maps");
    }
    return false;
  } catch {
    return /(?:maps\.google|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url);
  }
}
