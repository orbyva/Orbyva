import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, failing } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  failing: { value: false },
}));

vi.mock("@/lib/secure-store", () => ({
  secureStoreAdapter: {
    getItem: vi.fn(async (key: string) => {
      if (failing.value) throw new Error("storage indisponível");
      return store.get(key) ?? null;
    }),
    setItem: vi.fn(async (key: string, value: string) => {
      if (failing.value) throw new Error("storage indisponível");
      store.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      if (failing.value) throw new Error("storage indisponível");
      store.delete(key);
    }),
  },
}));

import {
  LIVE_WIDGET_HIDDEN_STORAGE_KEY,
  liveWidgetMode,
  readLiveWidgetHidden,
  writeLiveWidgetHidden,
} from "@/lib/liveWidgetVisibility";

beforeEach(() => {
  store.clear();
  failing.value = false;
});

describe("preferência de esconder o timer", () => {
  it("usa a mesma chave do web", () => {
    expect(LIVE_WIDGET_HIDDEN_STORAGE_KEY).toBe("orbyva_live_widget_hidden_v1");
  });

  it("ausente = visível", async () => {
    expect(await readLiveWidgetHidden()).toBe(false);
  });

  it("esconder grava e a leitura devolve escondido", async () => {
    await writeLiveWidgetHidden(true);
    expect(store.get(LIVE_WIDGET_HIDDEN_STORAGE_KEY)).toBe("1");
    expect(await readLiveWidgetHidden()).toBe(true);
  });

  it("mostrar remove a chave em vez de gravar 0", async () => {
    await writeLiveWidgetHidden(true);
    await writeLiveWidgetHidden(false);
    expect(store.has(LIVE_WIDGET_HIDDEN_STORAGE_KEY)).toBe(false);
    expect(await readLiveWidgetHidden()).toBe(false);
  });

  it("valor inválido lê como visível", async () => {
    store.set(LIVE_WIDGET_HIDDEN_STORAGE_KEY, "true");
    expect(await readLiveWidgetHidden()).toBe(false);
  });

  it("storage com erro não quebra e lê como visível", async () => {
    failing.value = true;
    await expect(writeLiveWidgetHidden(true)).resolves.toBeUndefined();
    expect(await readLiveWidgetHidden()).toBe(false);
  });
});

describe("liveWidgetMode", () => {
  const base = { hasTask: true, running: true, taskDone: false, dismissed: false, hidden: false };

  it("visível com tarefa ativa = pill", () => {
    expect(liveWidgetMode(base)).toBe("pill");
  });

  it("escondido vira o botão redondo, rodando ou parado", () => {
    expect(liveWidgetMode({ ...base, hidden: true })).toBe("collapsed");
    expect(liveWidgetMode({ ...base, hidden: true, running: false })).toBe("collapsed");
  });

  it("sem tarefa não desenha nada, escondido ou não", () => {
    expect(liveWidgetMode({ ...base, hasTask: false })).toBe("none");
    expect(liveWidgetMode({ ...base, hasTask: false, hidden: true })).toBe("none");
  });

  it("parado com a tarefa concluída não desenha nada", () => {
    expect(liveWidgetMode({ ...base, running: false, taskDone: true })).toBe("none");
    expect(liveWidgetMode({ ...base, running: false, taskDone: true, hidden: true })).toBe("none");
  });

  it("depois de parar e concluir some de vez, sem botão redondo", () => {
    expect(liveWidgetMode({ ...base, dismissed: true, hidden: true })).toBe("none");
  });
});
