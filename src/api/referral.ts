import { supabase } from "@/lib/supabase";

const REFERRAL_STORAGE_KEY = "orbyva_referral_code";

export function storePendingReferral(code: string) {
  try {
    sessionStorage.setItem(REFERRAL_STORAGE_KEY, code.trim().toUpperCase());
  } catch {
    /* ignore */
  }
}

export function peekPendingReferral(): string | null {
  try {
    return sessionStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingReferral() {
  try {
    sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function ensureReferralCode(): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_my_referral_code");
  if (error) throw error;
  return String(data);
}

export async function countReferrals(): Promise<number> {
  const { data, error } = await supabase.rpc("count_my_referrals");
  if (error) throw error;
  return Number(data ?? 0);
}

/** Aplica referral pendente no perfil atual (se ainda sem referred_by). */
export async function applyPendingReferral(): Promise<void> {
  const code = peekPendingReferral();
  if (!code) return;
  const { error } = await supabase.rpc("apply_referral_code", {
    p_code: code,
  });
  if (!error) clearPendingReferral();
}

export function inviteUrlForCode(code: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://orbyva.app";
  return `${origin}/invite/${code}`;
}
