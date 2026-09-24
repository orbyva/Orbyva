import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { OrbMessageBubble } from "@/components/orb/OrbMessageBubble";
import type { OrbMessage } from "@/types/orb";

function resposta(patch: Partial<OrbMessage> = {}): OrbMessage {
  return { id: "m1", role: "assistant", content: "Você gastou R$ 1.240 com alimentação.", ...patch };
}

function pergunta(patch: Partial<OrbMessage> = {}): OrbMessage {
  return { id: "u1", role: "user", content: "quanto gastei em setembro?", ...patch };
}

function renderizar(message: OrbMessage, onRetry?: (id: string) => void) {
  return render(
    <MemoryRouter>
      <OrbMessageBubble message={message} onRetry={onRetry} />
    </MemoryRouter>
  );
}

function renderizarPergunta(
  onEdit?: (id: string, texto: string) => void,
  patch: Partial<OrbMessage> = {},
  isStreaming = false
) {
  return render(
    <MemoryRouter>
      <OrbMessageBubble message={pergunta(patch)} onEdit={onEdit} isStreaming={isStreaming} />
    </MemoryRouter>
  );
}

describe("OrbMessageBubble", () => {
  it("mostra um cartão por chamada, sem agrupar duas chamadas da mesma tool", () => {
    renderizar(
      resposta({
        tools: [
          { id: "a", name: "query_spend_by_category", status: "ok" },
          { id: "b", name: "query_spend_by_category", status: "ok" },
        ],
      })
    );

    const cartoes = screen
      .getAllByRole("button")
      .filter((botao) => botao.getAttribute("aria-expanded") !== null);
    expect(cartoes).toHaveLength(2);
  });

  it("mostra contexto e cache no rodapé quando o turno reportou uso", () => {
    renderizar(
      resposta({
        usage: { input_tokens: 12_400, cache_read_input_tokens: 9800, rounds: 3 },
      })
    );

    expect(screen.getByText(/≈ 12,4 mil tokens de contexto/)).toBeInTheDocument();
    expect(screen.getByText(/9,8 mil vindos do cache/)).toBeInTheDocument();
    expect(screen.getByText(/3 rodadas/)).toBeInTheDocument();
  });

  it("não mostra rodapé de uso enquanto o turno está em stream", () => {
    renderizar(resposta({ pending: true, usage: { input_tokens: 12_400 } }));
    expect(screen.queryByText(/tokens de contexto/)).not.toBeInTheDocument();
  });

  it("oferece tentar de novo na resposta que falhou, sem pintar de vermelho a interrompida", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = renderizar(
      resposta({
        failed: true,
        content: "Consultei o mês e...\n\nNão consegui terminar agora.",
      }),
      onRetry
    );

    // O texto parcial que a Orb chegou a escrever continua legível — o erro não pode apagá-lo.
    expect(screen.getByText(/Consultei o mês/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(onRetry).toHaveBeenCalledWith("m1");

    // Só `failed` recebe a moldura vermelha; a interrompida abaixo não.
    expect(container.querySelector(".border-destructive\\/40")).not.toBeNull();
  });

  it("não pinta de vermelho a resposta apenas interrompida", () => {
    const { container } = renderizar(
      resposta({ interrupted: true, content: "Resposta interrompida." }),
      vi.fn()
    );
    expect(container.querySelector(".border-destructive\\/40")).toBeNull();
  });

  it("oferece tentar de novo também na resposta interrompida", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderizar(resposta({ interrupted: true, content: "Resposta interrompida." }), onRetry);

    await user.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(onRetry).toHaveBeenCalledWith("m1");
  });

  it("troca o botão por 'Entrar de novo' quando o erro foi de sessão", () => {
    const onRetry = vi.fn();
    renderizar(
      resposta({ failed: true, errorKind: "session", content: "Sessão expirada." }),
      onRetry
    );

    expect(screen.queryByRole("button", { name: /tentar de novo/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /entrar de novo/i })).toHaveAttribute("href", "/login");
  });

  it("copia a resposta e confirma no botão", async () => {
    const user = userEvent.setup();
    renderizar(resposta());

    await user.click(screen.getByRole("button", { name: /copiar/i }));

    expect(await navigator.clipboard.readText()).toBe("Você gastou R$ 1.240 com alimentação.");
    expect(await screen.findByRole("button", { name: /copiado/i })).toBeInTheDocument();
  });
});

/**
 * A pergunta já enviada é editável (tarefa 3.3 da 099): o hook trunca a conversa dali para frente e
 * reenvia. O que este bloco protege é que o botão exista, que ele mande o texto NOVO, e que cancelar
 * (ou salvar sem mudar nada) não gaste um turno apagando as respostas que estão na tela.
 */
describe("OrbMessageBubble — editar a pergunta", () => {
  it("edita e reenvia com o texto novo", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderizarPergunta(onEdit);

    await user.click(screen.getByRole("button", { name: /editar/i }));
    const campo = screen.getByRole("textbox", { name: /editar a pergunta/i });
    expect(campo).toHaveValue("quanto gastei em setembro?");

    await user.clear(campo);
    await user.type(campo, "quanto gastei em agosto?");
    await user.click(screen.getByRole("button", { name: /salvar e enviar/i }));

    expect(onEdit).toHaveBeenCalledWith("u1", "quanto gastei em agosto?");
    // Editor fechou: a bolha volta a ser texto.
    expect(screen.queryByRole("textbox", { name: /editar a pergunta/i })).not.toBeInTheDocument();
  });

  it("avisa que o que veio depois será descartado antes do clique", async () => {
    const user = userEvent.setup();
    renderizarPergunta(vi.fn());

    await user.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByText(/o que veio depois desta pergunta é descartado/i)).toBeInTheDocument();
  });

  it("Enter salva e Shift+Enter só quebra linha", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderizarPergunta(onEdit);

    await user.click(screen.getByRole("button", { name: /editar/i }));
    const campo = screen.getByRole("textbox", { name: /editar a pergunta/i });
    await user.type(campo, " e em agosto?{Shift>}{Enter}{/Shift}por categoria");
    expect(onEdit).not.toHaveBeenCalled();

    await user.type(campo, "{Enter}");
    expect(onEdit).toHaveBeenCalledWith(
      "u1",
      "quanto gastei em setembro? e em agosto?\npor categoria"
    );
  });

  it("cancelar e Esc fecham o editor sem reenviar nada", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderizarPergunta(onEdit);

    await user.click(screen.getByRole("button", { name: /editar/i }));
    await user.type(screen.getByRole("textbox", { name: /editar a pergunta/i }), " por categoria");
    await user.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onEdit).not.toHaveBeenCalled();

    // Reabrir traz o texto da conversa, não o rascunho abandonado.
    await user.click(screen.getByRole("button", { name: /editar/i }));
    const campo = screen.getByRole("textbox", { name: /editar a pergunta/i });
    expect(campo).toHaveValue("quanto gastei em setembro?");

    await user.type(campo, " mesmo?{Escape}");
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: /editar a pergunta/i })).not.toBeInTheDocument();
  });

  it("salvar sem mudar o texto não gasta um turno", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderizarPergunta(onEdit);

    await user.click(screen.getByRole("button", { name: /editar/i }));
    await user.click(screen.getByRole("button", { name: /salvar e enviar/i }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText("quanto gastei em setembro?")).toBeInTheDocument();
  });

  it("não oferece editar enquanto a Orb responde, nem sem o callback", () => {
    const { unmount } = renderizarPergunta(vi.fn(), {}, true);
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    unmount();

    renderizarPergunta(undefined);
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    // Copiar continua valendo na pergunta mesmo sem edição.
    expect(screen.getByRole("button", { name: /copiar/i })).toBeInTheDocument();
  });

  it("mostra o cartão Criar quando propose_create deu certo", () => {
    renderizar(
      resposta({
        tools: [
          {
            id: "c1",
            name: "propose_create",
            status: "ok",
            summary: {
              kind: "event",
              label: "Novo evento",
              fields: [
                { label: "Evento", value: "Jogo do Flamengo" },
                { label: "Quando", value: "27/09/2026 às 09:00" },
              ],
              payload: {
                title: "Jogo do Flamengo",
                starts_at: "2026-09-27T12:00:00.000Z",
              },
              status: "aguardando_confirmacao",
              note: "Nada foi gravado.",
            },
          },
        ],
      })
    );

    expect(screen.getByRole("button", { name: /^Criar$/i })).toBeInTheDocument();
    expect(screen.getByText("Jogo do Flamengo")).toBeInTheDocument();
  });

  it("mostra o erro da criação fora da barra amarela colapsada", () => {
    renderizar(
      resposta({
        tools: [
          {
            id: "c1",
            name: "propose_create",
            status: "error",
            summary: {
              error: 'Para criar novo evento falta "date". Pergunte ao usuário e chame de novo.',
              code: "input_invalido",
            },
          },
        ],
      })
    );

    expect(screen.getByText(/falta "date"/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Criar$/i })).not.toBeInTheDocument();
  });
});
