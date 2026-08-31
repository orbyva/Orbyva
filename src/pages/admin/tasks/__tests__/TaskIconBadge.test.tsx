import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TASK_ICON_PRESETS, TaskIconBadge } from "@/pages/admin/tasks/TaskIconBadge";

/**
 * Cobre a exibição somente-leitura do ícone de tarefa (feature 035) — substitui o item "Teste
 * manual" que fechava a lista de tarefas por asserções reais de componente (Testing Library +
 * jsdom). `TaskIconBadge` é reutilizado em todas as visualizações (Lista, Kanban, Gantt, Agenda);
 * a cobertura de "aparece nas visualizações" fica em `TaskViews.test.tsx` (via `TaskQuickFields`),
 * aqui cobrimos a lógica de prioridade/fallback do componente isolado.
 */
describe("TaskIconBadge", () => {
  it("sem iconKey nem iconUrl, não renderiza nada", () => {
    const { container } = render(<TaskIconBadge iconKey={null} iconUrl={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("com iconUrl, renderiza uma <img> com a URL", () => {
    const { container } = render(
      <TaskIconBadge iconKey={null} iconUrl="https://cdn.example.com/icon.png" />
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://cdn.example.com/icon.png");
  });

  it("iconUrl tem prioridade sobre iconKey quando ambos estão presentes", () => {
    const { container } = render(
      <TaskIconBadge iconKey="flag" iconUrl="https://cdn.example.com/icon.png" />
    );
    expect(container.querySelector("img")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it.each(TASK_ICON_PRESETS)(
    'com iconKey="$key", renderiza o ícone lucide do preset ($label)',
    ({ key, label }) => {
      const { container } = render(<TaskIconBadge iconKey={key} iconUrl={null} />);
      expect(container.querySelector(`svg[aria-label="${label}"]`)).toBeInTheDocument();
    }
  );

  it("com iconKey desconhecido (preset inexistente), não renderiza nada", () => {
    const { container } = render(<TaskIconBadge iconKey="nao-existe" iconUrl={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
