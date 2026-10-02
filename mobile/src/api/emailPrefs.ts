import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";

export type EmailPrefsState = {
  email_digest_enabled: boolean;
  email_alerts_enabled: boolean;
  email_habit_reminder_enabled: boolean;
  email_unsubscribed_at: string | null;
};

export type EmailPrefsPatch = {
  email_digest_enabled?: boolean;
  email_alerts_enabled?: boolean;
  email_habit_reminder_enabled?: boolean;
  /** true = pausa todos os e-mails de produto */
  unsubscribed?: boolean;
};

export const EMAIL_PREF_OPTIONS = [
  { key: "email_digest_enabled", label: "Digest semanal" },
  { key: "email_alerts_enabled", label: "Alertas por e-mail (parcelas / orçamento)" },
  { key: "email_habit_reminder_enabled", label: "Lembrete diário de hábitos" },
] as const;

const EMAIL_PREFS_NOT_SAVED = "A preferência não foi gravada. Tente de novo.";

export async function fetchEmailPrefs(): Promise<EmailPrefsState> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "email_digest_enabled, email_alerts_enabled, email_habit_reminder_enabled, email_unsubscribed_at"
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Partial<EmailPrefsState>;
  return {
    email_digest_enabled: row.email_digest_enabled !== false,
    email_alerts_enabled: Boolean(row.email_alerts_enabled),
    email_habit_reminder_enabled: Boolean(row.email_habit_reminder_enabled),
    email_unsubscribed_at: row.email_unsubscribed_at ?? null,
  };
}

/** Estado otimista da tela: o que as preferências viram se o patch for gravado. */
export function applyEmailPrefsPatch(
  prefs: EmailPrefsState,
  patch: EmailPrefsPatch
): EmailPrefsState {
  const next = { ...prefs };
  if (patch.email_digest_enabled !== undefined) {
    next.email_digest_enabled = patch.email_digest_enabled;
  }
  if (patch.email_alerts_enabled !== undefined) {
    next.email_alerts_enabled = patch.email_alerts_enabled;
  }
  if (patch.email_habit_reminder_enabled !== undefined) {
    next.email_habit_reminder_enabled = patch.email_habit_reminder_enabled;
  }
  if (patch.unsubscribed !== undefined) {
    next.email_unsubscribed_at = patch.unsubscribed
      ? (prefs.email_unsubscribed_at ?? new Date().toISOString())
      : null;
  }
  return next;
}

/**
 * `profiles` não tem policy de UPDATE para `authenticated`; a escrita passa pela RPC
 * `update_email_prefs` (feature 191), e o estado devolvido é conferido contra o pedido.
 */
export async function updateEmailPrefs(patch: EmailPrefsPatch): Promise<EmailPrefsState> {
  const { data, error } = await supabase.rpc("update_email_prefs", {
    p_digest: patch.email_digest_enabled ?? null,
    p_alerts: patch.email_alerts_enabled ?? null,
    p_habit_reminder: patch.email_habit_reminder_enabled ?? null,
    p_unsubscribed: patch.unsubscribed ?? null,
  });
  if (error) throw new Error(error.message);

  const row = (Array.isArray(data) ? data[0] : data) as EmailPrefsState | undefined;
  if (!row) throw new Error(EMAIL_PREFS_NOT_SAVED);

  const mismatch =
    (patch.email_digest_enabled !== undefined &&
      row.email_digest_enabled !== patch.email_digest_enabled) ||
    (patch.email_alerts_enabled !== undefined &&
      row.email_alerts_enabled !== patch.email_alerts_enabled) ||
    (patch.email_habit_reminder_enabled !== undefined &&
      row.email_habit_reminder_enabled !== patch.email_habit_reminder_enabled) ||
    (patch.unsubscribed !== undefined &&
      Boolean(row.email_unsubscribed_at) !== patch.unsubscribed);
  if (mismatch) throw new Error(EMAIL_PREFS_NOT_SAVED);

  return row;
}
