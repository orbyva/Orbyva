import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrbChat } from "@/components/orb/OrbChat";
import type { OrbMessage } from "@/types/orb";

/**
 * O que este arquivo protege é UMA regra de leitura: a conversa só se auto-rola enquanto o usuário
 * está no fim. Se ela voltar a rolar sempre, quem subiu para reler uma resposta antiga é arrastado
 * para baixo a cada token do stream — e não há como ler nada enquanto a Orb escreve.
 *
 * O hook é substituído por um controle do teste: aqui não se prova stream, se prova rolagem.
 */
const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));
vi.mock("@/hooks/useOrbChat", () => ({ useOrbChat: chatMock }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { user_metadata: {} } }) }));

const ALTURA_TOTAL = 1000;
const ALTURA_VISIVEL = 300;

const retry = vi.fn();
const editUserMessage = vi.fn();

function estado(messages: OrbMessage[]) {
  return {
    messages,
    isStreaming: false,
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    retry,
    editUserMessage,
  };
}

function fala(id: string, content: string): OrbMessage {
  return { id, role: id.startsWith("u") ? "user" : "assistant", content };
}

/**
 * O container rolável. jsdom não faz layout: `scrollHeight`/`clientHeight` valem 0 e toda conta de
 * "está no fim?" daria verdadeira por acidente. As duas viram números fixos aqui.
 */
function lista(container: HTMLElement): HTMLElement {
  const elemento = container.querySelector<HTMLElement>(".overflow-y-auto");
  if (!elemento) throw new Error("container rolável não encontrado");
  Object.defineProperty(elemento, "scrollHeight", { configurable: true, get: () => ALTURA_TOTAL });
  Object.defineProperty(elemento, "clientHeight", { configurable: true, get: () => ALTURA_VISIVEL });
  return elemento;
}

function renderizar(messages: OrbMessage[]) {
  chatMock.mockReturnValue(estado(messages));
  const utils = render(
    <MemoryRouter>
      <OrbChat />
    </MemoryRouter>
  );
  return {
    ...utils,
    /** Re-renderiza com a conversa crescida, como um token novo do stream faria. */
    crescer: (novas: OrbMessage[]) => {
      chatMock.mockReturnValue(estado(novas));
      utils.rerender(
        <MemoryRouter>
          <OrbChat />
        </MemoryRouter>
      );
    },
  };
}

beforeEach(() => {
  chatMock.mockReset();
  retry.mockReset();
  editUserMessage.mockReset();
});

describe("OrbChat — auto-rolagem", () => {
  it("desce sozinha quando o usuário já está no fim", async () => {
    const conversa = [fala("u1", "oi"), fala("a1", "olá")];
    const { container, crescer } = renderizar(conversa);
    const rolavel = lista(container);
    rolavel.scrollTop = ALTURA_TOTAL - ALTURA_VISIVEL;
    fireEvent.scroll(rolavel);

    crescer([...conversa, fala("a2", "mais texto")]);

    await waitFor(() => expect(rolavel.scrollTop).toBe(ALTURA_TOTAL));
  });

  it("NÃO desce quando o usuário subiu para reler", async () => {
    const conversa = [fala("u1", "oi"), fala("a1", "olá")];
    const { container, crescer } = renderizar(conversa);
    const rolavel = lista(container);

    // Usuário arrastou para o topo: `estaNoFim` tem que virar falso e destravar o botão de descer.
    rolavel.scrollTop = 0;
    fireEvent.scroll(rolavel);
    expect(await screen.findByRole("button", { name: /última mensagem/i })).toBeInTheDocument();

    crescer([...conversa, fala("a2", "mais texto")]);

    // A janela do throttle é de 50 ms e a rolagem de cauda é agendada dentro dela; esperar mais que
    // isso é o que impede o teste de passar só por chegar cedo demais.
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(rolavel.scrollTop).toBe(0);

    // Controle positivo: o mecanismo continua vivo. Sem isto, este teste passaria também num
    // componente que perdeu a auto-rolagem inteira.
    fireEvent.click(screen.getByRole("button", { name: /última mensagem/i }));
    await waitFor(() => expect(rolavel.scrollTop).toBe(ALTURA_TOTAL));
  });

  it("passa o retry do hook para a bolha, senão a resposta falha vira beco sem saída", async () => {
    renderizar([
      fala("u1", "e aí?"),
      { id: "a1", role: "assistant", content: "Não consegui.", failed: true },
    ]);

    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(retry).toHaveBeenCalledWith("a1");
  });

  it("passa a edição do hook para a pergunta — sem isso o botão não refaz o turno", async () => {
    const user = userEvent.setup();
    renderizar([fala("u1", "quanto gastei?"), fala("a1", "R$ 1.240,00.")]);

    await user.click(screen.getByRole("button", { name: /editar/i }));
    const campo = screen.getByRole("textbox", { name: /editar a pergunta/i });
    await user.clear(campo);
    await user.type(campo, "quanto recebi?{Enter}");

    expect(editUserMessage).toHaveBeenCalledWith("u1", "quanto recebi?");
  });
});
