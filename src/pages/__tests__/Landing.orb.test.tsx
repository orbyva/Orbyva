import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Landing from "@/pages/Landing";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/landingAuthHint", () => ({ landingShouldDeferToApp: () => false }));

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );
}

describe("Landing · Orb", () => {
  it("anuncia a Orb no hero e no menu, e tira a IA do 'o que vem a seguir'", () => {
    renderLanding();

    const pill = screen.getByRole("link", { name: /Orb, a IA que\s+responde com os seus números/ });
    expect(pill.getAttribute("href")).toBe("#orb");
    expect(pill.querySelector(".orb-sphere")).not.toBeNull();

    const nav = screen.getByRole("navigation", { name: "Seções" });
    expect(within(nav).getByRole("link", { name: "Orb" }).getAttribute("href")).toBe("#orb");

    expect(screen.queryByText("Assistente com IA")).toBeNull();
  });

  it("o clique no selo monta as seções abaixo da dobra e rola até a Orb", async () => {
    const { container } = renderLanding();
    expect(container.querySelector("section#orb")).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: /Orb, a IA que/ }));

    await waitFor(() => expect(container.querySelector("section#orb")).not.toBeNull());
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView.mock.contexts[0]).toBe(container.querySelector("section#orb"));
  });
});
