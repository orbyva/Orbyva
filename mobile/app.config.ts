import fs from "node:fs";
import path from "node:path";

import type { ExpoConfig } from "expo/config";

import appJson from "./app.json";

function loadEnvFile(filePath: string, override: boolean) {
  if (!fs.existsSync(filePath)) return;
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key) continue;
    if (!override && process.env[key]) continue;
    process.env[key] = value;
  }
}

const rootDir = __dirname;
loadEnvFile(path.join(rootDir, "..", ".env"), false);
loadEnvFile(path.join(rootDir, ".env"), true);

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

const expo = appJson.expo as ExpoConfig;

const extra = {
  ...(typeof expo.extra === "object" && expo.extra ? expo.extra : {}),
  EXPO_PUBLIC_SUPABASE_URL: firstEnv(
    "EXPO_PUBLIC_SUPABASE_URL",
    "VITE_SUPABASE_URL"
  ),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: firstEnv(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY"
  ),
  EXPO_PUBLIC_TMDB_API_KEY: firstEnv(
    "EXPO_PUBLIC_TMDB_API_KEY",
    "VITE_TMDB_API_KEY"
  ),
  EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY: firstEnv(
    "EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY",
    "VITE_GOOGLE_BOOKS_API_KEY"
  ),
};

export default {
  ...expo,
  extra,
} satisfies ExpoConfig;
