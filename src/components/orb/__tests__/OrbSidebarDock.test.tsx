import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrbSidebarDock } from "@/components/orb/OrbSidebarDock";
import type { OrbMessage } from "@/types/orb";

/**
 * O dock é a Orb morando na barra lateral: ele não tem conversa própria (lê o `OrbProvider`) e
 * precisa continuar mostrando o stream depois que a Orb troca a tela. O que este arquivo protege é
 * isso — a janela estreita mostra a MESMA conversa, e o campo manda para o mesmo `send`.
 */
const { contextoMock, sidebarMock } = vi.hoisted(() => ({
  contextoMock: vi.fn(),
  sidebarMock: vi.fn(),
}));
vi.mock("@/hooks/useOrb", () => ({ useOrbContext: contextoMock }));
vi.mock("@/components/ui/sidebar", () => ({ useSidebar: sidebarMock }));

const send = vi.fn();
const setDockOpen = vi.fn();

function contexto(overrides: Record<string, unknown> = {}) {
  return {
    messages: [] as OrbMessage[],
    isStreaming: false,
    send,
    stop: vi.fn(),
    reset: vi.fn(),
    retry: vi.fn(),
    editUserMessage: vi.fn(),
    lastNavigation: null,
    dockOpen: true,
    setDockOpen,
    openDock: vi.fn(),
    registerComposer: vi.fn(),
    proposalStates: {},
    setProposalState: vi.fn(),
    ...overrides,
  };
}

function renderizar(overrides: Record<string, unknown> = {}, estadoDaBarra = "expanded") {
  contextoMock.mockReturnValue(contexto(overrides));
  sidebarMock.mockReturnValue({ state: estadoDaBarra, isMobile: false, setOpen: vi.fn() });
  return render(
    <MemoryRouter>
      <OrbSidebarDock />
    </MemoryRouter>
  );
}

describe("OrbSidebarDock", () => {
  beforeEach(() => {
    send.mockReset();
    setDockOpen.mockReset();
  });

  it("manda a pergunta pela conversa compartilhada", () => {
    renderizar();
    const campo = screen.getByLabelText("Mensagem para a Orb");
    fireEvent.change(campo, { target: { value: "o que tenho hoje?" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(send).toHaveBeenCalledWith("o que tenho hoje?");
  });

  it("mostra as últimas mensagens da conversa que já existe", () => {
    renderizar({
      messages: [
        { id: "u1", role: "user", content: "e o orçamento?" },
        { id: "a1", role: "assistant", content: "Sobram R$ 320 em Mercado." },
      ] as OrbMessage[],
    });
    expect(screen.getByText("e o orçamento?")).toBeInTheDocument();
    expect(screen.getByText("Sobram R$ 320 em Mercado.")).toBeInTheDocument();
  });

  it("na barra recolhida vira só a esfera, sem campo de texto", () => {
    renderizar({}, "collapsed");
    expect(screen.getByRole("button", { name: "Falar com a Orb" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Mensagem para a Orb")).not.toBeInTheDocument();
  });

  it("com o painel fechado mostra o cabeçalho e esconde a conversa", () => {
    renderizar({ dockOpen: false, messages: [{ id: "u1", role: "user", content: "oi" }] as OrbMessage[] });
    expect(screen.getByText("Orb")).toBeInTheDocument();
    expect(screen.queryByText("oi")).not.toBeInTheDocument();
  });

  it("abre a conversa com animação de altura e respeita movimento reduzido", () => {
    renderizar({ messages: [{ id: "u1", role: "user", content: "oi" }] as OrbMessage[] });
    const painel = screen.getByText("oi").closest("[data-state]");
    expect(painel).toHaveAttribute("data-state", "open");
    expect(painel?.className).toContain("data-[state=open]:animate-collapsible-down");
    expect(painel?.className).toContain("data-[state=closed]:animate-collapsible-up");
    expect(painel?.className).toContain("motion-reduce:animate-none");
  });

  it("aponta a última tela que a Orb abriu", () => {
    renderizar({
      lastNavigation: { path: "/tasks?project=p-1", label: "Tarefas · Sacada", screen: "tasks", applied: [] },
    });
    const atalho = screen.getByRole("link", { name: /Tarefas · Sacada/ });
    expect(atalho).toHaveAttribute("href", "/tasks?project=p-1");
  });

  it("sem provider não renderiza nada", () => {
    contextoMock.mockReturnValue(null);
    sidebarMock.mockReturnValue({ state: "expanded", isMobile: false, setOpen: vi.fn() });
    const { container } = render(
      <MemoryRouter>
        <OrbSidebarDock />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
