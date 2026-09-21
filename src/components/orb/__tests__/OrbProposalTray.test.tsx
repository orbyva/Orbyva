import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrbActionCard } from "@/components/orb/OrbActionCard";
import OrbProposalTray from "@/components/orb/OrbProposalTray";
import { OrbProvider } from "@/hooks/useOrb";
import type { OrbMessage, OrbToolCall } from "@/types/orb";
import type { OrbProposal } from "../../../../supabase/functions/_shared/orb/actions.ts";

/**
 * O tray é a única porta de confirmação fora da `/orb` (feature 100, Onda 5). O que este arquivo
 * protege: ele aparece quando a conversa tem proposta esperando, SOME quando ela é criada ou
 * descartada, não aparece na `/orb` (lá o balão já mostra o mesmo cartão) e um clique não vira dois
 * registros.
 *
 * Roda com o `OrbProvider` de verdade (só o `useOrbChat` é falso): quem decide o que está pendente é
 * a derivação do provider, e testá-la com um contexto de mentira seria testar o dublê.
 */
const { chatMock, executar } = vi.hoisted(() => ({ chatMock: vi.fn(), executar: vi.fn() }));
vi.mock("@/hooks/useOrbChat", () => ({ useOrbChat: chatMock }));
vi.mock("@/api/orbActions", () => ({ executeOrbProposal: executar }));

const PROPOSTA: OrbProposal = {
  kind: "task",
  label: "Nova tarefa",
  fields: [{ label: "Tarefa", value: "Comprar cimento" }],
  payload: { title: "Comprar cimento", status: "todo" },
};

/** Uma chamada de `propose_create` como o SSE a entrega. */
function chamada(overrides: Partial<OrbToolCall> = {}): OrbToolCall {
  return {
    id: "call-1",
    name: "propose_create",
    status: "ok",
    summary: { ...PROPOSTA, status: "aguardando_confirmacao" },
    ...overrides,
  };
}

function conversa(tools: OrbToolCall[]): OrbMessage[] {
  return [
    { id: "m-1", role: "user", content: "cria uma tarefa de comprar cimento" },
    { id: "m-2", role: "assistant", content: "Preparei aqui, é só confirmar.", tools },
  ];
}

const REGIAO = { name: "Criação proposta pela Orb" };

function renderizar({ tools = [chamada()], rota = "/tasks" } = {}) {
  chatMock.mockReturnValue({
    messages: conversa(tools),
    isStreaming: false,
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    retry: vi.fn(),
    editUserMessage: vi.fn(),
  });
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <OrbProvider>
        <OrbProposalTray />
      </OrbProvider>
    </MemoryRouter>
  );
}

describe("OrbProposalTray", () => {
  beforeEach(() => {
    chatMock.mockReset();
    executar.mockReset();
    executar.mockResolvedValue({ message: "Tarefa criada.", link: "/tasks?q=Comprar" });
  });

  it("mostra o cartão da proposta por cima de qualquer página", () => {
    renderizar();
    expect(screen.getByRole("region", REGIAO)).toBeInTheDocument();
    expect(screen.getByText("A Orb preparou uma criação")).toBeInTheDocument();
    expect(screen.getByText("Comprar cimento")).toBeInTheDocument();
    // Nada vai para o banco só por ter aparecido.
    expect(executar).not.toHaveBeenCalled();
  });

  it("some depois de criar", async () => {
    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(screen.queryByRole("region", REGIAO)).toBeNull());
    // O `summary` inteiro vai para a gravação (inclusive o `status` que a tool acrescenta); quem
    // reduz para a whitelist é `executeOrbProposal`, do outro lado.
    expect(executar).toHaveBeenCalledWith(expect.objectContaining(PROPOSTA));
  });

  it("some ao descartar, sem gravar nada", () => {
    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.queryByRole("region", REGIAO)).toBeNull();
    expect(executar).not.toHaveBeenCalled();
  });

  it("grava uma vez só, mesmo com dois cliques", async () => {
    renderizar();
    const botao = screen.getByRole("button", { name: "Criar" });
    fireEvent.click(botao);
    fireEvent.click(botao);

    await waitFor(() => expect(screen.queryByRole("region", REGIAO)).toBeNull());
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it("não aparece na /orb, onde o balão da conversa já mostra o mesmo cartão", () => {
    renderizar({ rota: "/orb" });
    expect(screen.queryByRole("region", REGIAO)).toBeNull();
    expect(screen.queryByRole("button", { name: "Criar" })).toBeNull();
  });

  it("ignora chamada que falhou e resultado que não é proposta", () => {
    renderizar({
      tools: [
        chamada({ id: "call-erro", status: "error", summary: { error: "faltou categoria" } }),
        // `summary` truncado pelo teto do SSE: o cartão só ofereceria um botão que falha no clique.
        chamada({ id: "call-cortada", summary: { truncated: true } }),
      ],
    });
    expect(screen.queryByRole("region", REGIAO)).toBeNull();
  });

  it("substitui a proposta anterior quando a pessoa pede um ajuste", () => {
    // O caso real: "cria uma tarefa…" e, na mensagem seguinte, "com prazo para sexta". A tool não
    // edita — o modelo repropõe a tarefa inteira. Dois cartões iguais fariam a pessoa confirmar o de
    // cima e gravar justamente a versão SEM o prazo.
    renderizar({
      tools: [
        chamada(),
        chamada({
          id: "call-2",
          summary: {
            ...PROPOSTA,
            fields: [
              { label: "Tarefa", value: "Comprar cimento" },
              { label: "Prazo", value: "18/09/2026" },
            ],
            payload: { title: "Comprar cimento", status: "todo", due_date: "2026-09-18" },
          },
        }),
      ],
    });

    expect(screen.getByText("A Orb preparou uma criação")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Criar" })).toHaveLength(1);
    expect(screen.getByText("18/09/2026")).toBeInTheDocument();
  });

  it("não confunde duas criações diferentes do mesmo tipo", () => {
    renderizar({
      tools: [
        chamada(),
        chamada({
          id: "call-2",
          summary: {
            ...PROPOSTA,
            fields: [{ label: "Tarefa", value: "Pintar a parede" }],
            payload: { title: "Pintar a parede", status: "todo" },
          },
        }),
      ],
    });
    expect(screen.getByText("A Orb preparou 2 criações")).toBeInTheDocument();
  });

  it("anuncia quantas propostas esperam quando vem mais de uma", () => {
    renderizar({
      tools: [
        chamada(),
        chamada({
          id: "call-2",
          summary: {
            kind: "note",
            label: "Nova nota",
            fields: [{ label: "Nota", value: "Ideias" }],
            payload: { title: "Ideias" },
          },
        }),
      ],
    });
    expect(screen.getByText("A Orb preparou 2 criações")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Criar" })).toHaveLength(2);
  });
});

/**
 * Na `/orb` o cartão antigo continua no histórico da conversa — é o registro do que foi pedido. O
 * botão "Criar" dele, porém, gravaria a versão SEM o ajuste que a pessoa acabou de pedir.
 */
describe("OrbActionCard substituído na conversa", () => {
  it("desarma o cartão antigo quando existe uma versão mais nova", () => {
    chatMock.mockReturnValue({
      messages: conversa([
        chamada(),
        chamada({
          id: "call-2",
          summary: {
            ...PROPOSTA,
            payload: { title: "Comprar cimento", status: "todo", due_date: "2026-09-18" },
          },
        }),
      ]),
      isStreaming: false,
      send: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
      retry: vi.fn(),
      editUserMessage: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/orb"]}>
        <OrbProvider>
          <OrbActionCard callId="call-1" proposal={PROPOSTA} />
          <OrbActionCard
            callId="call-2"
            proposal={{
              ...PROPOSTA,
              payload: { title: "Comprar cimento", status: "todo", due_date: "2026-09-18" },
            }}
          />
        </OrbProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/Substituída por uma versão mais nova/)).toBeInTheDocument();
    // Só a versão atual ainda oferece o botão.
    expect(screen.getAllByRole("button", { name: "Criar" })).toHaveLength(1);
  });
});
