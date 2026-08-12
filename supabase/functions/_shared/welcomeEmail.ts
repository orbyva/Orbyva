/** Conteúdo do e-mail de boas-vindas (cron + primeiro acesso). */
import { emailShell } from "./emailHtml.ts";

export const WELCOME_EMAIL_SUBJECT =
  "Bem-vindo ao Orbyva, 7 dias pra organizar o mês";

export function welcomeEmailHtml(
  siteUrl: string,
  firstName: string | undefined
): string {
  const greet = firstName ? `Oi, ${firstName}` : "Oi";
  return emailShell({
    eyebrow: "Orbyva · Boas-vindas",
    title: `${greet}, sua órbita começou`,
    bodyHtml: `<p style="margin:0;">Você tem 7 dias com tudo liberado. O caminho mais curto:</p>
          <ol style="margin:12px 0 0;padding-left:18px;color:#d4d4d8;">
            <li>Lance a primeira despesa</li>
            <li>Defina o teto do orçamento</li>
            <li>Olhe as parcelas do mês</li>
          </ol>`,
    ctaLabel: "Abrir o hub",
    ctaUrl: `${siteUrl}/home`,
  });
}
