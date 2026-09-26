/** Cliente Resend mínimo para Edge Functions. */

/**
 * Anexo no formato que a API do Resend espera. `content` é o arquivo em base64 — para `.ics` é o
 * VCALENDAR inteiro (feature 076), que é o que faz o evento entrar no Google/Apple Calendar com um
 * clique.
 */
export type ResendAttachment = {
  filename: string;
  /** Conteúdo em base64. */
  content: string;
  content_type?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  from?: string;
  attachments?: ResendAttachment[];
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
      // Só manda a chave quando há anexo: a API rejeita `attachments: []`.
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text.slice(0, 500) };
  }
  return { ok: true };
}
