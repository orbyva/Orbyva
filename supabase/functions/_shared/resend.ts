/** Cliente Resend mínimo para Edge Functions. */

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  from?: string;
};

export async function sendResendEmail(
  input: SendEmailInput
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY ausente" };

  const from =
    input.from?.trim() ||
    (Deno.env.get("RESEND_FROM") ?? "").trim() ||
    "Orbyva <noreply@orbyva.app>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text.slice(0, 500) };
  }
  return { ok: true };
}
