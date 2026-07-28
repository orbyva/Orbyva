/**
 * Supabase Auth Hook — Send Email.
 * Confirmação, magic link, reset de senha e change email via Resend.
 *
 * Dashboard → Authentication → Hooks → Send Email → URL desta function.
 * Secrets: RESEND_API_KEY, RESEND_FROM, SITE_URL, SEND_EMAIL_HOOK_SECRET
 */
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { sendResendEmail } from "../_shared/resend.ts";
import { emailShell, firstNameFromEmail } from "../_shared/emailHtml.ts";
import { siteOriginFromEnv } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/cronAuth.ts";

type EmailAction = string;

type HookPayload = {
  user: {
    id?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: EmailAction;
    site_url: string;
  };
};

function verifyType(action: EmailAction): string {
  if (action === "recovery") return "recovery";
  if (action === "magiclink" || action === "email") return "magiclink";
  if (action === "email_change") return "email_change";
  if (action === "invite") return "invite";
  return "signup";
}

function buildVerifyUrl(
  tokenHash: string,
  type: string,
  redirectTo: string
): string {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const verify = new URL(`${base}/auth/v1/verify`);
  verify.searchParams.set("token", tokenHash);
  verify.searchParams.set("type", type);
  verify.searchParams.set("redirect_to", redirectTo);
  return verify.toString();
}

function copyFor(action: EmailAction, firstName?: string) {
  const greet = firstName ? `Oi, ${firstName}` : "Oi";
  switch (action) {
    case "signup":
      return {
        subject: "Confirme seu e-mail no Orbyva",
        eyebrow: "Orbyva · Confirmação",
        title: `${greet} — confirme para começar`,
        body: "Falta um clique para liberar seus 7 dias de teste com orçamento, parcelas e o life OS.",
        cta: "Confirmar e-mail",
      };
    case "magiclink":
    case "email":
      return {
        subject: "Seu link para entrar no Orbyva",
        eyebrow: "Orbyva · Login",
        title: `${greet} — link mágico`,
        body: "Use o botão abaixo para entrar sem senha. O link expira em breve.",
        cta: "Entrar no Orbyva",
      };
    case "recovery":
      return {
        subject: "Redefinir senha do Orbyva",
        eyebrow: "Orbyva · Senha",
        title: `${greet} — redefinir senha`,
        body: "Recebemos um pedido para trocar sua senha. Se não foi você, ignore este e-mail.",
        cta: "Escolher nova senha",
      };
    case "email_change":
      return {
        subject: "Confirme o novo e-mail no Orbyva",
        eyebrow: "Orbyva · E-mail",
        title: `${greet} — confirme o novo e-mail`,
        body: "Confirme para passar a usar este endereço na sua conta Orbyva.",
        cta: "Confirmar novo e-mail",
      };
    case "invite":
      return {
        subject: "Você foi convidado para o Orbyva",
        eyebrow: "Orbyva · Convite",
        title: `${greet} — bem-vindo`,
        body: "Aceite o convite para criar sua conta e entrar no life OS.",
        cta: "Aceitar convite",
      };
    default:
      return {
        subject: "Orbyva — ação necessária",
        eyebrow: "Orbyva",
        title: greet,
        body: "Abra o link para continuar.",
        cta: "Continuar",
      };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").trim();
  if (!rawSecret) {
    return jsonResponse({ error: "SEND_EMAIL_HOOK_SECRET ausente" }, 500);
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  try {
    // Dashboard costuma entregar "v1,whsec_..."
    const secret = rawSecret.includes("whsec_")
      ? rawSecret.slice(rawSecret.indexOf("whsec_"))
      : rawSecret;
    const wh = new Webhook(secret);
    wh.verify(payload, headers);
  } catch (err) {
    console.error("auth-send-email verify failed", err);
    return jsonResponse({ error: "Invalid signature" }, 401);
  }

  let body: HookPayload;
  try {
    body = JSON.parse(payload) as HookPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const to = body.user?.email?.trim();
  if (!to) return jsonResponse({ error: "Missing user email" }, 400);

  const action = body.email_data.email_action_type;
  const siteUrl = siteOriginFromEnv();
  const redirectTo =
    body.email_data.redirect_to ||
    (action === "recovery" ? `${siteUrl}/login?mode=recovery` : `${siteUrl}/home`);
  const type = verifyType(action);
  const confirmUrl = buildVerifyUrl(
    body.email_data.token_hash,
    type,
    redirectTo
  );

  const first =
    (typeof body.user.user_metadata?.full_name === "string"
      ? String(body.user.user_metadata.full_name).split(" ")[0]
      : undefined) || firstNameFromEmail(to);
  const copy = copyFor(action, first);

  const html = emailShell({
    eyebrow: copy.eyebrow,
    title: copy.title,
    bodyHtml: `<p style="margin:0;">${copy.body}</p>
      <p style="margin:12px 0 0;color:#71717a;font-size:13px;">Ou use o código: <strong style="color:#e4e4e7;letter-spacing:0.08em;">${body.email_data.token}</strong></p>`,
    ctaLabel: copy.cta,
    ctaUrl: confirmUrl,
    footer:
      "Este link é pessoal e expira. Se você não pediu, ignore com segurança.",
  });

  const sent = await sendResendEmail({
    to,
    subject: copy.subject,
    html,
  });

  if (!sent.ok) {
    console.error("auth-send-email resend", sent.error);
    return jsonResponse({ error: sent.error ?? "send failed" }, 500);
  }

  return jsonResponse({});
});
