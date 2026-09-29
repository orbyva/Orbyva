import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import Orb from "@/pages/admin/orb/Orb";

/**
 * Sem teto de altura, o `SidebarInset` (`min-h-svh`) cresce com a resposta — carrossel de pôsteres
 * empurra o composer para baixo da dobra e parece que a caixa "sumiu". Estas classes são o que
 * mantém a lista rolando por dentro e o campo sempre à vista.
 */
vi.mock("@/hooks/useOrbChat", () => ({
  useOrbChat: () => ({
    messages: [],
    isStreaming: false,
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    retry: vi.fn(),
    editUserMessage: vi.fn(),
  }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/useOrb", () => ({ useOrbContext: () => null }));

describe("Orb — layout do composer", () => {
  it("limita a altura da página para o composer não cair abaixo da dobra", () => {
    const { container } = render(
      <MemoryRouter>
        <Orb />
      </MemoryRouter>
    );
    const shell = container.querySelector("main");
    expect(shell?.className).toMatch(/overflow-hidden/);
    expect(shell?.className).toMatch(/max-h-\[calc\(100dvh/);
    expect(shell?.className).toMatch(/max-w-none/);
    expect(shell?.className).toMatch(/\[&>section\]:shrink-0/);
  });
});
