import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { REVEAL_VIEWPORT, reveal } from "@/components/landing/landingMotion";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { LandingCompare } from "@/pages/landing/LandingCompare";
import { LandingFeatures } from "@/pages/landing/LandingFeatures";
import { LandingOrb } from "@/pages/landing/LandingOrb";
import { LandingPricing } from "@/pages/landing/LandingPricing";
import { LandingProof } from "@/pages/landing/LandingProof";

const landingSources = import.meta.glob(
  ["/src/pages/landing/*.tsx", "/src/components/landing/*.tsx"],
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

/** Margem de baixo do rootMargin ("top right bottom left"), em px. */
function bottomMarginPx(rootMargin: string) {
  const parts = rootMargin.trim().split(/\s+/);
  const bottom = parts.length === 1 ? parts[0] : parts.length === 2 ? parts[0] : parts[2];
  return Number.parseFloat(bottom ?? "0");
}

let observed: IntersectionObserverInit[] = [];

beforeEach(() => {
  observed = [];
  class RecordingObserver {
    constructor(_cb: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
      observed.push(options);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", RecordingObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reveal da landing", () => {
  it("dispara antes de o bloco entrar na tela, uma vez só", () => {
    expect(REVEAL_VIEWPORT.once).toBe(true);
    expect(bottomMarginPx(REVEAL_VIEWPORT.margin)).toBeGreaterThan(0);
    expect(reveal(0.12).transition.delay).toBe(0.12);
    expect(reveal().viewport).toBe(REVEAL_VIEWPORT);
  });

  it("toda seção observa a tela com a margem do reveal, nunca com margem negativa", () => {
    render(
      <MemoryRouter>
        <LandingSectionTitle title="Título" />
        <LandingCompare />
        <LandingOrb />
        <LandingFeatures />
        <LandingProof ctaTo="/login" />
        <LandingPricing ctaTo="/login" ctaLabel="Começar" showPlanCtas />
      </MemoryRouter>
    );

    const margins = observed.map((o) => o.rootMargin ?? "0px");
    expect(margins.length).toBeGreaterThan(0);
    for (const margin of margins) {
      expect(margin).not.toMatch(/-\d/);
      expect(bottomMarginPx(margin)).toBe(bottomMarginPx(REVEAL_VIEWPORT.margin));
    }
  });

  it("nenhum arquivo da landing declara reveal por conta própria", () => {
    const offenders = Object.entries(landingSources)
      .filter(([, source]) => /whileInView|viewport=\{/.test(source))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
