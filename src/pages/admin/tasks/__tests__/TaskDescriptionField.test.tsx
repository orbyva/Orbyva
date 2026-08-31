import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskDescriptionField } from "@/pages/admin/tasks/TaskDescriptionField";

/**
 * A feature 055 extraiu o Markdown daqui para `MarkdownPreview`/`MarkdownTextarea`, compartilhados
 * com o editor de notas. Este teste é a rede que prova que a descrição de tarefa continua se
 * comportando igual depois da extração — não só que compila.
 */

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TaskDescriptionField value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("TaskDescriptionField (depois da extração do Markdown)", () => {
  it("escrever no textarea propaga o valor pra cima", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("textbox"), "comprar cimento");
    expect(screen.getByTestId("value")).toHaveTextContent("comprar cimento");
  });

  it("a aba Visualizar renderiza o Markdown — título, lista, negrito, link e tabela", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          "# Reforma",
          "",
          "- item **importante**",
          "- [site](https://exemplo.com)",
          "",
          "| a | b |",
          "| - | - |",
          "| 1 | 2 |",
        ].join("\n")}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));

    expect(screen.getByRole("heading", { name: /Reforma/ })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("importante").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "site" })).toHaveAttribute(
      "href",
      "https://exemplo.com"
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("aba Visualizar sem conteúdo mostra o aviso, não um preview vazio", async () => {
    const user = userEvent.setup();
    render(<Harness initial="   " />);

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    expect(screen.getByText("Nada para visualizar ainda.")).toBeInTheDocument();
  });

  it("HTML cru NÃO é interpretado — sem rehype-raw, por decisão de segurança da 055", async () => {
    const user = userEvent.setup();
    render(<Harness initial={'<img src=x onerror="alert(1)"> <b>bold?</b>'} />);

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    const preview = within(screen.getByRole("tabpanel"));
    expect(preview.queryByRole("img")).toBeNull();
    expect(screen.getByRole("tabpanel").querySelector("b")).toBeNull();
    // O texto aparece escapado, como texto — que é exatamente o comportamento desejado.
    expect(preview.getByText(/bold\?/)).toBeInTheDocument();
  });

  it("Tab indenta com \\t dentro do campo em vez de mover o foco", () => {
    render(<Harness initial="linha" />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    textarea.setSelectionRange(5, 5);
    fireEvent.keyDown(textarea, { key: "Tab" });

    expect(screen.getByTestId("value")).toHaveTextContent("linha");
    expect(textarea.value).toBe("linha\t");
  });

  it("Shift+Tab remove o \\t imediatamente antes do cursor", () => {
    render(<Harness initial={"linha\t"} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    textarea.setSelectionRange(6, 6);
    fireEvent.keyDown(textarea, { key: "Tab", shiftKey: true });

    expect(textarea.value).toBe("linha");
  });

  it("Shift+Tab sem \\t antes do cursor não apaga caractere nenhum", () => {
    render(<Harness initial="linha" />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    textarea.setSelectionRange(5, 5);
    fireEvent.keyDown(textarea, { key: "Tab", shiftKey: true });

    expect(textarea.value).toBe("linha");
  });
});
