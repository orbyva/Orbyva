/** Dispara welcome no primeiro acesso (best-effort). */

import { supabase } from "@/lib/supabase";

const SESSION_KEY_PREFIX = "orbyva_welcome_req_v1:";
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export type WelcomeEmailProfileHint = {
  id: string;
  created_at?: string | null;
  welcome_email_sent_at?: string | null;
  email_unsubscribed_at?: string | null;
};

/**
 * Pede o e-mail de boas-vindas uma vez por sessão se ainda não foi enviado.
 * Server é a fonte da verdade (claim em welcome_email_sent_at).
 */
export function maybeRequestWelcomeEmail(
  profile: WelcomeEmailProfileHint | null | undefined
): void {
  if (!profile?.id) return;
  if (profile.welcome_email_sent_at) return;
  if (profile.email_unsubscribed_at) return;

  const createdMs = Date.parse(profile.created_at ?? "");
  if (!Number.isFinite(createdMs) || Date.now() - createdMs > TWO_DAYS_MS) {
    return;
  }

  try {
    const key = `${SESSION_KEY_PREFIX}${profile.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }

  void supabase.functions
    .invoke("welcome-email", { body: {} })
    .catch(() => {
      /* best-effort — cron lifecycle-email cobre o fallback */
    });
}
