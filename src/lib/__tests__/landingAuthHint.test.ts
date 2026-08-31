import { afterEach, describe, expect, it, vi } from "vitest";
import { landingShouldDeferToApp } from "@/lib/landingAuthHint";

/**
 * `.test.ts` roda em node (ver `environmentMatchGlobs`). A hint lê `window.location` e
 * `localStorage` — o mesmo molde de `taskSortPreference.test.ts`, com `key`/`length` porque
 * a varredura das chaves `sb-*-auth-token` não usa só getItem.
 */
function mockWindow(opts: {
  hash?: string;
  search?: string;
  store?: Map<string, string>;
}) {
  const store = opts.store ?? new Map<string, string>();
  const storage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal("window", {
    location: { hash: opts.hash ?? "", search: opts.search ?? "" },
    localStorage: storage,
  });
  vi.stubGlobal("localStorage", storage);
  return store;
}

describe("landingShouldDeferToApp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("visitante anônimo não adia a landing", () => {
    mockWindow({});
    expect(landingShouldDeferToApp()).toBe(false);
  });

  it("OAuth na hash (callback no Site URL /) adia", () => {
    mockWindow({ hash: "#access_token=abc&expires_in=3600" });
    expect(landingShouldDeferToApp()).toBe(true);
  });

  it("PKCE no Site URL (/?code=) adia — senão o código nunca é trocado", () => {
    mockWindow({ search: "?code=pkce-code&state=st" });
    expect(landingShouldDeferToApp()).toBe(true);
  });

  it("sessão persistida do supabase-js adia", () => {
    const store = mockWindow({});
    store.set("sb-abc123-auth-token", JSON.stringify({ access_token: "x" }));
    expect(landingShouldDeferToApp()).toBe(true);
  });
});
