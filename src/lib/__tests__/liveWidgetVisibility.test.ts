import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_WIDGET_HIDDEN_STORAGE_KEY,
  readLiveWidgetHidden,
  writeLiveWidgetHidden,
} from "@/lib/liveWidgetVisibility";

/**
 * Feature 226 — preferência de "esconder o timer flutuante". O que este arquivo prova é a regra que
 * não pode falhar: o padrão é **visível**, então chave ausente, valor lixo ou `localStorage`
 * indisponível nunca podem esconder o widget.
 *
 * `localStorage` de mentira no mesmo molde de `taskSortPreference.test.ts`: os `.test.ts` rodam em
 * ambiente "node" (ver `environmentMatchGlobs`), onde ele não existe.
 */
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

describe("liveWidgetVisibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("com localStorage disponível", () => {
    let store: Map<string, string>;

    beforeEach(() => {
      store = mockBrowserStorage();
    });

    it("sem nada salvo o widget é visível", () => {
      expect(readLiveWidgetHidden()).toBe(false);
    });

    it("esconder grava \"1\" e a releitura devolve true", () => {
      writeLiveWidgetHidden(true);
      expect(store.get(LIVE_WIDGET_HIDDEN_STORAGE_KEY)).toBe("1");
      expect(readLiveWidgetHidden()).toBe(true);
    });

    it("mostrar remove a chave (não deixa \"0\" acumulado) e a releitura devolve false", () => {
      writeLiveWidgetHidden(true);
      writeLiveWidgetHidden(false);
      expect(store.has(LIVE_WIDGET_HIDDEN_STORAGE_KEY)).toBe(false);
      expect(readLiveWidgetHidden()).toBe(false);
    });

    it("valor lixo gravado por outra versão lê como visível", () => {
      for (const garbage of ["true", "0", "", "sim", "01"]) {
        store.set(LIVE_WIDGET_HIDDEN_STORAGE_KEY, garbage);
        expect(readLiveWidgetHidden()).toBe(false);
      }
    });
  });

  it("sem localStorage nenhum, lê visível e escrever não lança", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readLiveWidgetHidden()).toBe(false);
    expect(() => writeLiveWidgetHidden(true)).not.toThrow();
    expect(() => writeLiveWidgetHidden(false)).not.toThrow();
  });

  it("localStorage que lança (modo privado/cota) não derruba a tela", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("acesso negado");
      },
      setItem: () => {
        throw new Error("cota estourada");
      },
      removeItem: () => {
        throw new Error("acesso negado");
      },
    });
    expect(readLiveWidgetHidden()).toBe(false);
    expect(() => writeLiveWidgetHidden(true)).not.toThrow();
    expect(() => writeLiveWidgetHidden(false)).not.toThrow();
  });
});
