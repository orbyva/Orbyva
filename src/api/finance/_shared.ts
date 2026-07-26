import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";

/** PostgREST às vezes devolve relação many-to-one como objeto ou como array. */
export function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export { supabase, getCurrentUserId };
