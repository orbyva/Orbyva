/** Snapshot leve para leitura offline (hub / listas recentes). */

const LEGACY_PREFIX = "fintrack_offline_v1:";
const PREFIX = "orbyva_offline_v1:";

export type OfflineSnapshot<T> = {
  savedAt: string;
  data: T;
};

function readRaw(key: string): string | null {
  const next = localStorage.getItem(PREFIX + key);
  if (next) return next;
  const legacy = localStorage.getItem(LEGACY_PREFIX + key);
  if (legacy) {
    try {
      localStorage.setItem(PREFIX + key, legacy);
      localStorage.removeItem(LEGACY_PREFIX + key);
    } catch {
      /* ignore */
    }
    return legacy;
  }
  return null;
}

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
    const raw = readRaw(key);
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
