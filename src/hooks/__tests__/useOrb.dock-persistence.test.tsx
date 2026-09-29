import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrbProvider, useOrbContext } from "@/hooks/useOrb";

/**
 * Passo 2 do roteiro de verificação da feature 100: "recolha o dock e recarregue a página — ele
 * volta no mesmo estado". Era o único jeito de conferir isso olhando no navegador; aqui a mesma
 * afirmação vira teste, que é o que a CLAUDE.md pede ("se a única forma de confirmar algo fosse
 * olhar no navegador, isso é sinal de cobertura automatizada faltando").
 *
 * O "recarregar a página" é reproduzido desmontando e montando o provider de novo: a preferência
 * é lida no inicializador preguiçoso do `useState`, exatamente uma vez por montagem, então remontar
 * exercita o mesmo caminho que o reload exercita.
 *
 * `useOrbChat` é falso de propósito — esta suíte é sobre a preferência do dock, não sobre stream.
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

const CHAVE = "orb:dock-aberto";

function Sonda() {
  const ctx = useOrbContext();
  if (!ctx) return null;
  return (
    <div>
      <span data-testid="estado">{ctx.dockOpen ? "aberto" : "fechado"}</span>
      <button onClick={() => ctx.setDockOpen(false)}>recolher</button>
      <button onClick={() => ctx.setDockOpen(true)}>abrir</button>
    </div>
  );
}

function montar() {
  return render(
    <MemoryRouter>
      <OrbProvider>
        <Sonda />
      </OrbProvider>
    </MemoryRouter>
  );
}

const estado = () => screen.getByTestId("estado").textContent;

describe("preferência do dock da Orb", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("nasce aberto quando nunca houve preferência gravada", () => {
    montar();
    expect(estado()).toBe("aberto");
  });

  it("recolher grava a preferência e ela sobrevive ao reload", () => {
    const { unmount } = montar();
    expect(estado()).toBe("aberto");

    act(() => {
      screen.getByText("recolher").click();
    });
    expect(estado()).toBe("fechado");
    expect(window.localStorage.getItem(CHAVE)).toBe("0");

    // O reload do passo 2: mesma preferência, provider novo.
    unmount();
    montar();
    expect(estado()).toBe("fechado");
  });

  it("abrir de novo volta a preferência, e ela também sobrevive ao reload", () => {
    window.localStorage.setItem(CHAVE, "0");
    const { unmount } = montar();
    expect(estado()).toBe("fechado");

    act(() => {
      screen.getByText("abrir").click();
    });
    expect(window.localStorage.getItem(CHAVE)).toBe("1");

    unmount();
    montar();
    expect(estado()).toBe("aberto");
  });

  it("valor estranho no storage não fecha o dock — só o `0` fecha", () => {
    window.localStorage.setItem(CHAVE, "sei-la");
    montar();
    expect(estado()).toBe("aberto");
  });

  it("storage bloqueado na leitura cai no padrão aberto em vez de quebrar a barra lateral", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage bloqueado");
    });
    expect(() => montar()).not.toThrow();
    expect(estado()).toBe("aberto");
  });

  it("storage bloqueado na escrita não derruba a sessão: o dock ainda recolhe na hora", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage bloqueado");
    });
    montar();
    act(() => {
      screen.getByText("recolher").click();
    });
    // A preferência não sobrevive ao reload (não há onde gravar), mas a sessão atual obedece.
    expect(estado()).toBe("fechado");
  });
});
