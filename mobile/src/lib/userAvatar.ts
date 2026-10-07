type WithMetadata = { user_metadata?: Record<string, unknown> | null } | null | undefined;

/** Foto do provedor de login: o Google grava em `avatar_url` e em `picture`. Sem foto, "". */
export function userAvatarUrl(user: WithMetadata): string {
  const meta = user?.user_metadata;
  for (const key of ["avatar_url", "picture"]) {
    const value = meta?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
