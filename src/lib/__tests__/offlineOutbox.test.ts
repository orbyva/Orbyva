import { describe, expect, it, beforeEach } from "vitest";
import {
  clearOfflineOutbox,
  countOfflineOutbox,
  enqueueOfflineTransaction,
  flushOfflineOutbox,
  listOfflineOutbox,
} from "@/lib/offlineOutbox";

const sample = {
  class_id: 1,
  value: 10,
  description: "Offline coffee",
  transaction_at: "2026-07-26",
};

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
}

describe("offlineOutbox", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    clearOfflineOutbox();
  });

  it("enfileira e conta", () => {
    enqueueOfflineTransaction(sample);
    expect(countOfflineOutbox()).toBe(1);
    expect(listOfflineOutbox()[0]?.payload.description).toBe("Offline coffee");
  });

  it("flush remove itens com sucesso", async () => {
    enqueueOfflineTransaction(sample);
    enqueueOfflineTransaction({ ...sample, description: "B" });
    const result = await flushOfflineOutbox(async () => 1);
    expect(result.synced).toBe(2);
    expect(result.remaining).toBe(0);
    expect(countOfflineOutbox()).toBe(0);
  });

  it("mantém itens que falharam", async () => {
    enqueueOfflineTransaction(sample);
    const result = await flushOfflineOutbox(async () => {
      throw new Error("network");
    });
    expect(result.failed).toBe(1);
    expect(result.remaining).toBe(1);
  });
});
