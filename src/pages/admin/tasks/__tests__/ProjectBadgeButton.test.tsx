import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ProjectBadgeButton } from "@/pages/admin/tasks/ProjectBadgeButton";
import type { Project } from "@/types/tasks";

/**
 * O gatilho do popover depois de recomposto sobre o `ProjectPill` (feature 111): a refatoração não
 * pode mudar o que a tela mostra nem o que o clique faz. Sem Chrome no fluxo, é este arquivo que
 * prova as duas coisas — inclusive a que só apareceria como aviso no console do navegador
 * (`<button>` dentro de `<button>`).
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

function renderBadge(props: Partial<ComponentProps<typeof ProjectBadgeButton>> = {}) {
  return render(
    <MemoryRouter>
      <ProjectBadgeButton
        projects={[makeProject(), makeProject({ id: "p2", name: "Projeto Beta", color: "#3b82f6" })]}
        value="p1"
        onChange={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

describe("ProjectBadgeButton — recomposto sobre o ProjectPill", () => {
  it("mostra o nome e a bolinha na cor do projeto, como antes da refatoração", () => {
    const { container } = renderBadge();

    const trigger = screen.getByRole("button", { name: "Projeto Alpha" });
    const dot = within(trigger).getByText(
      (_, node) => node?.getAttribute("aria-hidden") === "true" && node.tagName === "SPAN"
    );
    expect(dot).toHaveStyle({ backgroundColor: "#22c55e" });
    // O hover do gatilho continua no pill, não some na troca de componente.
    expect(container.querySelector(".hover\\:bg-muted")).not.toBeNull();
  });

  it("o gatilho é o único elemento interativo — nada de <button>/<a> dentro do <button>", () => {
    renderBadge();

    const trigger = screen.getByRole("button", { name: "Projeto Alpha" });
    expect(trigger.querySelector("button,a")).toBeNull();
  });

  it("sem projeto, mostra 'Sem projeto' e continua abrindo o picker", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBadge({ value: null, onChange });

    await user.click(screen.getByRole("button", { name: "Sem projeto" }));
    const listbox = await screen.findByRole("listbox", { name: "Projeto" });
    await user.click(within(listbox).getByRole("option", { name: "Projeto Beta" }));

    expect(onChange).toHaveBeenCalledWith("p2");
  });
});
