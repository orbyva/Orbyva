/** Fila de escrita offline (outbox), lançamentos sem rede, sync ao voltar. */

import type { TransactionCreateRequest } from "@/types/finance";
import { isNavigatorOffline } from "@/lib/offlineCache";

const OUTBOX_KEY = "orbyva_outbox_v1";

export type OfflineOutboxItem = {
  id: string;
  createdAt: string;
  kind: "transaction";
  payload: TransactionCreateRequest;
};

/** Fallback em memória (Node/vitest sem localStorage). */
let memoryOutbox: OfflineOutboxItem[] = [];

function writeOutbox(items: OfflineOutboxItem[]): void {
  if (typeof localStorage === "undefined") {
    memoryOutbox = [...items];
    return;
  }
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
    memoryOutbox = [...items];
  } catch {
    memoryOutbox = [...items];
  }
}

function readOutbox(): OfflineOutboxItem[] {
  if (typeof localStorage === "undefined") {
    return [...memoryOutbox];
  }
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return memoryOutbox.length ? [...memoryOutbox] : [];
    const parsed = JSON.parse(raw) as OfflineOutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [...memoryOutbox];
  }
}

export function listOfflineOutbox(): OfflineOutboxItem[] {
  return readOutbox();
}

export function countOfflineOutbox(): number {
  return readOutbox().length;
}

export function enqueueOfflineTransaction(
  payload: TransactionCreateRequest
): OfflineOutboxItem {
  const item: OfflineOutboxItem = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    kind: "transaction",
    payload,
  };
  writeOutbox([...readOutbox(), item]);
  return item;
}

export function removeOfflineOutboxItem(id: string): void {
  writeOutbox(readOutbox().filter((i) => i.id !== id));
}

export function clearOfflineOutbox(): void {
  writeOutbox([]);
  memoryOutbox = [];
}

export type FlushOutboxResult = {
  synced: number;
  failed: number;
  remaining: number;
};

/** Envia itens pendentes. `insert` deve lançar em erro de rede/API. */
export async function flushOfflineOutbox(
  insert: (payload: TransactionCreateRequest) => Promise<unknown>
): Promise<FlushOutboxResult> {
  if (isNavigatorOffline()) {
    return { synced: 0, failed: 0, remaining: countOfflineOutbox() };
  }

  const pending = readOutbox();
  let synced = 0;
  let failed = 0;
  const leftover: OfflineOutboxItem[] = [];

  for (const item of pending) {
    try {
      await insert(item.payload);
      synced += 1;
    } catch {
      failed += 1;
      leftover.push(item);
    }
  }

  writeOutbox(leftover);
  return { synced, failed, remaining: leftover.length };
}
