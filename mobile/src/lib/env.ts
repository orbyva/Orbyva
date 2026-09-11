import Constants from "expo-constants";

function extraValue(key: string): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function required(name: "EXPO_PUBLIC_SUPABASE_URL" | "EXPO_PUBLIC_SUPABASE_ANON_KEY"): string {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return fromEnv;
  const fromExtra = extraValue(name);
  if (fromExtra) return fromExtra;
  throw new Error(
    `${name} é obrigatória. Copie mobile/.env.example para mobile/.env.`
  );
}

export const supabaseUrl = required("EXPO_PUBLIC_SUPABASE_URL");
export const supabaseAnonKey = required("EXPO_PUBLIC_SUPABASE_ANON_KEY");

export const tmdbApiKey =
  extraValue("EXPO_PUBLIC_TMDB_API_KEY") ||
  process.env.EXPO_PUBLIC_TMDB_API_KEY?.trim();
export const googleBooksApiKey =
  extraValue("EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY") ||
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY?.trim();
