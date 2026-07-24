import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOnboardingState,
  isActivationDone,
  isFirstTxDone,
  isModuleGuideSeen,
  isTourDone,
  markFirstTxDone,
  markModuleGuideSeen,
  markTourDone,
  ONBOARDING_STEPS,
  resetOnboarding,
} from "@/lib/onboarding";

function mockBrowserStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
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
    dispatchEvent: () => true,
  });
  vi.stubGlobal("localStorage", window.localStorage);
  vi.stubGlobal(
    "CustomEvent",
    class CustomEvent {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    }
  );
}

describe("onboarding finance-first", () => {
  const userId = "user-test-1";

  beforeEach(() => {
    mockBrowserStorage();
    resetOnboarding(userId);
  });

  it("começa com tour e tx pendentes", () => {
    const s = getOnboardingState(userId);
    expect(s.tourDone).toBe(false);
    expect(s.firstTxDone).toBe(false);
    expect(isTourDone(userId)).toBe(false);
    expect(isActivationDone(userId)).toBe(false);
  });

  it("ativação exige tour + 1ª tx", () => {
    markTourDone(userId);
    expect(isTourDone(userId)).toBe(true);
    expect(isActivationDone(userId)).toBe(false);
    markFirstTxDone(userId);
    expect(isFirstTxDone(userId)).toBe(true);
    expect(isActivationDone(userId)).toBe(true);
  });

  it("passos priorizam ledger antes de explorar módulos", () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(ids).toEqual(["welcome", "dimensions", "first-tx", "budget"]);
    expect(ids).not.toContain("explore");
  });

  it("guias de módulo começam não vistos e podem ser marcados", () => {
    expect(isModuleGuideSeen(userId, "travel")).toBe(false);
    expect(getOnboardingState(userId).moduleGuidesSeen).toEqual([]);

    markModuleGuideSeen(userId, "travel");
    expect(isModuleGuideSeen(userId, "travel")).toBe(true);
    expect(isModuleGuideSeen(userId, "habits")).toBe(false);
  });

  it("marcar o mesmo guia não duplica e preserva os demais", () => {
    markModuleGuideSeen(userId, "travel");
    markModuleGuideSeen(userId, "travel");
    markModuleGuideSeen(userId, "car");
    expect(getOnboardingState(userId).moduleGuidesSeen).toEqual([
      "travel",
      "car",
    ]);
  });
});
