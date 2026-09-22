// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";
import {
  taskRefClickTarget,
  taskRefDecorations,
  taskRefNavigation,
} from "@/components/codemirror/taskRefNavigation";

/**
 * A marca de tarefa clicável no editor (feature 104).
 *
 * A regra do clique é pura (`taskRefClickTarget`) porque `posAtCoords` depende de layout de
 * verdade, que jsdom não tem — mesmo caminho de `livePreview.ts`. O fim do arquivo monta um
 * `EditorView` e dispara um `pointerdown` real com a posição injetada: é o que prova que o handler
 * está em `pointerdown` e não em `click` (o trap de foco do Dialog do Radix engole o `click`).
 */

const UUID = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";
const MARK = `[Revisão](orbyva-task:${UUID})`;

const left = { button: 0, altKey: false };

function decorations(doc: string): Array<[number, number, string | undefined]> {
  const found: Array<[number, number, string | undefined]> = [];
  taskRefDecorations(doc).between(0, doc.length, (from, to, value) => {
    found.push([from, to, (value.spec as { class?: string }).class]);
  });
  return found;
}

describe("taskRefDecorations", () => {
  it("decora a marca inteira, do colchete ao parêntese", () => {
    const doc = `ver ${MARK} hoje`;
    expect(decorations(doc)).toEqual([[4, 4 + MARK.length, "cm-task-ref"]]);
    expect(doc.slice(4, 4 + MARK.length)).toBe(MARK);
  });

  it("decora as duas marcas quando a mesma tarefa aparece duas vezes", () => {
    const doc = `${MARK} e ${MARK}`;
    expect(decorations(doc)).toHaveLength(2);
  });

  it("NÃO decora dentro de bloco de código nem de código inline (herda do parser da 103)", () => {
    expect(decorations(["```", MARK, "```"].join("\n"))).toEqual([]);
    expect(decorations(`exemplo: \`${MARK}\``)).toEqual([]);
  });

  it("NÃO decora link markdown comum nem esquema desconhecido", () => {
    expect(decorations("[docs](https://exemplo.com)")).toEqual([]);
    expect(decorations(`[x](orbyva-projeto:${UUID})`)).toEqual([]);
  });
});

describe("taskRefClickTarget", () => {
  const doc = `ver ${MARK} hoje`;

  it("clique simples sobre a marca devolve o id e o rótulo", () => {
    const target = taskRefClickTarget(doc, 8, left);
    expect(target?.id).toBe(UUID);
    expect(target?.label).toBe("Revisão");
  });

  it("Alt+clique NÃO navega — é como se edita o rótulo à mão", () => {
    expect(taskRefClickTarget(doc, 8, { button: 0, altKey: true })).toBeNull();
  });

  it("botão que não é o esquerdo NÃO navega", () => {
    expect(taskRefClickTarget(doc, 8, { button: 2, altKey: false })).toBeNull();
    expect(taskRefClickTarget(doc, 8, { button: 1, altKey: false })).toBeNull();
  });

  it("clique fora de qualquer marca não faz nada", () => {
    expect(taskRefClickTarget(doc, 1, left)).toBeNull();
    expect(taskRefClickTarget(doc, doc.length, left)).toBeNull();
    expect(taskRefClickTarget("texto sem marca", 3, left)).toBeNull();
  });

  it("sem posição (clique fora da área de texto) não faz nada", () => {
    expect(taskRefClickTarget(doc, null, left)).toBeNull();
  });

  it("marca dentro de bloco de código não é clicável", () => {
    const fenced = ["```", MARK, "```"].join("\n");
    expect(taskRefClickTarget(fenced, 10, left)).toBeNull();
  });

  it("com duas marcas, o clique acha a que está sob o cursor", () => {
    const dois = `${MARK} e [Outra](orbyva-task:${OUTRO})`;
    expect(taskRefClickTarget(dois, 2, left)?.id).toBe(UUID);
    expect(taskRefClickTarget(dois, MARK.length + 5, left)?.id).toBe(OUTRO);
  });
});

// ---- com editor de verdade ----------------------------------------------------------------------

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

/** Editor com a extensão montada e `posAtCoords` fixado — jsdom não tem geometria. */
function mountEditor(doc: string, pos: number | null, onOpen: (id: string, label: string) => void) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdownSupport, taskRefNavigation({ onOpen })],
    }),
    parent: host,
  });
  // jsdom não tem geometria: `posAtCoords` devolveria sempre `null`. O cast é por causa da
  // sobrecarga (`precise: false` promete `number`), que um stub simples não consegue satisfazer.
  view.posAtCoords = (() => pos) as EditorView["posAtCoords"];
  return view;
}

function firePointerDown(editor: EditorView, init: MouseEventInit = {}) {
  const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, ...init });
  editor.contentDOM.dispatchEvent(event);
  return event;
}

describe("taskRefNavigation — no editor", () => {
  it("o `pointerdown` sobre a marca abre a tarefa e engole o evento", () => {
    const onOpen = vi.fn();
    const editor = mountEditor(`ver ${MARK}`, 8, onOpen);

    const event = firePointerDown(editor);

    expect(onOpen).toHaveBeenCalledWith(UUID, "Revisão");
    // `preventDefault` + `stopPropagation`: sem isso o Dialog que hospeda o editor recebe o clique.
    expect(event.defaultPrevented).toBe(true);
  });

  it("Alt+`pointerdown` deixa o evento passar, sem navegar", () => {
    const onOpen = vi.fn();
    const editor = mountEditor(`ver ${MARK}`, 8, onOpen);

    const event = firePointerDown(editor, { altKey: true });

    expect(onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("o `click` NÃO é o gatilho — quem navega é o `pointerdown`", () => {
    const onOpen = vi.fn();
    const editor = mountEditor(`ver ${MARK}`, 8, onOpen);

    editor.contentDOM.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("clique fora de marca nenhuma não abre nada", () => {
    const onOpen = vi.fn();
    const editor = mountEditor("texto comum", 3, onOpen);

    const event = firePointerDown(editor);

    expect(onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
