/**
 * Quando "Confirm email" está ligado, o Supabase ofusca signup de e-mail já
 * cadastrado: responde 200 sem sessão e com `identities: []`, sem mandar e-mail.
 * Sem este check a UI mente ("enviamos o e-mail de confirmação").
 */
export const EXISTING_ACCOUNT_SIGNUP_MESSAGE =
  "Já existe uma conta com este e-mail. Entre ou recupere a senha.";

export function isDuplicateEmailSignUp(data: {
  user: { identities?: unknown[] | null } | null;
  session: unknown;
}): boolean {
  if (data.session || !data.user) return false;
  return (data.user.identities?.length ?? 0) === 0;
}
