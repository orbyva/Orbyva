import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TASK_PROJECT_FILTER_STORAGE_KEY,
  readTaskProjectFilter,
  writeTaskProjectFilter,
} from "@/lib/taskProjectFilterPreference";

/** `localStorage` de mentira, no mesmo molde de `taskSortPreference.test.ts`: os `.test.ts` rodam
 * em ambiente "node" (ver `test.projects` em `vite.config.ts`), onde ele não existe. */
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

describe("taskProjectFilterPreference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("com localStorage disponível", () => {
    let store: Map<string, string>;

    beforeEach(() => {
      store = mockBrowserStorage();
    });

    it("sem nada salvo cai no padrão de fábrica (all)", () => {
      expect(readTaskProjectFilter()).toBe("all");
    });

    it("grava e relê a escolha do usuário", () => {
      writeTaskProjectFilter("projeto-1");
      expect(store.get(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe("projeto-1");
      expect(readTaskProjectFilter()).toBe("projeto-1");

      writeTaskProjectFilter("null");
      expect(readTaskProjectFilter()).toBe("null");

      writeTaskProjectFilter("all");
      expect(readTaskProjectFilter()).toBe("all");
    });

    it("valor sem forma de filtro salvo por outra versão cai no padrão, sem lançar", () => {
      store.set(TASK_PROJECT_FILTER_STORAGE_KEY, "");
      expect(readTaskProjectFilter()).toBe("all");
    });

    it("valor inválido não é gravado (mantém o que já estava)", () => {
      writeTaskProjectFilter("projeto-1");
      writeTaskProjectFilter("");
      writeTaskProjectFilter(undefined as never);
      expect(store.get(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe("projeto-1");
    });
  });

  it("sem localStorage nenhum, lê o padrão e escrever não lança", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readTaskProjectFilter()).toBe("all");
    expect(() => writeTaskProjectFilter("projeto-1")).not.toThrow();
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
    expect(readTaskProjectFilter()).toBe("all");
    expect(() => writeTaskProjectFilter("projeto-1")).not.toThrow();
  });
});
