import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type { OrbAvatar } from "@/types/orb";

/**
 * A versão da Orb que o app deve mostrar, ou `null` — a mesma consulta do web.
 *
 * `maybeSingle`: nenhuma ativa é estado válido (a esfera desenhada é o fallback). O índice parcial
 * `orb_avatar_one_active_idx` garante no banco que no máximo uma linha volta.
 */
export async function fetchActiveOrbAvatar(): Promise<OrbAvatar | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("orb_avatar")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OrbAvatar | null) ?? null;
}
