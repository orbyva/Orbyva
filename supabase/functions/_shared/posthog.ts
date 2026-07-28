/** Capture opcional (falha silenciosa). */
export async function trackPostHog(
  event: string,
  distinctId: string,
  props?: Record<string, string | number | boolean | null>,
  lib = "orbyva-edge"
) {
  const apiKey = (Deno.env.get("POSTHOG_API_KEY") ?? "").trim();
  if (!apiKey) return;
  const host = (
    Deno.env.get("POSTHOG_HOST") ?? "https://us.i.posthog.com"
  ).replace(/\/$/, "");
  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        properties: { ...props, $lib: lib },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    /* ignore */
  }
}
