import { supabase } from "./supabase";

export class AuthRequiredError extends Error {
  readonly code = "AUTH_REQUIRED" as const;

  constructor(message = "Usuário não autenticado.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export async function getCurrentUserId(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (error || !user) throw new AuthRequiredError();
  return user.id;
}
