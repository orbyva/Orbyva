import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import {
  headingEdit,
  inlineMarkEdit,
  linePrefixEdit,
  linkEdit,
  snippetEdit,
} from "@/components/codemirror/markdownCommands";
import type {
  HeadingLevel,
  InlineMark,
  LinePrefixKind,
} from "@/components/codemirror/markdownCommands";

/**
 * Os comandos de formatação da 068, testados no nível de `EditorState` — sem DOM, sem navegador.
 *
 * A notação dos casos usa marcadores no próprio texto: `|` é o cursor e `«…»` é a seleção. É o que
 * deixa o teste legível ("`**|**`" é literalmente o que está na tela) e o que permite afirmar
 * **onde** o cursor parou, que é metade do comportamento de um comando de formatação.
 */

const CURSOR = "|";
const SEL_OPEN = "«";
const SEL_CLOSE = "»";

/** Texto anotado → estado com a seleção posta onde os marcadores indicavam. */
function stateFor(annotated: string): EditorState {
  const open = annotated.indexOf(SEL_OPEN);
  if (open >= 0) {
    const close = annotated.indexOf(SEL_CLOSE) - SEL_OPEN.length;
    const doc = annotated.replace(SEL_OPEN, "").replace(SEL_CLOSE, "");
    return EditorState.create({
      doc,
      selection: EditorSelection.range(open, close),
    });
  }
  const cursor = annotated.indexOf(CURSOR);
  const doc = cursor >= 0 ? annotated.replace(CURSOR, "") : annotated;
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor >= 0 ? cursor : 0),
  });
}

/** Estado depois da transação, de volta na notação anotada. */
function annotate(state: EditorState): string {
  const doc = state.doc.toString();
  const range = state.selection.main;
  if (range.empty) {
    return doc.slice(0, range.from) + CURSOR + doc.slice(range.from);
  }
  return (
    doc.slice(0, range.from) +
    SEL_OPEN +
    doc.slice(range.from, range.to) +
    SEL_CLOSE +
    doc.slice(range.to)
  );
}

function applySpec(state: EditorState, spec: TransactionSpec): EditorState {
  return state.update(spec).state;
}

function bold(annotated: string, mark: InlineMark = "bold"): string {
  const state = stateFor(annotated);
  return annotate(applySpec(state, inlineMarkEdit(state, mark)));
}

function heading(annotated: string, level: HeadingLevel): string {
  const state = stateFor(annotated);
  return annotate(applySpec(state, headingEdit(state, level)));
}

function prefix(annotated: string, kind: LinePrefixKind): string {
  const state = stateFor(annotated);
  return annotate(applySpec(state, linePrefixEdit(state, kind)));
}

describe("markdownCommands — marca inline", () => {
  it("com seleção vazia insere o par e põe o cursor no meio", () => {
    expect(bold("texto |")).toBe("texto **|**");
  });

  it("com seleção, envolve o trecho e mantém a seleção sobre o texto", () => {
    expect(bold("diga «isso» agora")).toBe("diga **«isso»** agora");
  });

  it("aplicar duas vezes desfaz — com seleção", () => {
    const first = bold("diga «isso» agora");
    expect(first).toBe("diga **«isso»** agora");
    // Segunda passada: os `**` estão logo fora da seleção.
    expect(bold(first)).toBe("diga «isso» agora");
  });

  it("aplicar duas vezes desfaz — com seleção vazia (par recém-inserido)", () => {
    expect(bold(bold("texto |"))).toBe("texto |");
  });

  it("desfaz também quando a seleção engloba os próprios marcadores", () => {
    expect(bold("diga «**isso**» agora")).toBe("diga «isso» agora");
  });

  it("usa o delimitador de cada marca", () => {
    expect(bold("«x»", "italic")).toBe("_«x»_");
    expect(bold("«x»", "strikethrough")).toBe("~~«x»~~");
    expect(bold("«x»", "code")).toBe("`«x»`");
  });

  it("itálico não confunde `_` com o `**` do negrito", () => {
    // `**forte**` selecionado, comando de itálico: envolve, não desfaz o negrito.
    expect(bold("«**forte**»", "italic")).toBe("_«**forte**»_");
  });

  it("envolve uma seleção de várias linhas de uma vez só", () => {
    expect(bold("«uma\ndois»")).toBe("**«uma\ndois»**");
  });

  it("não altera o documento fora da seleção", () => {
    const state = stateFor("antes «meio» depois");
    const next = applySpec(state, inlineMarkEdit(state, "bold"));
    expect(next.doc.toString()).toBe("antes **meio** depois");
  });
});

describe("markdownCommands — título", () => {
  it("insere o marcador na linha do cursor", () => {
    expect(heading("Reunião|", 1)).toBe("# Reunião|");
  });

  it("alternar de nível troca o nível em vez de acumular `#`", () => {
    expect(heading("# Reunião|", 2)).toBe("## Reunião|");
    expect(heading("### Reunião|", 1)).toBe("# Reunião|");
  });

  it("o mesmo nível duas vezes devolve a linha a parágrafo", () => {
    expect(heading(heading("Reunião|", 2), 2)).toBe("Reunião|");
  });

  it("aplica em todas as linhas tocadas pela seleção", () => {
    const state = stateFor("«uma\ndois\ntrês»");
    expect(applySpec(state, headingEdit(state, 2)).doc.toString()).toBe(
      "## uma\n## dois\n## três"
    );
  });

  it("não confunde `#` no meio da linha com título", () => {
    expect(heading("nota #1 do dia|", 1)).toBe("# nota #1 do dia|");
  });

  it("linha vazia vira só o marcador, com o cursor pronto para escrever", () => {
    expect(heading("|", 3)).toBe("### |");
  });
});

describe("markdownCommands — prefixo de linha", () => {
  it("liga e desliga lista", () => {
    expect(prefix("item|", "bullet")).toBe("- item|");
    expect(prefix("- item|", "bullet")).toBe("item|");
  });

  it("reconhece `*` e `+` como lista já escrita", () => {
    expect(prefix("* item|", "bullet")).toBe("item|");
    expect(prefix("+ item|", "bullet")).toBe("item|");
  });

  it("trocar de família substitui o marcador em vez de empilhar", () => {
    expect(prefix("- item|", "task")).toBe("- [ ] item|");
    expect(prefix("- [ ] item|", "quote")).toBe("> item|");
    expect(prefix("> item|", "ordered")).toBe("1. item|");
  });

  it("checklist já marcada (`- [x]`) desliga", () => {
    expect(prefix("- [x] item|", "task")).toBe("item|");
  });

  it("preserva a indentação do item aninhado", () => {
    expect(prefix("\t- item|", "task")).toBe("\t- [ ] item|");
    expect(prefix("  item|", "bullet")).toBe("  - item|");
  });

  it("aplica em todas as linhas da seleção", () => {
    const state = stateFor("«pão\nleite\ncafé»");
    expect(applySpec(state, linePrefixEdit(state, "task")).doc.toString()).toBe(
      "- [ ] pão\n- [ ] leite\n- [ ] café"
    );
  });

  it("a seleção continua cobrindo o mesmo texto depois de virar lista", () => {
    const state = stateFor("pão «e» leite");
    const next = applySpec(state, linePrefixEdit(state, "bullet"));
    expect(annotate(next)).toBe("- pão «e» leite");
  });
});

describe("markdownCommands — link", () => {
  it("com seleção, usa a seleção como texto e deixa o cursor na URL", () => {
    const state = stateFor("veja «Orbyva» aqui");
    expect(annotate(applySpec(state, linkEdit(state)))).toBe(
      "veja [Orbyva](|) aqui"
    );
  });

  it("sem seleção, insere o esqueleto com o cursor dentro dos colchetes", () => {
    const state = stateFor("veja |");
    expect(annotate(applySpec(state, linkEdit(state)))).toBe("veja [|]()");
  });
});

describe("markdownCommands — trecho pronto", () => {
  it("insere no cursor e respeita o deslocamento pedido", () => {
    const state = stateFor("antes|depois");
    const snippet = "```ts\n\n```";
    // O cursor precisa parar **dentro** da cerca, não depois dela.
    const next = applySpec(state, snippetEdit(state, snippet, "```ts\n".length));
    expect(next.doc.toString()).toBe("antes```ts\n\n```depois");
    expect(next.selection.main.head).toBe("antes```ts\n".length);
  });

  it("substitui a seleção pelo trecho", () => {
    const state = stateFor("«apagar»");
    const next = applySpec(state, snippetEdit(state, "---\n"));
    expect(next.doc.toString()).toBe("---\n");
    expect(next.selection.main.empty).toBe(true);
  });
});
