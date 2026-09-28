import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ProjectPicker } from "@/pages/admin/tasks/ProjectPicker";
import { ProjectsRail } from "@/pages/admin/tasks/ProjectsRail";
import { PROJECT_FALLBACK_COLOR } from "@/lib/design-tokens";
import type { Project } from "@/types/tasks";

/**
 * As duas listas de seleção que continuaram com botão próprio na feature 111 (não viram
 * `ProjectPill`, porque selecionam em vez de identificar) — mas que trocaram o literal `#94a3b8`
 * pela constante. O que este arquivo garante é que a troca foi feita **no lugar certo**: a bolinha
 * de um projeto sem cor continua cinza, não some nem fica transparente.
 */

function makeProject(over: Partial<Project> = {}): Project {
  return { id: "p1", name: "Projeto Alpha", color: "#8b5cf6", status: "active", tag_ids: [], ...over };
}

const SEM_COR = makeProject({ id: "p2", name: "Projeto Sem Cor", color: null });

/** A bolinha de uma linha da lista: o único `span` com cor inline dentro do botão. */
function dotIn(row: HTMLElement): HTMLElement {
  const dot = row.querySelector<HTMLElement>('span[style*="background-color"]');
  if (!dot) throw new Error("bolinha não encontrada na linha");
  return dot;
}

describe("PROJECT_FALLBACK_COLOR nas listas de seleção de projeto", () => {
  it("ProjectPicker: projeto com cor usa a cor dele; projeto sem cor cai no fallback", () => {
    render(
      <ProjectPicker projects={[makeProject(), SEM_COR]} value={null} onChange={vi.fn()} />
    );

    const listbox = screen.getByRole("listbox", { name: "Projeto" });
    expect(dotIn(within(listbox).getByRole("option", { name: "Projeto Alpha" }))).toHaveStyle({
      backgroundColor: "#8b5cf6",
    });
    expect(dotIn(within(listbox).getByRole("option", { name: "Projeto Sem Cor" }))).toHaveStyle({
      backgroundColor: PROJECT_FALLBACK_COLOR,
    });
  });

  it("ProjectsRail: projeto com cor usa a cor dele; projeto sem cor cai no fallback", () => {
    render(
      <ProjectsRail projects={[makeProject(), SEM_COR]} activeProjectId="all" onSelect={vi.fn()} />
    );

    const rail = screen.getByRole("navigation", { name: "Filtrar por projeto" });
    expect(dotIn(within(rail).getByRole("button", { name: "Projeto Alpha" }))).toHaveStyle({
      backgroundColor: "#8b5cf6",
    });
    expect(dotIn(within(rail).getByRole("button", { name: "Projeto Sem Cor" }))).toHaveStyle({
      backgroundColor: PROJECT_FALLBACK_COLOR,
    });
  });
});
