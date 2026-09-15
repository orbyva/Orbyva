import { supabase } from "@/lib/supabase";

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

export function inviteUrlForCode(code: string): string {
  return `https://orbyva.app/invite/${code}`;
}
