import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { TaskDescriptionField } from "@/pages/admin/tasks/TaskDescriptionField";

/**
 * Checkbox de task-list clicável no preview (feature 070).
 *
 * A caixa só é clicável onde existe para onde escrever de volta (o editor da nota passa
 * `onToggleTask`); em todo preview de leitura ela continua desabilitada, como o `react-markdown` a
 * entrega. É essa fronteira que o arquivo guarda.
 */

const LISTA = ["- [ ] comprar pão", "- [x] pagar conta", "- [ ] ligar para a Ana"].join("\n");

function checkboxes(): HTMLInputElement[] {
  return screen.getAllByRole("checkbox") as HTMLInputElement[];
}

describe("MarkdownPreview — checkbox de tarefa", () => {
  it("sem `onToggleTask`, a caixa continua desabilitada", () => {
    render(<MarkdownPreview content={LISTA} />);

    const boxes = checkboxes();
    expect(boxes).toHaveLength(3);
    for (const box of boxes) expect(box).toBeDisabled();
    // O estado vem do markdown: a segunda está marcada porque está escrita `- [x]`.
    expect(boxes.map((b) => b.checked)).toEqual([false, true, false]);
  });

  it("com `onToggleTask`, clicar devolve o índice da caixa na ordem do documento", async () => {
    const user = userEvent.setup();
    const onToggleTask = vi.fn();
    render(<MarkdownPreview content={LISTA} onToggleTask={onToggleTask} />);

    const boxes = checkboxes();
    for (const box of boxes) expect(box).toBeEnabled();

    await user.click(boxes[2]);
    expect(onToggleTask).toHaveBeenCalledTimes(1);
    expect(onToggleTask).toHaveBeenCalledWith(2);

    await user.click(boxes[0]);
    expect(onToggleTask).toHaveBeenLastCalledWith(0);
  });

  it("caixa dentro de bloco de código não vira caixa clicável — nem caixa", () => {
    const onToggleTask = vi.fn();
    render(
      <MarkdownPreview
        content={["```md", "- [ ] exemplo", "```", "", "- [ ] de verdade"].join("\n")}
        onToggleTask={onToggleTask}
      />
    );
    // Só a de fora do fence existe no DOM — a numeração bate com a de `toggleTaskListItem`.
    expect(checkboxes()).toHaveLength(1);
  });

  it("cada caixa tem nome acessível próprio — clicar por leitor de tela é possível", () => {
    render(<MarkdownPreview content={LISTA} onToggleTask={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "Tarefa 1" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Tarefa 3" })).toBeInTheDocument();
  });

  it("em `TaskDescriptionField` (preview de leitura) a caixa segue desabilitada", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TaskDescriptionField value={LISTA} onChange={() => {}} />
      </MemoryRouter>
    );

    // O campo abre em modo de escrita; a prévia é a outra aba.
    await user.click(screen.getByRole("tab", { name: /Visualizar|Prévia|Preview/i }));
    for (const box of checkboxes()) expect(box).toBeDisabled();
  });
});
