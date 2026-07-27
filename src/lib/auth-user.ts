import { supabase } from "@/lib/supabase";

/** Sessão ausente — esperado em race/logout; não é bug de produto. */
export class AuthRequiredError extends Error {
  readonly code = "AUTH_REQUIRED" as const;

  constructor(message = "Usuário não autenticado.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export function isAuthRequiredError(error: unknown): boolean {
  if (error instanceof AuthRequiredError) return true;
  if (error instanceof Error && error.message === "Usuário não autenticado.") {
    return true;
  }
  return false;
}

/** ID do usuário autenticado (UUID). Lança AuthRequiredError se não houver sessão. */
export async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new AuthRequiredError();
  return user.id;
}
