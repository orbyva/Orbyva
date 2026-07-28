/** Auth cron Bearer / x-cron-secret. */
export function assertCronAuth(req: Request): boolean {
  const secret = (Deno.env.get("CRON_SECRET") ?? "").trim();
  if (!secret) return false;
  const auth = req.headers.get("Authorization") ?? "";
  const header = req.headers.get("x-cron-secret") ?? "";
  return auth === `Bearer ${secret}` || header === secret;
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function unauthorizedResponse() {
  return jsonResponse({ error: "Unauthorized" }, 401);
}
