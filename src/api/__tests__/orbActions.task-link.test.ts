import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrbProposal } from "../../../supabase/functions/_shared/orb/actions.ts";

/**
 * Feature 102 — o "de brinde" do pedido: agora que `/tasks?task=<id>` existe, o cartão de "Tarefa
 * criada" da Orb passa a linkar o DESTINO, não uma busca por título.
 *
 * O link por título abria a tarefa errada sempre que o título se repetia — e recorrência
 * materializa dezenas de tarefas com o mesmo nome, então "se repetia" era o caso comum.
 */

const { createTask } = vi.hoisted(() => ({ createTask: vi.fn() }));

vi.mock("@/api/tasks", () => ({
  createTask,
  createProject: vi.fn(),
  createProjectEvent: vi.fn(),
}));
vi.mock("@/api/notes/notes", () => ({ createNote: vi.fn() }));
vi.mock("@/api/shopping/items", () => ({ createShoppingItem: vi.fn() }));
vi.mock("@/api/finance/transactions", () => ({ createTransactionApi: vi.fn() }));

const { executeOrbProposal } = await import("@/api/orbActions");

const TITULO = "Regar as plantas";
const ID = "6f1c2d3a-4b5e-4c7d-8e9f-0a1b2c3d4e5f";

const proposta: OrbProposal = {
  kind: "task",
  label: "Nova tarefa",
  fields: [{ label: "Título", value: TITULO }],
  payload: { title: TITULO },
};

beforeEach(() => {
  createTask.mockReset();
});

describe("executeOrbProposal — link do cartão de tarefa (feature 102)", () => {
  it("linka pelo id da tarefa criada, não pelo título", async () => {
    createTask.mockResolvedValue({ id: ID, title: TITULO });

    const resultado = await executeOrbProposal(proposta);

    expect(resultado.message).toBe("Tarefa criada.");
    expect(resultado.link).toBe(`/tasks?task=${ID}`);
    // O sintoma antigo: `/tasks?q=Regar%20as%20plantas`.
    expect(resultado.link).not.toContain("q=");
  });

  it("usa o id devolvido pelo banco mesmo quando duas tarefas têm o mesmo título", async () => {
    createTask.mockResolvedValue({ id: "outra-ocorrencia", title: TITULO });

    const resultado = await executeOrbProposal(proposta);

    expect(resultado.link).toBe("/tasks?task=outra-ocorrencia");
  });
});
