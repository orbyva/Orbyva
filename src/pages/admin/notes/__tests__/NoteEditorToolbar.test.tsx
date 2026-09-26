import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { NoteEditorToolbar } from "@/pages/admin/notes/NoteEditorToolbar";

/**
 * A barra de formatação (feature 068) contra um `EditorView` **de verdade** — não um duplo.
 *
 * O que precisa ficar provado é a ponte: clicar no botão muda o documento do CodeMirror do jeito
 * que o comando manda. Com um duplo, o teste provaria só que o `onClick` chama alguma coisa.
 */

let view: EditorView | null = null;

function mountEditor(doc: string, selection?: { anchor: number; head: number }) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: selection
        ? EditorSelection.range(selection.anchor, selection.head)
        : EditorSelection.cursor(doc.length),
    }),
    parent: host,
  });
  return view;
}

afterEach(() => {
  view?.destroy();
  view = null;
});

function renderToolbar(onInsert = vi.fn()) {
  render(<NoteEditorToolbar getView={() => view} onInsert={onInsert} />);
  return onInsert;
}

describe("NoteEditorToolbar", () => {
  it("clicar em Negrito envolve a seleção no documento do editor", async () => {
    const user = userEvent.setup();
    const editor = mountEditor("prazo curto", { anchor: 0, head: 5 });
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Negrito" }));

    expect(editor.state.doc.toString()).toBe("**prazo** curto");
  });

  it("clicar em Checklist e depois em Citação troca o marcador em vez de empilhar", async () => {
    const user = userEvent.setup();
    const editor = mountEditor("comprar cimento");
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Checklist" }));
    expect(editor.state.doc.toString()).toBe("- [ ] comprar cimento");

    await user.click(screen.getByRole("button", { name: "Citação" }));
    expect(editor.state.doc.toString()).toBe("> comprar cimento");
  });

  it("cada botão anuncia o atalho no `title`, quando existe atalho", () => {
    mountEditor("");
    renderToolbar();

    // O texto do atalho vem do `shortcutLabel`, que muda de símbolo em macOS.
    expect(screen.getByRole("button", { name: "Negrito" }).title).toMatch(
      /^Negrito \((Ctrl\+B|⌘B)\)$/
    );
    // Lista não tem atalho (não está na Decisão da feature): o `title` é só o nome.
    expect(screen.getByRole("button", { name: "Lista" }).title).toBe("Lista");
  });

  it('"Inserir" não edita o documento sozinho — ele abre o menu', async () => {
    const user = userEvent.setup();
    const editor = mountEditor("texto");
    const onInsert = renderToolbar();

    await user.click(screen.getByRole("button", { name: /Inserir/ }));

    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(editor.state.doc.toString()).toBe("texto");
  });

  it("sem editor montado, clicar não quebra (a aba Visualizar desmonta o CodeMirror)", async () => {
    const user = userEvent.setup();
    render(<NoteEditorToolbar getView={() => null} onInsert={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Negrito" }));

    expect(screen.getByRole("toolbar", { name: "Formatação" })).toBeInTheDocument();
  });
});
