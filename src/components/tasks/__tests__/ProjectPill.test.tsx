import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ProjectPill } from "@/components/tasks/ProjectPill";
import { PROJECT_FALLBACK_COLOR } from "@/lib/design-tokens";
import type { Project } from "@/types/tasks";

/**
 * O pill de projeto compartilhado (feature 111). Como Chrome é proibido no fluxo da esteira, estes
 * testes são a única prova de que a bolinha sai na cor certa, de que o pill vira link quando (e só
 * quando) recebe `to`, e de que ele nunca vira elemento interativo por dentro de outro.
 */

function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Projeto Alpha",
    color: "#ff6600",
    status: "active",
    tag_ids: [],
    ...over,
  };
}

/** Mostra a rota atual, para o teste de clique provar que a navegação aconteceu. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/**
 * A bolinha: o `span` decorativo (`aria-hidden`) de dentro do pill. Não dá para procurar por
 * `.rounded-full` — o próprio `Badge` é redondo e seria o primeiro a casar.
 */
function dotOf(container: HTMLElement): HTMLElement {
  const dot = container.querySelector<HTMLElement>('span[aria-hidden="true"]');
  if (!dot) throw new Error("bolinha do pill não encontrada");
  expect(dot.className).toContain("rounded-full");
  return dot;
}

describe("ProjectPill", () => {
  it("(a) pinta a bolinha com a cor do projeto", () => {
    const { container } = render(
      <MemoryRouter>
        <ProjectPill project={makeProject({ color: "#ff6600" })} />
      </MemoryRouter>
    );

    expect(screen.getByText("Projeto Alpha")).toBeInTheDocument();
    expect(dotOf(container)).toHaveStyle({ backgroundColor: "#ff6600" });
  });

  it("(b) projeto sem cor cai em PROJECT_FALLBACK_COLOR, não em bolinha transparente", () => {
    const { container } = render(
      <MemoryRouter>
        <ProjectPill project={makeProject({ color: null })} />
      </MemoryRouter>
    );

    const dot = dotOf(container);
    expect(dot).toHaveStyle({ backgroundColor: PROJECT_FALLBACK_COLOR });
    // Blindagem contra "fallback existe mas é vazio": a cor tem de estar mesmo no style inline.
    expect(dot.style.backgroundColor).not.toBe("");
  });

  it("(c) sem projeto mostra 'Sem projeto' em cinza — e ainda assim um pill, com bolinha", () => {
    const { container } = render(
      <MemoryRouter>
        <ProjectPill project={null} />
      </MemoryRouter>
    );

    const label = screen.getByText("Sem projeto");
    expect(label).toBeInTheDocument();
    expect(label.className).toContain("text-muted-foreground");
    expect(dotOf(container)).toHaveStyle({ backgroundColor: PROJECT_FALLBACK_COLOR });
  });

  it("(c') `emptyLabel` substitui o texto padrão de 'sem projeto'", () => {
    render(
      <MemoryRouter>
        <ProjectPill project={null} emptyLabel="Nenhum projeto" />
      </MemoryRouter>
    );

    expect(screen.getByText("Nenhum projeto")).toBeInTheDocument();
    expect(screen.queryByText("Sem projeto")).toBeNull();
  });

  it("(d) com `to`, o pill é um <a> apontando para o projeto", () => {
    render(
      <MemoryRouter>
        <ProjectPill project={makeProject()} to="/tasks/projects/p1" />
      </MemoryRouter>
    );

    const link = screen.getByRole("link", { name: /Projeto Alpha/ });
    expect(link).toHaveAttribute("href", "/tasks/projects/p1");
  });

  it("com `to`, o clique navega para o projeto sem disparar o clique da linha de trás", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();

    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <Routes>
          <Route
            path="/tasks"
            element={
              // Na Lista e no Kanban a linha inteira é clicável por baixo do pill.
              <div onClick={onRowClick}>
                <ProjectPill project={makeProject()} to="/tasks/projects/p1" />
                <LocationProbe />
              </div>
            }
          />
          <Route path="/tasks/projects/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("link", { name: /Projeto Alpha/ }));

    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks/projects/p1");
  });

  it("(e) sem `to` não existe <a> nem <button> no componente", () => {
    const { container } = render(
      <MemoryRouter>
        <ProjectPill project={makeProject()} />
      </MemoryRouter>
    );

    // `<button>` dentro do gatilho do popover (`ProjectBadgeButton`) é markup inválido: o pill de
    // leitura tem de continuar sendo um `<span>` puro.
    expect(container.querySelector("a,button")).toBeNull();
  });

  it("não cria link morto quando recebe destino para um projeto que não foi resolvido", () => {
    const { container } = render(
      <MemoryRouter>
        <ProjectPill project={null} to="/tasks/projects/removido" />
      </MemoryRouter>
    );

    expect(screen.getByText("Sem projeto")).toBeInTheDocument();
    expect(container.querySelector("a")).toBeNull();
  });
});
