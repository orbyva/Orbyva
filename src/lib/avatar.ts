
export function normalizeAvatarUrl(url?: string | null): string | undefined {
  if (!url?.trim()) return undefined;
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    if (u.hostname.endsWith("googleusercontent.com")) {
      // downscale to reduce bandwidth / server load
      if (u.search || u.pathname.includes("=")) {
        // patterns like ...=s96-c
        return trimmed.replace(/=s\d+-c$/, "=s48-c");
      }
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

/** Avatar em user_metadata (Google OAuth usa picture ou avatar_url). */
export function avatarFromUserMeta(
  meta?: Record<string, unknown> | null
): string | undefined {
  if (!meta) return undefined;
  const avatar =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    "";
  return normalizeAvatarUrl(avatar);
}

/** Paleta estilo Google Account (fallback sem foto). */
const GOOGLE_AVATAR_COLORS = [
  "#F44336",
  "#E91E63",
  "#9C27B0",
  "#673AB7",
  "#3F51B5",
  "#2196F3",
  "#03A9F4",
  "#00BCD4",
  "#009688",
  "#4CAF50",
  "#8BC34A",
  "#FF9800",
  "#FF5722",
  "#795548",
  "#607D8B",
] as const;

/** Cor estável a partir do nome (igual ao círculo colorido do Google). */
export function googleAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % GOOGLE_AVATAR_COLORS.length;
  return GOOGLE_AVATAR_COLORS[idx];
}

/** Uma letra maiúscula, como no avatar padrão do Google. */
export function googleAvatarInitial(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  const letter = trimmed[0];
  return letter.toLocaleUpperCase("pt-BR");
}
