import { supabase } from "@/lib/supabase";

/** ID do usuário autenticado (UUID). Lança se não houver sessão. */
export async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Usuário não autenticado.");
  return user.id;
}
