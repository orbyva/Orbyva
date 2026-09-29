import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TaskDescriptionSnippet } from "@/pages/admin/tasks/TaskDescriptionSnippet";
import { invalidateNotesTitleIndex } from "@/hooks/useNotesTitleIndex";
import { invalidateTaskRefIndex } from "@/hooks/useTaskRefIndex";
import type { TaskRefSummary } from "@/types/tasks";

/**
 * A prévia de duas linhas do card (feature 105).
 *
 * O que estes testes protegem é a **ordem**: a referência de tarefa é segmentada antes do
 * `stripMarkdown`. Com a ordem invertida, `[Rótulo](orbyva-task:<id>)` vira a palavra "Rótulo" e o
 * id some — defeito silencioso, que só aparece olhando o card.
 */

const { fetchNotesMock, fetchTaskRefsMock } = vi.hoisted(() => ({
  fetchNotesMock: vi.fn(),
  fetchTaskRefsMock: vi.fn(),
}));

vi.mock("@/api/notes/notes", () => ({ fetchNotes: fetchNotesMock }));
vi.mock("@/api/tasks/taskRefs", () => ({ fetchTaskRefSummaries: fetchTaskRefsMock }));

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const GHOST_ID = "00000000-0000-0000-0000-000000000000";

function taskRow(over: Partial<TaskRefSummary> = {}): TaskRefSummary {
  return {
    id: TASK_ID,
    title: "Subir painel",
    status: "todo",
    due_date: "2026-09-25",
    ...over,
  };
}

function renderSnippet(description: string) {
  return render(
    <MemoryRouter>
      <TaskDescriptionSnippet description={description} />
    </MemoryRouter>
  );
}

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{`${pathname}${search}`}</div>;
}

describe("TaskDescriptionSnippet — referência de tarefa", () => {
  beforeEach(() => {
    invalidateNotesTitleIndex();
    invalidateTaskRefIndex();
    fetchNotesMock.mockReset();
    fetchNotesMock.mockResolvedValue([]);
    fetchTaskRefsMock.mockReset();
    fetchTaskRefsMock.mockResolvedValue([taskRow()]);
  });

  it("descrição com a marca mostra o chip com o título da tarefa", async () => {
    renderSnippet(`ver [rótulo velho](orbyva-task:${TASK_ID}) hoje`);

    const chip = await screen.findByRole("link", { name: /Subir painel/ });
    expect(chip).toHaveAttribute("href", `/tasks?task=${TASK_ID}`);
    expect(chip).toHaveTextContent("Subir painel");
    // Compacto: o prazo ficaria fora do espaço de `line-clamp-2`.
    expect(screen.queryByText("25/09/2026")).toBeNull();
  });

  it("descrição que é **só** a marca ainda vira chip (a prova da ordem)", async () => {
    // Com `stripMarkdown` rodando primeiro, sobraria o texto "Rótulo" e nenhum chip — é o bug que
    // esta feature existe para evitar.
    renderSnippet(`[Rótulo](orbyva-task:${TASK_ID})`);

    expect(await screen.findByRole("link", { name: /Subir painel/ })).toBeInTheDocument();
    expect(screen.queryByText("Rótulo")).toBeNull();
  });

  it("markdown em volta sai limpo e o chip fica no meio", async () => {
    renderSnippet(
      `## Contexto\n\n**negrito** e [subir](orbyva-task:${TASK_ID}) para sexta\n\n- item`
    );

    const chip = await screen.findByRole("link", { name: /Subir painel/ });
    const paragrafo = chip.closest("p");
    expect(paragrafo).not.toBeNull();
    // O negrito e o `##` somem (é o strip); o texto em volta do chip continua, com os espaços.
    expect(paragrafo?.textContent).toBe("Contexto negrito e Subir painel para sexta item");
    expect(paragrafo?.textContent).not.toContain("**");
    expect(paragrafo?.textContent).not.toContain("##");
  });

  it("`[[Nota]]` e marca de tarefa na mesma descrição mostram os dois", async () => {
    fetchNotesMock.mockResolvedValue([
      { id: "n7", title: "Obra da casa", content: "", project_id: null },
    ]);
    renderSnippet(`ver [[Obra da casa]] e [x](orbyva-task:${TASK_ID})`);

    await screen.findByRole("link", { name: /Subir painel/ });
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Obra da casa" })).toHaveAttribute(
        "href",
        "/notes/n7"
      );
    });
  });

  it("link markdown comum não vira chip — some no strip, como sempre foi", async () => {
    renderSnippet("veja o [Google](https://google.com) agora");

    await waitFor(() => {
      expect(screen.getByText(/Google/)).toBeInTheDocument();
    });
    expect(screen.queryByRole("link")).toBeNull();
    expect(fetchTaskRefsMock).not.toHaveBeenCalled();
  });

  it("tarefa apagada vira selo de referência removida, com o rótulo do texto", async () => {
    fetchTaskRefsMock.mockResolvedValue([]);
    renderSnippet(`depende de [subir painel](orbyva-task:${GHOST_ID})`);

    const selo = await screen.findByRole("note", { name: /não existe mais/ });
    expect(selo).toHaveTextContent("subir painel");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("descrição vazia continua devolvendo null", async () => {
    const { container } = renderSnippet("");
    // O `await` é pelo índice de notas, que resolve num microtask — sem ele o React reclama de
    // update fora de `act`. A afirmação é a mesma: nada foi renderizado.
    await waitFor(() => expect(fetchNotesMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(fetchTaskRefsMock).not.toHaveBeenCalled();
  });

  it("descrição só com markdown que o strip apaga também devolve null", async () => {
    const { container } = renderSnippet("   \n\n  ");
    await waitFor(() => expect(fetchNotesMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("clicar no chip abre a tarefa referenciada, não o card de trás", async () => {
    const user = userEvent.setup();
    const onCardClick = vi.fn();

    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <Routes>
          <Route
            path="/tasks"
            element={
              <div onClick={onCardClick} onPointerDown={onCardClick}>
                <TaskDescriptionSnippet description={`ver [x](orbyva-task:${TASK_ID})`} />
                <LocationProbe />
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole("link", { name: /Subir painel/ }));

    // O card inteiro é clicável por baixo: sem o `stopPropagation` isto abriria o formulário da
    // tarefa que **contém** o texto.
    expect(onCardClick).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent(`/tasks?task=${TASK_ID}`);
  });

  it("duas marcas na mesma descrição resolvem numa consulta só", async () => {
    const OTHER = "22222222-2222-4222-8222-222222222222";
    fetchTaskRefsMock.mockResolvedValue([
      taskRow(),
      { id: OTHER, title: "Revisar contrato", status: "done", due_date: null },
    ]);
    renderSnippet(`[a](orbyva-task:${TASK_ID}) e [b](orbyva-task:${OTHER})`);

    await screen.findByRole("link", { name: /Subir painel/ });
    expect(screen.getByRole("link", { name: /Revisar contrato/ })).toBeInTheDocument();
    expect(fetchTaskRefsMock).toHaveBeenCalledTimes(1);
    expect(fetchTaskRefsMock).toHaveBeenCalledWith([TASK_ID, OTHER]);
  });

  it("a prévia continua com `line-clamp-2` e o chip é inline, não bloco", async () => {
    renderSnippet(`ver [x](orbyva-task:${TASK_ID}) hoje`);

    const chip = await screen.findByRole("link", { name: /Subir painel/ });
    expect(chip.closest("p")?.className).toContain("line-clamp-2");
    // Bloco quebraria a linha e a prévia de duas linhas mostraria só o chip.
    expect(chip.className).toContain("inline-flex");
    expect(chip.className).toContain("align-baseline");
  });
});
