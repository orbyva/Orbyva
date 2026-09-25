import { secureStoreAdapter } from "@/lib/secure-store";

export async function kvGet(key: string): Promise<string | null> {
  return secureStoreAdapter.getItem(key);
}

export async function kvSet(key: string, value: string): Promise<void> {
  await secureStoreAdapter.setItem(key, value);
}

export async function kvRemove(key: string): Promise<void> {
  await secureStoreAdapter.removeItem(key);
}
