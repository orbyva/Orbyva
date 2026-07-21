import { supabase } from "@/lib/supabase";

export async function joinWaitlist(
  email: string,
  source = "landing"
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
      throw new Error("Esse e-mail já está na lista.");
    }
    if (error.code === "42P01" || error.code === "PGRST205") {
      throw new Error(
        "Waitlist ainda não configurada. Rode scripts/billing.sql no Supabase."
      );
    }
    throw new Error(error.message);
  }
}
