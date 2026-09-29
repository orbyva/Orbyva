import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  invalidateTaskRefIndex,
  lookupTaskRef,
  useTaskRefIndex,
} from "@/hooks/useTaskRefIndex";
import type { TaskRefSummary } from "@/types/tasks";

/**
 * A resolução em lote da feature 105 — o que impede "uma consulta por chip na tela".
 *
 * O que prova o lote é a **contagem de chamadas** de `fetchTaskRefSummaries`, não o resultado: dois
 * ids na mesma tela têm de sair numa consulta só.
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@/api/tasks/taskRefs", () => ({ fetchTaskRefSummaries: fetchMock }));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const GHOST = "00000000-0000-0000-0000-000000000000";

function summary(id: string, title: string): TaskRefSummary {
  return { id, title, status: "todo", due_date: null };
}

/** Uma sonda por hook: o texto mostra o que o mapa resolveu, um id por linha. */
function Probe({ ids, testId = "probe" }: { ids: string[]; testId?: string }) {
  const index = useTaskRefIndex(ids);
  return (
    <span data-testid={testId}>
      {ids.map((id) => `${id}=${lookupTaskRef(index, id)?.title ?? "-"}`).join("|")}
    </span>
  );
}

describe("useTaskRefIndex", () => {
  beforeEach(() => {
    invalidateTaskRefIndex();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue([]);
  });

  it("dois ids citados resolvem numa chamada só", async () => {
    fetchMock.mockResolvedValue([summary(A, "Revisar contrato"), summary(B, "Subir painel")]);

    render(<Probe ids={[A, B]} />);

    await waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent(
        `${A}=Revisar contrato|${B}=Subir painel`
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith([A, B]);
  });

  it("dois componentes montados juntos também saem numa consulta só", async () => {
    fetchMock.mockResolvedValue([summary(A, "Revisar contrato"), summary(B, "Subir painel")]);

    render(
      <>
        <Probe ids={[A]} testId="p1" />
        <Probe ids={[B]} testId="p2" />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId("p1")).toHaveTextContent(`${A}=Revisar contrato`);
    });
    expect(screen.getByTestId("p2")).toHaveTextContent(`${B}=Subir painel`);
    // É o caso da lista de tarefas: 2 cards, 2 ids, 1 consulta.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith([A, B]);
  });

  it("id inexistente fica fora do mapa, sem lançar", async () => {
    fetchMock.mockResolvedValue([summary(A, "Revisar contrato")]);

    render(<Probe ids={[A, GHOST]} />);

    await waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent(`${A}=Revisar contrato|${GHOST}=-`);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("id que já voltou sem resposta não é perguntado de novo", async () => {
    render(<Probe ids={[GHOST]} testId="p1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    render(<Probe ids={[GHOST]} testId="p2" />);
    await waitFor(() => expect(screen.getByTestId("p2")).toHaveTextContent(`${GHOST}=-`));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lista de ids vazia não dispara consulta nenhuma", async () => {
    render(<Probe ids={[]} />);
    await waitFor(() => expect(screen.getByTestId("probe")).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a lista de ids mudando refaz a resolução com o id novo", async () => {
    fetchMock.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => summary(id, id === A ? "Revisar contrato" : "Subir painel")))
    );

    const { rerender } = render(<Probe ids={[A]} />);
    await waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent(`${A}=Revisar contrato`);
    });

    rerender(<Probe ids={[A, B]} />);
    await waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent(
        `${A}=Revisar contrato|${B}=Subir painel`
      );
    });
    // A segunda consulta pede **só** o id novo — o que já estava resolvido não volta pela rede.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith([B]);
  });

  it("id escrito em caixa diferente resolve para a mesma tarefa", async () => {
    fetchMock.mockResolvedValue([summary(A, "Revisar contrato")]);

    render(<Probe ids={[A.toUpperCase()]} />);

    await waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent(
        `${A.toUpperCase()}=Revisar contrato`
      );
    });
    expect(fetchMock).toHaveBeenCalledWith([A]);
  });

  it("falha de rede deixa o mapa vazio, sem lançar, e permite nova tentativa", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error("sem rede"));

    render(<Probe ids={[A]} testId="p1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("p1")).toHaveTextContent(`${A}=-`);

    // Queda momentânea não pode virar "referência removida" permanente: o id continua pendente.
    fetchMock.mockResolvedValue([summary(A, "Revisar contrato")]);
    render(<Probe ids={[A]} testId="p2" />);
    await waitFor(() => {
      expect(screen.getByTestId("p2")).toHaveTextContent(`${A}=Revisar contrato`);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});
