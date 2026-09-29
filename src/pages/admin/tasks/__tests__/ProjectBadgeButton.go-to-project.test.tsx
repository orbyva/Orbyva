import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ProjectBadgeButton } from "@/pages/admin/tasks/ProjectBadgeButton";
import type { Project } from "@/types/tasks";

/**
 * Feature 113 — "Ir para o projeto" no pill **editável**.
 *
 * O pill editável não podia virar link (perderia a troca de projeto em 1 clique da Lista, do Kanban
 * e do Gantt — features 029/033), então o destino entrou como primeiro item **dentro** do popover.
 * Sem Chrome no fluxo, é este arquivo que prova as quatro coisas que só se veriam no navegador: o
 * item existe com o `href` certo, some quando não há projeto, fecha o popover ao ser clicado, e nem
 * ele nem o gatilho disparam o clique da linha que vive por baixo.
 */

function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Projeto Alpha",
    color: "#22c55e",
    status: "active",
    tag_ids: [],
    ...over,
  };
}

const TWO_PROJECTS = [
  makeProject(),
  makeProject({ id: "p2", name: "Projeto Beta", color: "#3b82f6" }),
];

/** Fica **fora** do `Routes` de propósito: o pill precisa sobreviver à navegação para que o popover
 * fechado prove `setOpen(false)`, e não a desmontagem da rota inteira. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderBadge(props: Partial<ComponentProps<typeof ProjectBadgeButton>> = {}) {
  return render(
    <MemoryRouter initialEntries={["/tasks"]}>
      <ProjectBadgeButton projects={TWO_PROJECTS} value="p1" onChange={vi.fn()} {...props} />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("ProjectBadgeButton — 'Ir para o projeto' no popover", () => {
  it("(a) com projeto selecionado, abrir o popover mostra o item como <a> para o projeto", async () => {
    const user = userEvent.setup();
    renderBadge();

    await user.click(screen.getByRole("button", { name: "Projeto Alpha" }));

    const link = await screen.findByRole("link", { name: "Ir para o projeto" });
    expect(link).toHaveAttribute("href", "/tasks/projects/p1");
  });

  it("(a') o item é o primeiro filho do popover — acima da busca e do picker", async () => {
    const user = userEvent.setup();
    // 16 projetos passam o `PROJECT_SEARCH_THRESHOLD` (15) e ligam o campo de busca.
    const many = Array.from({ length: 16 }, (_, i) =>
      makeProject({ id: `p${i + 1}`, name: `Projeto ${i + 1}` })
    );
    renderBadge({ projects: many, value: "p1" });

    await user.click(screen.getByRole("button", { name: "Projeto 1" }));

    const link = await screen.findByRole("link", { name: "Ir para o projeto" });
    const search = screen.getByRole("textbox", { name: "Buscar projeto" });
    const picker = screen.getByRole("listbox", { name: "Projeto" });
    // `DOCUMENT_POSITION_FOLLOWING` = o nó comparado vem **depois** do link no documento.
    expect(link.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("(b) sem projeto (`value={null}`), o item não aparece — nem com href nulo", async () => {
    const user = userEvent.setup();
    renderBadge({ value: null });

    await user.click(screen.getByRole("button", { name: "Sem projeto" }));

    // O popover abriu mesmo: o picker está lá.
    expect(await screen.findByRole("listbox", { name: "Projeto" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ir para o projeto" })).toBeNull();
    expect(document.querySelector('a[href*="/tasks/projects/"]')).toBeNull();
  });

  it("id órfão não oferece navegação para um projeto que não existe", async () => {
    const user = userEvent.setup();
    renderBadge({ value: "projeto-removido" });

    await user.click(screen.getByRole("button", { name: "Sem projeto" }));

    expect(await screen.findByRole("listbox", { name: "Projeto" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ir para o projeto" })).toBeNull();
  });

  it("(c) escolher outro projeto no picker continua chamando onChange com o id certo", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBadge({ onChange });

    await user.click(screen.getByRole("button", { name: "Projeto Alpha" }));
    const listbox = await screen.findByRole("listbox", { name: "Projeto" });
    await user.click(within(listbox).getByRole("option", { name: "Projeto Beta" }));

    expect(onChange).toHaveBeenCalledWith("p2");
    // A troca **não** navega: o pill editável segue sendo picker, não link.
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks");
  });

  it("(d) clicar no item navega e fecha o popover — o picker some do documento", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBadge({ onChange });

    await user.click(screen.getByRole("button", { name: "Projeto Alpha" }));
    await user.click(await screen.findByRole("link", { name: "Ir para o projeto" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/tasks/projects/p1");
    expect(screen.queryByRole("listbox", { name: "Projeto" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ir para o projeto" })).toBeNull();
    // Navegar não é trocar de projeto.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("abrir o popover e usá-lo a partir de uma linha clicável não dispara o clique da linha", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onChange = vi.fn();

    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        {/* Na Lista, no Kanban e no Gantt o pill vive dentro de uma linha que abre a tarefa. O
            `PopoverContent` é portalado para o body, mas o evento sintético do React sobe pela
            árvore de componentes assim mesmo — por isso o `stopPropagation` de lá importa. */}
        <div onClick={onRowClick}>
          <ProjectBadgeButton projects={TWO_PROJECTS} value="p1" onChange={onChange} />
        </div>
        <LocationProbe />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Projeto Alpha" }));
    expect(await screen.findByRole("listbox", { name: "Projeto" })).toBeInTheDocument();
    expect(onRowClick).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("link", { name: "Ir para o projeto" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/tasks/projects/p1");
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
