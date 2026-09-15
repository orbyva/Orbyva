import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";

export async function deleteOwnAccount(): Promise<void> {
  await getCurrentUserId();
  const { error } = await supabase.rpc("delete_own_account");
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
}

export async function wipeOwnData(): Promise<void> {
  await getCurrentUserId();
  const { error } = await supabase.rpc("wipe_own_data");
  if (error) throw new Error(error.message);
}
