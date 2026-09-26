/** Flag injetada pelo script de prerender (Playwright). */
export function isPrerenderMode(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { __ORBYVA_PRERENDER__?: boolean };
  if (w.__ORBYVA_PRERENDER__) return true;
  try {
    return new URLSearchParams(window.location.search).has("prerender");
  } catch {
    return false;
  }
}
