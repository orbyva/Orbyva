import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskPriorityFlag } from "@/pages/admin/tasks/TaskPriorityField";

/**
 * Feature 082 — a bandeirinha passou a ser o **único** marcador do painel "Por prioridade" (o texto
 * "Média"/"Baixa"/"Sem prioridade" saiu da tela), então ela ganhou duas naturezas:
 *
 * - `"task"` (padrão): marcador de linha de tarefa — sem prioridade não desenha nada (comportamento
 *   antigo, preservado de propósito: bandeirinha vazada em toda linha vira ruído);
 * - `"band"`: marcador de cabeçalho de faixa — sem prioridade desenha uma bandeirinha **vazada**,
 *   senão o cabeçalho da faixa "sem prioridade" ficaria em branco.
 *
 * Em todos os casos o rótulo por extenso continua acessível: tirar o texto da tela não pode
 * significar tirar a informação de quem usa leitor de tela.
 */
describe("TaskPriorityFlag", () => {
  it("sem prioridade na variante de tarefa não renderiza nada", () => {
    const { container } = render(<TaskPriorityFlag priority={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText("Sem prioridade")).toBeNull();
  });

  it("sem prioridade em `undefined` também não renderiza na variante de tarefa", () => {
    const { container } = render(<TaskPriorityFlag priority={undefined} variant="task" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sem prioridade na variante de faixa renderiza a bandeirinha vazada", () => {
    render(<TaskPriorityFlag priority={null} variant="band" />);
    const flag = screen.getByLabelText("Sem prioridade");
    expect(flag).toBeInTheDocument();
    expect(flag.getAttribute("class")).toContain("text-muted-foreground/40");
    // Vazada = sem cor de prioridade nenhuma.
    expect(flag.getAttribute("class")).not.toMatch(/text-(red|amber|blue)-500/);
  });

  it.each([
    ["high" as const, "Prioridade alta", "text-red-500"],
    ["medium" as const, "Prioridade média", "text-amber-500"],
    ["low" as const, "Prioridade baixa", "text-blue-500"],
  ])("prioridade %s mantém cor e rótulo acessível nas duas variantes", (priority, label, color) => {
    const { unmount } = render(<TaskPriorityFlag priority={priority} />);
    expect(screen.getByLabelText(label).getAttribute("class")).toContain(color);
    unmount();

    render(<TaskPriorityFlag priority={priority} variant="band" />);
    expect(screen.getByLabelText(label).getAttribute("class")).toContain(color);
  });
});
