import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LandingOrb } from "@/pages/landing/LandingOrb";
import { ORB_AREAS, ORB_POINTS } from "@/pages/landing/landingOrbData";

beforeEach(() => {
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
});

describe("LandingOrb", () => {
  it("apresenta a Orb com âncora própria, promessa e o que ela consulta", () => {
    const { container } = render(<LandingOrb />);

    expect(container.querySelector("section#orb")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Pergunte. A Orb responde com os seus números." })
    ).toBeTruthy();
    for (const point of ORB_POINTS) expect(screen.getByText(point)).toBeTruthy();

    const areas = screen.getByRole("list", { name: "O que a Orb consulta" });
    expect(within(areas).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      ...ORB_AREAS,
    ]);
  });

  it("mostra a conversa de exemplo com a proposta que só grava depois do clique", () => {
    render(<LandingOrb />);

    const chat = screen.getByRole("img", { name: /Conversa de exemplo com a Orb/ });
    expect(within(chat).getByText("Quanto ainda posso gastar com lazer este mês?")).toBeTruthy();
    expect(within(chat).getByText("R$ 182,40")).toBeTruthy();
    expect(within(chat).getByText("Novo lançamento")).toBeTruthy();
    expect(within(chat).getByText("Confirmar")).toBeTruthy();
    expect(within(chat).getByText("Descartar")).toBeTruthy();
    expect(
      screen.getByText(/o que ela prepara só passa a existir depois do seu\s+clique/)
    ).toBeTruthy();
  });

  it("desenha a esfera em CSS, sem depender de sessão", () => {
    const { container } = render(<LandingOrb />);
    const spheres = container.querySelectorAll(".orb-sphere");
    expect(spheres.length).toBeGreaterThan(0);
    for (const sphere of spheres) {
      expect(sphere.querySelector(".orb-sphere__swirl")).not.toBeNull();
      expect(sphere.closest("[aria-hidden]")).not.toBeNull();
    }
  });
});
