// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  cancelPendingTaskRef,
  clearPendingTaskRef,
  findPendingTaskRef,
  insertPendingTaskRef,
  pendingTaskRefs,
  registerPendingTaskRef,
  resolvePendingTaskRef,
} from "@/components/codemirror/taskRefPending";

/**
 * O `StateField` dos rótulos que esperam id (feature 104) — onde mora o risco da feature.
 *
 * A primeira metade roda contra `EditorState` puro: é ali que se prova que o intervalo anda com o
 * documento. A segunda monta um `EditorView` de verdade (daí o `@vitest-environment jsdom`),
 * porque inserir/resolver/cancelar despacham transações.
 */

const UUID = "11111111-1111-4111-8111-111111111111";

/** Documento com um intervalo já registrado em `[from, to)`. */
function withPending(doc: string, from: number, to: number, id = 1): EditorState {
  const state = EditorState.create({ doc, extensions: [pendingTaskRefs] });
  return state.update({ effects: registerPendingTaskRef.of({ id, from, to }) }).state;
}

const ranges = (state: EditorState) =>
  state.field(pendingTaskRefs).map(({ from, to }) => [from, to]);

describe("pendingTaskRefs — o intervalo acompanha o documento", () => {
  it("registra o intervalo pedido", () => {
    // "olá painel" — o rótulo "painel" ocupa [4, 10).
    expect(ranges(withPending("olá painel", 4, 10))).toEqual([[4, 10]]);
  });

  it("inserção ANTES do intervalo empurra os dois extremos", () => {
    const state = withPending("olá painel", 4, 10);
    const next = state.update({ changes: { from: 0, insert: "linha nova\n" } }).state;
    expect(next.doc.toString()).toBe("linha nova\nolá painel");
    expect(ranges(next)).toEqual([[15, 21]]);
    // E o texto sob o intervalo continua sendo o rótulo, não outra coisa.
    expect(next.sliceDoc(15, 21)).toBe("painel");
  });

  it("inserção DEPOIS do intervalo não mexe nele", () => {
    const state = withPending("olá painel", 4, 10);
    const next = state.update({ changes: { from: 10, insert: " de controle" } }).state;
    expect(ranges(next)).toEqual([[4, 10]]);
    expect(next.sliceDoc(4, 10)).toBe("painel");
  });

  it("digitar encostado na borda direita fica FORA do intervalo", () => {
    // É o caso real: a pessoa escolhe "Criar tarefa: painel" e continua escrevendo na hora.
    const state = withPending("olá painel", 4, 10);
    const next = state.update({ changes: { from: 10, insert: "x" } }).state;
    expect(ranges(next)).toEqual([[4, 10]]);
  });

  it("deleção antes do intervalo puxa os dois extremos", () => {
    const state = withPending("olá painel", 4, 10);
    const next = state.update({ changes: { from: 0, to: 4 } }).state;
    expect(next.doc.toString()).toBe("painel");
    expect(ranges(next)).toEqual([[0, 6]]);
  });

  it("apagar o texto do intervalo descarta o pedido em vez de apontar para o vazio", () => {
    const state = withPending("olá painel", 4, 10);
    const next = state.update({ changes: { from: 4, to: 10 } }).state;
    expect(next.doc.toString()).toBe("olá ");
    expect(ranges(next)).toEqual([]);
  });

  it("apagar a linha inteira também descarta", () => {
    const state = withPending("olá painel", 4, 10);
    const next = state.update({ changes: { from: 0, to: 10 } }).state;
    expect(ranges(next)).toEqual([]);
  });

  it("dois pedidos convivem e só o pedido limpo sai", () => {
    let state = withPending("aaa bbb", 0, 3, 1);
    state = state.update({ effects: registerPendingTaskRef.of({ id: 2, from: 4, to: 7 }) }).state;
    expect(state.field(pendingTaskRefs).map((p) => p.id)).toEqual([1, 2]);
    state = state.update({ effects: clearPendingTaskRef.of(1) }).state;
    expect(state.field(pendingTaskRefs).map((p) => p.id)).toEqual([2]);
    expect(ranges(state)).toEqual([[4, 7]]);
  });
});

// ---- com editor de verdade ---------------------------------------------------------------------

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function mountEditor(doc = "", pos = doc.length): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(pos),
      extensions: [pendingTaskRefs],
    }),
    parent: host,
  });
  return view;
}

describe("insertPendingTaskRef / resolvePendingTaskRef", () => {
  it("insere o rótulo como texto simples no lugar do gatilho e registra o intervalo", () => {
    const editor = mountEditor("nota: TASK->painel");
    const id = insertPendingTaskRef(editor, 6, 18, "painel");

    expect(editor.state.doc.toString()).toBe("nota: painel");
    expect(findPendingTaskRef(editor, id)).toEqual({ id, from: 6, to: 12 });
    // O cursor fica no fim do rótulo, pronto para continuar a frase.
    expect(editor.state.selection.main.head).toBe(12);
  });

  it("quando o id chega, o intervalo remapeado vira a marca da 103", () => {
    const editor = mountEditor("nota: TASK->painel");
    const id = insertPendingTaskRef(editor, 6, 18, "painel");
    // A pessoa continua escrevendo ANTES do rótulo enquanto a criação corre.
    editor.dispatch({ changes: { from: 0, insert: "titulo\n" } });

    expect(resolvePendingTaskRef(editor, id, UUID)).toBe(true);
    expect(editor.state.doc.toString()).toBe(
      `titulo\nnota: [painel](orbyva-task:${UUID})`
    );
    // Pedido resolvido some da lista — resolver duas vezes duplicaria a marca.
    expect(findPendingTaskRef(editor, id)).toBeNull();
    expect(resolvePendingTaskRef(editor, id, UUID)).toBe(false);
  });

  it("rótulo apagado antes do id chegar: resolver não escreve nada", () => {
    const editor = mountEditor("nota: TASK->painel");
    const id = insertPendingTaskRef(editor, 6, 18, "painel");
    editor.dispatch({ changes: { from: 6, to: 12 } });

    expect(resolvePendingTaskRef(editor, id, UUID)).toBe(false);
    expect(editor.state.doc.toString()).toBe("nota: ");
  });

  it("cancelar deixa o rótulo como texto simples — o que a pessoa escreveu não some", () => {
    const editor = mountEditor("nota: TASK->painel");
    const id = insertPendingTaskRef(editor, 6, 18, "painel");
    cancelPendingTaskRef(editor, id);

    expect(editor.state.doc.toString()).toBe("nota: painel");
    expect(findPendingTaskRef(editor, id)).toBeNull();
  });

  it("dois rótulos pendentes ao mesmo tempo resolvem cada um no seu lugar", () => {
    const editor = mountEditor("");
    const first = insertPendingTaskRef(editor, 0, 0, "um");
    editor.dispatch({ changes: { from: 2, insert: " e " } });
    const second = insertPendingTaskRef(editor, 5, 5, "dois");

    expect(editor.state.doc.toString()).toBe("um e dois");
    expect(resolvePendingTaskRef(editor, second, "22222222-2222-4222-8222-222222222222")).toBe(true);
    expect(resolvePendingTaskRef(editor, first, UUID)).toBe(true);
    expect(editor.state.doc.toString()).toBe(
      `[um](orbyva-task:${UUID}) e [dois](orbyva-task:22222222-2222-4222-8222-222222222222)`
    );
  });
});
