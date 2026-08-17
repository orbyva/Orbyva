import { CABE_NO_MES_WAITLIST_SOURCE } from "@/domain/marketing/cabeNoMes";
import { supabase } from "@/lib/supabase";

export const WAITLIST_SOURCE = {
  LANDING: "landing",
  CABE_NO_MES: CABE_NO_MES_WAITLIST_SOURCE,
} as const;

export async function joinWaitlist(
  email: string,
  source = WAITLIST_SOURCE.LANDING
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Informe um e-mail válido.");
  }

  const { error } = await supabase.from("waitlist").insert({
    email: normalized,
    source,
  });

  if (error) {
    if (error.code === "23505") {
      return;
    }
    if (error.code === "42P01" || error.code === "PGRST205") {
      throw new Error(
        "Lista temporariamente indisponível. Tente mais tarde."
      );
    }
    throw new Error(error.message);
  }
}
