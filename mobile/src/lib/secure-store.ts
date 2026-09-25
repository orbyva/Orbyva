import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** SecureStore iOS ~2KB; a sessão do Supabase pode passar disso. */
const CHUNK = 1800;

/** Expo rejeita chave com `:`, `/`, espaço, etc. */
function nativeKey(key: string): string {
  const cleaned = key.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "orbyva_kv";
}

async function webGet(key: string): Promise<string | null> {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

async function webSet(key: string, value: string): Promise<void> {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* ignore quota */
  }
}

async function webRemove(key: string): Promise<void> {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === "web") return webGet(key);
    const storeKey = nativeKey(key);
    const countRaw = await SecureStore.getItemAsync(`${storeKey}_n`);
    if (!countRaw) {
      return SecureStore.getItemAsync(storeKey);
    }
    const n = Number(countRaw);
    if (!Number.isFinite(n) || n < 1) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      parts.push((await SecureStore.getItemAsync(`${storeKey}_${i}`)) ?? "");
    }
    return parts.join("");
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") {
      await webSet(key, value);
      return;
    }
    const storeKey = nativeKey(key);
    if (value.length <= CHUNK) {
      await SecureStore.setItemAsync(storeKey, value);
      await SecureStore.deleteItemAsync(`${storeKey}_n`).catch(() => undefined);
      return;
    }
    const n = Math.ceil(value.length / CHUNK);
    await SecureStore.setItemAsync(`${storeKey}_n`, String(n));
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(
        `${storeKey}_${i}`,
        value.slice(i * CHUNK, (i + 1) * CHUNK)
      );
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === "web") {
      await webRemove(key);
      return;
    }
    const storeKey = nativeKey(key);
    const countRaw = await SecureStore.getItemAsync(`${storeKey}_n`);
    await SecureStore.deleteItemAsync(storeKey).catch(() => undefined);
    await SecureStore.deleteItemAsync(`${storeKey}_n`).catch(() => undefined);
    const n = Number(countRaw);
    if (!Number.isFinite(n) || n < 1) return;
    await Promise.all(
      Array.from({ length: n }, (_, i) =>
        SecureStore.deleteItemAsync(`${storeKey}_${i}`).catch(() => undefined)
      )
    );
  },
};
