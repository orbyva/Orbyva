import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TaskRefChip } from "@/components/tasks/TaskRefChip";
import type { TaskRefSummary } from "@/types/tasks";

/**
 * As quatro aparências do chip da feature 105 (com prazo, sem prazo, concluída, removida) e o
 * cuidado do clique. Substitui a conferência no navegador, que a skill `next` proíbe.
 */

const ID = "11111111-1111-4111-8111-111111111111";

function task(over: Partial<TaskRefSummary> = {}): TaskRefSummary {
  return {
    id: ID,
    title: "Revisar contrato",
    status: "todo",
    due_date: null,
    ...over,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

describe("TaskRefChip", () => {
  it("tarefa aberta com prazo mostra título e prazo, e leva para /tasks?task=<id>", () => {
    render(
      <MemoryRouter>
        <TaskRefChip id={ID} label="rótulo velho" task={task({ due_date: "2026-09-25" })} />
      </MemoryRouter>
    );

    const link = screen.getByRole("link", { name: /Revisar contrato/ });
    expect(link).toHaveAttribute("href", `/tasks?task=${ID}`);
    // O título vem do índice resolvido, **não** do rótulo escrito no texto — senão renomear a
    // tarefa deixaria o texto mentindo.
    expect(link).toHaveTextContent("Revisar contrato");
    expect(link).not.toHaveTextContent("rótulo velho");
    expect(screen.getByText("25/09/2026")).toBeInTheDocument();
  });

  it("tarefa aberta sem prazo não mostra rótulo de prazo vazio", () => {
    render(
      <MemoryRouter>
        <TaskRefChip id={ID} task={task()} />
      </MemoryRouter>
    );

    const link = screen.getByRole("link", { name: /Revisar contrato/ });
    expect(link).toHaveTextContent("Revisar contrato");
    // Nada de "—", "/" ou espaço sobrando de um prazo que não existe.
    expect(link.textContent).toBe("Revisar contrato");
    expect(screen.queryByText("—")).toBeNull();
  });

  it("tarefa concluída sai com o título em traço", () => {
    render(
      <MemoryRouter>
        <TaskRefChip id={ID} task={task({ status: "done" })} />
      </MemoryRouter>
    );

    const title = screen.getByText("Revisar contrato");
    expect(title.className).toContain("line-through");
    expect(screen.getByRole("link", { name: /Feito/ })).toBeInTheDocument();
  });

  it("`compact` esconde o prazo e mantém o título", () => {
    render(
      <MemoryRouter>
        <TaskRefChip id={ID} task={task({ due_date: "2026-09-25" })} compact />
      </MemoryRouter>
    );

    expect(screen.getByText("Revisar contrato")).toBeInTheDocument();
    // O espaço do card é de `line-clamp-2`: o prazo empurraria o texto para fora.
    expect(screen.queryByText("25/09/2026")).toBeNull();
    // Mas quem usa leitor de tela continua ouvindo o prazo.
    expect(screen.getByRole("link", { name: /prazo 25\/09\/2026/ })).toBeInTheDocument();
  });

  it("referência removida não renderiza link e anuncia a ausência, com o rótulo do texto", () => {
    render(
      <MemoryRouter>
        <TaskRefChip id={ID} label="subir painel" task={null} />
      </MemoryRouter>
    );

    expect(screen.queryByRole("link")).toBeNull();
    const selo = screen.getByRole("note", { name: /não existe mais/ });
    expect(selo).toHaveTextContent("subir painel");
  });

  it("referência removida sem rótulo no texto ainda diz o que é", () => {
    render(
      <MemoryRouter>
        <TaskRefChip id={ID} label="" task={null} />
      </MemoryRouter>
    );

    expect(screen.getByRole("note", { name: /não existe mais/ })).toHaveTextContent("Tarefa");
  });

  it("o clique navega para a tarefa referenciada e não borbulha para o card de trás", async () => {
    const user = userEvent.setup();
    const onCardClick = vi.fn();

    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <Routes>
          <Route
            path="/tasks"
            element={
              // O card inteiro é clicável por baixo (é assim na lista de tarefas).
              <div onClick={onCardClick} onPointerDown={onCardClick}>
                <TaskRefChip id={ID} task={task()} />
                <LocationProbe />
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("link", { name: /Revisar contrato/ }));

    expect(onCardClick).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent(`/tasks?task=${ID}`);
  });

  it("Ctrl/Cmd+clique deixa o href nativo agir, sem navegar por dentro", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <Routes>
          <Route
            path="/tasks"
            element={
              <>
                <TaskRefChip id={ID} task={task()} />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("link", { name: /Revisar contrato/ }));
    await user.keyboard("{/Meta}");

    // A rota não mudou: quem abre a nova aba é o navegador, pelo href.
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks");
    expect(screen.getByTestId("location").textContent).not.toContain("?task=");
  });
});
