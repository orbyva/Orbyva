import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrbActionCard } from "@/components/orb/OrbActionCard";
import type { OrbProposal } from "../../../../supabase/functions/_shared/orb/actions.ts";

/**
 * O que este arquivo protege é a regra que dá segurança à escrita da Orb: **nada vai para o banco
 * antes do clique**, e um clique não pode virar dois registros.
 */
const { executar } = vi.hoisted(() => ({ executar: vi.fn() }));
vi.mock("@/api/orbActions", () => ({ executeOrbProposal: executar }));

const PROPOSTA: OrbProposal = {
  kind: "task",
  label: "Nova tarefa",
  fields: [
    { label: "Tarefa", value: "Comprar cimento" },
    { label: "Prazo", value: "12/09/2026" },
  ],
  payload: { title: "Comprar cimento", due_date: "2026-09-12", status: "todo" },
};

function renderizar() {
  return render(
    <MemoryRouter>
      <OrbActionCard callId="call-1" proposal={PROPOSTA} />
    </MemoryRouter>
  );
}

describe("OrbActionCard", () => {
  beforeEach(() => {
    executar.mockReset();
    executar.mockResolvedValue({ message: "Tarefa criada.", link: "/tasks?q=Comprar" });
  });

  it("mostra cada campo antes de gravar e não grava sozinho", () => {
    renderizar();
    expect(screen.getByText("Comprar cimento")).toBeInTheDocument();
    expect(screen.getByText("12/09/2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar" })).toBeInTheDocument();
    expect(executar).not.toHaveBeenCalled();
  });

  it("grava no clique e troca o cartão pelo resultado", async () => {
    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(screen.getByText("Tarefa criada.")).toBeInTheDocument());
    expect(executar).toHaveBeenCalledWith(PROPOSTA);
    expect(screen.queryByRole("button", { name: "Criar" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ver" })).toHaveAttribute("href", "/tasks?q=Comprar");
  });

  it("não cria duas vezes com dois cliques", async () => {
    renderizar();
    const botao = screen.getByRole("button", { name: "Criar" });
    fireEvent.click(botao);
    fireEvent.click(botao);

    await waitFor(() => expect(screen.getByText("Tarefa criada.")).toBeInTheDocument());
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it("mostra a falha sem perder a proposta", async () => {
    executar.mockRejectedValue(new Error("Sem conexão."));
    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(screen.getByText("Sem conexão.")).toBeInTheDocument());
    // O botão continua ali: a pessoa tenta de novo sem repetir a conversa.
    expect(screen.getByRole("button", { name: "Criar" })).toBeInTheDocument();
  });

  it("descartar não grava nada", () => {
    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(executar).not.toHaveBeenCalled();
    expect(screen.getByText("Descartado.")).toBeInTheDocument();
  });
});
