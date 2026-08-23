import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TASK_SORT_STORAGE_KEY,
  readTaskSortKey,
  writeTaskSortKey,
} from "@/lib/taskSortPreference";

/** `localStorage` de mentira, no mesmo molde de `retention.test.ts`: os `.test.ts` rodam em
 * ambiente "node" (ver `environmentMatchGlobs`), onde ele não existe. */
function mockBrowserStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  });
  return store;
}

describe("taskSortPreference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("com localStorage disponível", () => {
    let store: Map<string, string>;

    beforeEach(() => {
      store = mockBrowserStorage();
    });

    it("sem nada salvo cai no padrão de fábrica (updated)", () => {
      expect(readTaskSortKey()).toBe("updated");
    });

    it("grava e relê a escolha do usuário", () => {
      writeTaskSortKey("due");
      expect(store.get(TASK_SORT_STORAGE_KEY)).toBe("due");
      expect(readTaskSortKey()).toBe("due");

      writeTaskSortKey("updated");
      expect(readTaskSortKey()).toBe("updated");
    });

    it("valor inválido salvo por outra versão cai no padrão, sem lançar", () => {
      store.set(TASK_SORT_STORAGE_KEY, "prioridade");
      expect(readTaskSortKey()).toBe("updated");
      store.set(TASK_SORT_STORAGE_KEY, "");
      expect(readTaskSortKey()).toBe("updated");
    });

    it("chave desconhecida não é gravada (mantém o que já estava)", () => {
      writeTaskSortKey("due");
      writeTaskSortKey("nao-existe" as never);
      expect(store.get(TASK_SORT_STORAGE_KEY)).toBe("due");
    });
  });

  it("sem localStorage nenhum, lê o padrão e escrever não lança", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readTaskSortKey()).toBe("updated");
    expect(() => writeTaskSortKey("due")).not.toThrow();
  });

  it("localStorage que lança (modo privado/cota) não derruba a tela", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("acesso negado");
      },
      setItem: () => {
        throw new Error("cota estourada");
      },
    });
    expect(readTaskSortKey()).toBe("updated");
    expect(() => writeTaskSortKey("due")).not.toThrow();
  });
});
