import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import {
  activeLineNumbers,
  buildLivePreviewDecorations,
} from "@/components/codemirror/livePreview";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";

/**
 * O live preview estilo Obsidian (feature 056). Testado no nível de `EditorState`: as decorações
 * são função pura do estado, então dá para afirmar exatamente **o que** ficou marcado e **o que**
 * ficou escondido, sem navegador e sem depender de geometria de layout.
 */

function stateFor(doc: string, cursor = 0): EditorState {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdownSupport],
  });
  // Garante a árvore de sintaxe inteira antes de ler as decorações (sem isso o parser poderia
  // parar no primeiro orçamento de tempo e o teste virar flaky).
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}

type Deco = { from: number; to: number; kind: "mark" | "replace"; class?: string };

function decorationsOf(doc: string, cursor = 0): Deco[] {
  const state = stateFor(doc, cursor);
  const set = buildLivePreviewDecorations(state);
  const found: Deco[] = [];
  set.between(0, state.doc.length, (from, to, value) => {
    const cls = (value.spec as { class?: string }).class;
    found.push({ from, to, kind: cls ? "mark" : "replace", class: cls });
  });
  return found;
}

/** Trechos do documento que o live preview esconde (a marcação). */
function hidden(doc: string, cursor = 0): string[] {
  return decorationsOf(doc, cursor)
    .filter((d) => d.kind === "replace")
    .map((d) => doc.slice(d.from, d.to));
}

/** Classes aplicadas, com o texto que cada uma cobre. */
function marked(doc: string, cursor = 0): [string, string][] {
  return decorationsOf(doc, cursor)
    .filter((d) => d.kind === "mark")
    .map((d) => [d.class ?? "", doc.slice(d.from, d.to)]);
}

describe("live preview — decorações", () => {
  it("marca negrito, itálico, riscado e código inline com a classe correspondente", () => {
    const doc = "**negrito** _itálico_ ~~riscado~~ `código`";
    // Cursor na última posição: linha ativa, então nada some — só as marcas de conteúdo.
    expect(marked(doc, doc.length)).toEqual([
      ["cm-md-strong", "**negrito**"],
      ["cm-md-em", "_itálico_"],
      ["cm-md-strike", "~~riscado~~"],
      ["cm-md-code", "`código`"],
    ]);
  });

  it("marca cada nível de título com a classe do nível", () => {
    const doc = "# um\n## dois\n### três";
    expect(marked(doc, 0).map(([cls]) => cls)).toEqual([
      "cm-md-h1",
      "cm-md-h2",
      "cm-md-h3",
    ]);
  });

  it("esconde os marcadores fora da linha do cursor", () => {
    const doc = "**negrito**\noutra linha";
    // Cursor na segunda linha.
    expect(hidden(doc, doc.length)).toEqual(["**", "**"]);
  });

  it("a marcação reaparece na linha onde está o cursor", () => {
    const doc = "**negrito**\noutra linha";
    // Cursor dentro da palavra em negrito (linha 1).
    expect(hidden(doc, 5)).toEqual([]);
  });

  it("esconde o `#` do título junto com o espaço que vem depois", () => {
    const doc = "# Título\ncorpo";
    // Cursor na linha 2.
    expect(hidden(doc, doc.length)).toEqual(["# "]);
  });

  it("com o cursor no título, o `#` volta a aparecer", () => {
    const doc = "# Título\ncorpo";
    expect(hidden(doc, 3)).toEqual([]);
  });

  it("com várias linhas, só a linha do cursor mantém a marcação visível", () => {
    const doc = "**um**\n**dois**\n**três**";
    // Cursor na linha 2 (posição dentro de "**dois**").
    const cursor = doc.indexOf("dois");
    const state = stateFor(doc, cursor);
    expect(activeLineNumbers(state)).toEqual(new Set([2]));
    // Linhas 1 e 3 escondem dois marcadores cada; a 2 não esconde nenhum.
    expect(hidden(doc, cursor)).toEqual(["**", "**", "**", "**"]);
  });

  it("uma seleção que cruza linhas mantém a marcação de todas elas visível", () => {
    const doc = "**um**\n**dois**\n**três**";
    const state = EditorState.create({
      doc,
      selection: { anchor: 2, head: doc.indexOf("dois") },
      extensions: [markdownSupport],
    });
    expect(activeLineNumbers(state)).toEqual(new Set([1, 2]));
  });

  it("não decora nada dentro de bloco de código cercado, nem esconde a cerca", () => {
    const doc = "```\n**não é negrito**\n```";
    // `**` dentro de fence é texto literal — nem vira negrito nem some.
    expect(marked(doc, doc.length)).toEqual([]);
    expect(hidden(doc, doc.length)).toEqual([]);
  });

  it("as decorações são view-only: o documento continua idêntico", () => {
    const doc = "# Título\n\n**negrito** com `código`";
    const state = stateFor(doc, doc.length);
    buildLivePreviewDecorations(state);
    // Nenhuma decoração toca o texto — é o contrato de "markdown na veia".
    expect(state.doc.toString()).toBe(doc);
  });
});
