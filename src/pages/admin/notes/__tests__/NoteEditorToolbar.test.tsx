import { describe, expect, it, vi } from "vitest";
import { useCallback, useRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Command, EditorView } from "@codemirror/view";
import { MarkdownCodeEditor } from "@/components/MarkdownCodeEditor";
import { NoteEditorToolbar } from "@/pages/admin/notes/NoteEditorToolbar";

/**
 * A barra de ferramentas do editor de nota (feature 070).
 *
 * O teste monta a barra **com um editor de verdade** e afirma o documento resultante de cada
 * clique: é o que prova que o botão faz a mesma coisa que o atalho, e não só que ele renderiza.
 */

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const viewRef = useRef<EditorView | null>(null);
  const run = useCallback((command: Command) => {
    const view = viewRef.current;
    if (view) command(view);
  }, []);
  const onCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
  }, []);

  return (
    <>
      <NoteEditorToolbar run={run} onInsertDiagram={() => setValue((v) => `${v}[diagrama]`)} />
      <MarkdownCodeEditor
        label="Conteúdo"
        value={value}
        onChange={setValue}
        onCreateEditor={onCreateEditor}
      />
      <output data-testid="doc">{JSON.stringify(value)}</output>
    </>
  );
}

function doc(): string {
  return JSON.parse(screen.getByTestId("doc").textContent ?? '""') as string;
}

/** Seleciona o documento inteiro no editor, como quem marca uma palavra antes de formatar. */
async function selectAll(user: ReturnType<typeof userEvent.setup>) {
  const field = screen.getByRole("textbox", { name: "Conteúdo" });
  await user.click(field);
  await user.keyboard("{Control>}a{/Control}");
}

describe("NoteEditorToolbar", () => {
  it("expõe os oito botões de formatação com nome acessível e o atalho no título", () => {
    render(<Harness />);
    const toolbar = screen.getByRole("toolbar", { name: "Formatação" });
    expect(toolbar).toBeInTheDocument();

    for (const label of [
      "Negrito",
      "Itálico",
      "Título",
      "Link",
      "Lista",
      "Tarefa",
      "Código",
      "Tabela",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Negrito" })).toHaveAttribute(
      "title",
      expect.stringContaining("B")
    );
  });

  it("Negrito, Itálico e Código envolvem a seleção com o marcador certo", async () => {
    const user = userEvent.setup();
    render(<Harness initial="texto" />);

    await selectAll(user);
    await user.click(screen.getByRole("button", { name: "Negrito" }));
    expect(doc()).toBe("**texto**");

    await selectAll(user);
    await user.click(screen.getByRole("button", { name: "Itálico" }));
    expect(doc()).toBe("_**texto**_");

    await selectAll(user);
    await user.click(screen.getByRole("button", { name: "Código" }));
    expect(doc()).toBe("`_**texto**_`");
  });

  it("Título vira `## `, e clicar de novo desfaz", async () => {
    const user = userEvent.setup();
    render(<Harness initial="Introducao" />);

    await selectAll(user);
    await user.click(screen.getByRole("button", { name: "Título" }));
    expect(doc()).toBe("## Introducao");

    await user.click(screen.getByRole("button", { name: "Título" }));
    expect(doc()).toBe("Introducao");
  });

  it("Link usa a seleção como rótulo", async () => {
    const user = userEvent.setup();
    render(<Harness initial="orbyva" />);

    await selectAll(user);
    await user.click(screen.getByRole("button", { name: "Link" }));
    expect(doc()).toBe("[orbyva]()");
  });

  it("Lista e Tarefa aplicam o marcador em todas as linhas selecionadas", async () => {
    const user = userEvent.setup();
    render(<Harness initial={"um\ndois"} />);

    await selectAll(user);
    await user.click(screen.getByRole("button", { name: "Lista" }));
    expect(doc()).toBe("- um\n- dois");

    await selectAll(user);
    await user.click(screen.getByRole("button", { name: "Tarefa" }));
    expect(doc()).toBe("- [ ] um\n- [ ] dois");
  });

  it("Tabela insere o esqueleto GFM em bloco próprio", async () => {
    const user = userEvent.setup();
    render(<Harness initial="paragrafo" />);

    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    await user.click(field);
    await user.keyboard("{Control>}{End}{/Control}");
    await user.click(screen.getByRole("button", { name: "Tabela" }));

    // Linha em branco antes: tabela grudada no parágrafo não é reconhecida pelo GFM.
    expect(doc()).toBe(
      "paragrafo\n\n| Coluna | Coluna |\n| --- | --- |\n|  |  |\n"
    );
  });

  it("Inserir diagrama continua disponível na barra", async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(<NoteEditorToolbar run={() => {}} onInsertDiagram={onInsert} />);

    await user.click(screen.getByRole("button", { name: /Inserir diagrama/ }));
    expect(onInsert).toHaveBeenCalledTimes(1);
  });
});
