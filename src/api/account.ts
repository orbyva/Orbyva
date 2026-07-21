import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";

/** Apaga dados do usuário e a conta Auth (via RPC security definer). */
export async function deleteOwnAccount(): Promise<void> {
  await getCurrentUserId();
  const { error } = await supabase.rpc("delete_own_account");
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
}

/** Apaga só os dados do app (mantém login). Útil como passo intermediário. */
export async function wipeOwnData(): Promise<void> {
  await getCurrentUserId();
  const { error } = await supabase.rpc("wipe_own_data");
  if (error) throw new Error(error.message);
}
