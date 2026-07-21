/** Snapshot leve para leitura offline (hub / listas recentes). */

const PREFIX = "fintrack_offline_v1:";

export type OfflineSnapshot<T> = {
  savedAt: string;
  data: T;
};

export function saveOfflineSnapshot<T>(key: string, data: T): void {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: OfflineSnapshot<T> = {
      savedAt: new Date().toISOString(),
      data,
    };
    localStorage.setItem(PREFIX + key, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function loadOfflineSnapshot<T>(key: string): OfflineSnapshot<T> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineSnapshot<T>;
    if (!parsed || typeof parsed !== "object" || !("data" in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isNavigatorOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
