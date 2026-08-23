// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { CompletionContext, currentCompletions } from "@codemirror/autocomplete";
import { autocompletion, completionStatus } from "@codemirror/autocomplete";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";
import {
  filterInsertItems,
  insertItemEdit,
  openInsertMenuEdit,
  slashMenuAutocomplete,
  slashMenuSource,
} from "@/components/codemirror/slashMenu";
import { createInsertItems } from "@/components/codemirror/insertItems";
import type { InsertItem } from "@/components/codemirror/insertItems";

/**
 * O menu `/` da 068.
 *
 * A maior parte é pura (gatilho, filtro, texto inserido, posição do cursor) e roda contra
 * `EditorState`. O fim do arquivo monta um `EditorView` de verdade — é onde fica provado que o
 * `Escape` fecha o menu **sem** inserir nada, que é comportamento do keymap do autocomplete e não
 * daria para afirmar olhando só a fonte. Daí o `@vitest-environment jsdom` no topo.
 */

const ITEMS = createInsertItems(new Date(2026, 7, 19));

function stateFor(doc: string, pos = doc.length): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(pos),
    extensions: [markdownSupport],
  });
}

/** Rótulos oferecidos com o cursor em `pos` — `null` quando o menu nem abre. */
function optionsAt(doc: string, pos = doc.length): string[] | null {
  const state = stateFor(doc, pos);
  const result = slashMenuSource(() => ITEMS)(new CompletionContext(state, pos, false));
  return result ? result.options.map((option) => String(option.label)) : null;
}

function item(id: string): InsertItem {
  const found = ITEMS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`item de inserção inexistente: ${id}`);
  return found;
}

/** Aplica um item como o autocomplete aplicaria: `from` é logo depois da `/`. */
function insert(doc: string, id: string, pos = doc.length) {
  const state = stateFor(doc, pos);
  const slash = doc.lastIndexOf("/", pos - 1);
  const next = state.update(insertItemEdit(state, item(id), slash + 1, pos)).state;
  return { doc: next.doc.toString(), cursor: next.selection.main.head };
}

describe("slashMenu — gatilho", () => {
  it("dispara em linha vazia", () => {
    expect(optionsAt("/")).not.toBeNull();
  });

  it("dispara depois de espaço numa linha em branco (indentação)", () => {
    expect(optionsAt("  /")).not.toBeNull();
    expect(optionsAt("\t/")).not.toBeNull();
  });

  it("dispara numa linha nova, com texto nas linhas de cima", () => {
    expect(optionsAt("# Reunião\n\n/")).not.toBeNull();
  });

  it("não dispara dentro de uma URL", () => {
    expect(optionsAt("veja http:/")).toBeNull();
    expect(optionsAt("veja http://")).toBeNull();
    expect(optionsAt("veja https://orbyva.app/")).toBeNull();
  });

  it("não dispara em `a/b` nem depois de texto na mesma linha", () => {
    expect(optionsAt("a/")).toBeNull();
    expect(optionsAt("src/lib/")).toBeNull();
    expect(optionsAt("e/ou")).toBeNull();
    expect(optionsAt("comprar cimento /")).toBeNull();
  });

  it("não dispara com espaço depois da barra (a consulta acabou)", () => {
    expect(optionsAt("/ ")).toBeNull();
  });
});

describe("slashMenu — filtro", () => {
  it("sem consulta, oferece o catálogo inteiro", () => {
    expect(optionsAt("/")).toHaveLength(ITEMS.length);
  });

  it("filtra por texto digitado", () => {
    expect(optionsAt("/tabela")).toEqual(["Tabela"]);
  });

  it("acha com e sem acento, e sem diferenciar caixa", () => {
    expect(optionsAt("/citacao")).toEqual(["Citação"]);
    expect(optionsAt("/citação")).toEqual(["Citação"]);
    expect(optionsAt("/CITACAO")).toEqual(["Citação"]);
  });

  it("acha por palavra-chave que não está no rótulo", () => {
    expect(optionsAt("/mermaid")).toEqual(["Diagrama"]);
    expect(optionsAt("/h1")).toEqual(["Título 1"]);
    expect(optionsAt("/latex")).toEqual(["Fórmula"]);
  });

  it("consulta sem resultado nenhum fecha o menu em vez de mostrar lista vazia", () => {
    expect(optionsAt("/xyzw")).toBeNull();
  });

  it("o filtro é o mesmo para quem usa a lista fora do editor", () => {
    expect(filterInsertItems(ITEMS, "callout").map((i) => i.label)).toEqual([
      "Callout: Nota",
      "Callout: Dica",
      "Callout: Importante",
      "Callout: Atenção",
      "Callout: Cuidado",
    ]);
  });
});

describe("slashMenu — inserção", () => {
  it("apaga a barra e a consulta digitada", () => {
    expect(insert("/titu", "titulo-1").doc).toBe("# ");
  });

  it("bloco de código deixa o cursor dentro da cerca", () => {
    const { doc, cursor } = insert("/ts", "codigo-ts");
    expect(doc).toBe("```ts\n\n```\n");
    expect(cursor).toBe("```ts\n".length);
    // O que vem depois do cursor é a linha em branco e a cerca de fechamento.
    expect(doc.slice(cursor)).toBe("\n```\n");
  });

  it("tabela deixa o cursor dentro da primeira célula do cabeçalho", () => {
    const { doc, cursor } = insert("/tab", "tabela");
    expect(doc.split("\n")[0]).toBe("|  |  |  |");
    expect(doc.slice(0, cursor)).toBe("| ");
  });

  it("callout entra com o gatilho do GitHub e o cursor no corpo", () => {
    const { doc, cursor } = insert("/aviso", "callout-warning");
    expect(doc).toBe("> [!WARNING]\n> ");
    expect(cursor).toBe(doc.length);
  });

  it("fórmula em bloco deixa o cursor entre os `$$`", () => {
    const { doc, cursor } = insert("/formula", "formula");
    expect(doc).toBe("$$\n\n$$\n");
    expect(cursor).toBe(3);
  });

  it("diagrama insere o esqueleto mermaid válido", () => {
    const { doc } = insert("/diagrama", "diagrama");
    expect(doc).toContain("```mermaid");
    expect(doc).toContain("graph TD");
  });

  it("wikilink deixa o cursor entre os colchetes, pronto para o autocomplete da 056", () => {
    const { doc, cursor } = insert("/nota", "wikilink");
    expect(doc).toBe("[[]]");
    expect(doc.slice(0, cursor)).toBe("[[");
  });

  it("data de hoje escreve a data local, não UTC", () => {
    expect(insert("/hoje", "data-hoje").doc).toBe("2026-08-19");
  });

  it("bloco logo abaixo de um parágrafo entra com linha em branco antes", () => {
    // Sem a linha em branco, `---` vira título setext do parágrafo de cima — o texto some.
    const { doc } = insert("texto do dia\n/linha", "linha");
    expect(doc).toBe("texto do dia\n\n---\n");
  });

  it("com linha em branco acima, não acrescenta outra", () => {
    expect(insert("texto\n\n/linha", "linha").doc).toBe("texto\n\n---\n");
  });

  it("item inline não ganha linha em branco nenhuma", () => {
    expect(insert("texto\n/hoje", "data-hoje").doc).toBe("texto\n2026-08-19");
  });

  it("insere na posição do cursor, não no fim do documento", () => {
    const doc = "# Fluxo\n\n/dia\n\nfim da nota";
    const pos = doc.indexOf("/dia") + "/dia".length;
    const { doc: next } = insert(doc, "diagrama", pos);
    expect(next.startsWith("# Fluxo\n\n```mermaid")).toBe(true);
    expect(next.endsWith("fim da nota")).toBe(true);
  });
});

describe("slashMenu — botão Inserir", () => {
  it("em linha em branco, só escreve a barra", () => {
    const state = stateFor("# Reunião\n\n");
    const next = state.update(openInsertMenuEdit(state)).state;
    expect(next.doc.toString()).toBe("# Reunião\n\n/");
  });

  it("no meio de uma linha com texto, quebra a linha antes (o gatilho exige linha em branco)", () => {
    const state = stateFor("comprar cimento");
    const next = state.update(openInsertMenuEdit(state)).state;
    expect(next.doc.toString()).toBe("comprar cimento\n/");
    // E a barra recém-escrita realmente abre o menu.
    expect(
      slashMenuSource(() => ITEMS)(
        new CompletionContext(next, next.selection.main.head, false)
      )
    ).not.toBeNull();
  });
});

// ---- com editor de verdade ---------------------------------------------------------------------

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function mountEditor(doc = ""): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [
        markdownSupport,
        autocompletion(),
        slashMenuAutocomplete(() => ITEMS),
      ],
    }),
    parent: host,
  });
  view.focus();
  return view;
}

async function typeSlash(editor: EditorView, text: string) {
  for (const char of text) {
    // `userEvent: "input.type"` é o que o autocomplete escuta para abrir sozinho — sem a anotação,
    // a transação é indistinguível de uma edição programática (colar do app, autosave) e o menu
    // não deve abrir mesmo.
    editor.dispatch({
      ...editor.state.replaceSelection(char),
      userEvent: "input.type",
    });
  }
  // O autocomplete calcula as sugestões fora do ciclo da transação.
  await new Promise((resolve) => setTimeout(resolve, 120));
}

describe("slashMenu — no editor", () => {
  it("digitar `/` abre o menu com o catálogo", async () => {
    const editor = mountEditor();
    await typeSlash(editor, "/");

    expect(completionStatus(editor.state)).toBe("active");
    expect(currentCompletions(editor.state).map((c) => String(c.label))).toContain(
      "Tabela"
    );
  });

  it("Escape fecha o menu sem inserir nada", async () => {
    const editor = mountEditor("# Nota\n\n");
    await typeSlash(editor, "/tabela");
    expect(completionStatus(editor.state)).toBe("active");

    editor.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );

    expect(completionStatus(editor.state)).toBeNull();
    // O documento continua com o que foi digitado — e sem nenhuma tabela.
    expect(editor.state.doc.toString()).toBe("# Nota\n\n/tabela");
  });
});
