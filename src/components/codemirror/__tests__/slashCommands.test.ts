// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import type { CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";
import {
  SNIPPET_CURSOR,
  expandSnippet,
  slashCommandSource,
  slashCommands,
} from "@/components/codemirror/slashCommands";

/**
 * O menu `/` do editor de notas (feature 070), testado no nível do `CompletionContext` — o próprio
 * contrato que o CodeMirror chama — e, na hora de aplicar, num `EditorView` de verdade, para o
 * documento resultante ser afirmado byte a byte. Sem navegador.
 */

const NOW = new Date(2026, 8, 25, 10, 30);

/** Roda a fonte com o cursor no fim de `doc`, como se o usuário tivesse acabado de digitar. */
function complete(doc: string, at = doc.length): CompletionResult | null {
  const state = EditorState.create({ doc, extensions: [markdownSupport] });
  const context = new CompletionContext(state, at, false);
  return slashCommandSource(() => NOW)(context) as CompletionResult | null;
}

function labels(doc: string): string[] | null {
  const result = complete(doc);
  return result ? result.options.map((o) => o.label) : null;
}

/**
 * Aplica a opção escolhida num editor real e devolve o documento resultante com `|` onde o cursor
 * parou — é assim que o snippet e a posição do cursor ficam legíveis na assertiva.
 */
function apply(doc: string, label: string): string {
  const result = complete(doc);
  if (!result) throw new Error("o menu não abriu");
  const option = result.options.find((o) => o.label === label);
  if (!option) throw new Error(`opção ausente: ${label}`);

  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdownSupport],
    }),
  });
  const applyFn = option.apply as (
    view: EditorView,
    completion: unknown,
    from: number,
    to: number
  ) => void;
  applyFn(view, option, result.from, doc.length);

  const text = view.state.doc.toString();
  const { from: anchor, to: head } = view.state.selection.main;
  view.destroy();
  if (anchor === head) return text.slice(0, anchor) + "|" + text.slice(anchor);
  // Dois `|` = o trecho que ficou **selecionado** (digitar troca por cima).
  return (
    text.slice(0, anchor) + "|" + text.slice(anchor, head) + "|" + text.slice(head)
  );
}

describe("slashCommandSource — quando abre", () => {
  it("abre com `/` no começo da linha, oferecendo todos os itens", () => {
    expect(labels("/")).toEqual([
      "Título",
      "Lista",
      "Lista de tarefas",
      "Tabela",
      "Citação",
      "Callout",
      "Bloco de código",
      "Fórmula",
      "Diagrama",
      "Canvas",
      "Data de hoje",
      "Link de nota",
    ]);
  });

  it("abre também na linha indentada e depois de uma linha anterior", () => {
    expect(labels("texto\n/")).not.toBeNull();
    expect(labels("  /")).not.toBeNull();
  });

  it("não abre no meio de uma palavra, nem depois de `http:/`", () => {
    expect(labels("veja/")).toBeNull();
    expect(labels("veja http:/")).toBeNull();
    expect(labels("dia 12/")).toBeNull();
  });

  it("não abre dentro de bloco de código nem de código inline", () => {
    expect(labels("```ts\n/")).toBeNull();
    expect(complete("`comando /`", "`comando /".length)).toBeNull();
  });

  it("filtra pelo texto digitado, por rótulo e por palavra-chave, ignorando acento", () => {
    expect(labels("/tab")).toEqual(["Tabela"]);
    expect(labels("/formula")).toEqual(["Fórmula"]);
    // "checklist" não está no rótulo — está nas palavras-chave.
    expect(labels("/checklist")).toEqual(["Lista de tarefas"]);
    expect(labels("/mermaid")).toEqual(["Diagrama"]);
  });

  it("some quando nada casa, em vez de mostrar lista vazia", () => {
    expect(labels("/zzzz")).toBeNull();
  });

  it("o trecho substituído começa na barra — ela não pode sobrar no documento", () => {
    const result = complete("texto\n/tab");
    expect(result?.from).toBe("texto\n".length);
  });
});

describe("slashCommandSource — o que insere", () => {
  it("itens de linha entram no lugar do `/`, com o cursor depois do marcador", () => {
    expect(apply("/tit", "Título")).toBe("## |");
    expect(apply("/lista", "Lista")).toBe("- |");
    expect(apply("/tarefa", "Lista de tarefas")).toBe("- [ ] |");
    expect(apply("/citacao", "Citação")).toBe("> |");
  });

  it("tabela entra como bloco, com linha em branco antes e o nome da coluna selecionado", () => {
    expect(apply("paragrafo\n/tab", "Tabela")).toBe(
      "paragrafo\n\n| |Coluna| | Coluna |\n| --- | --- |\n|  |  |"
    );
  });

  it("não empilha linha em branco quando já existe uma", () => {
    expect(apply("paragrafo\n\n/tab", "Tabela")).toBe(
      "paragrafo\n\n| |Coluna| | Coluna |\n| --- | --- |\n|  |  |"
    );
  });

  it("callout, fórmula e bloco de código entram com o cursor dentro do bloco", () => {
    expect(apply("/callout", "Callout")).toBe("> [!NOTE]\n> |");
    expect(apply("/formula", "Fórmula")).toBe("$$\n|\n$$");
    expect(apply("/codigo", "Bloco de código")).toBe("```ts\n|\n```");
  });

  it("diagrama insere o mesmo esqueleto do botão, já desenhável", () => {
    expect(apply("/diagrama", "Diagrama")).toContain("graph TD");
  });

  it("data de hoje insere a data local, não a UTC", () => {
    expect(apply("/data", "Data de hoje")).toBe("2026-09-25|");
  });

  it("link de nota deixa o cursor entre os colchetes", () => {
    expect(apply("/link", "Link de nota")).toBe("[[|]]");
  });
});

describe("expandSnippet", () => {
  it("tira o marcador do texto e devolve a posição dele", () => {
    expect(expandSnippet(`a${SNIPPET_CURSOR}b`)).toEqual({ text: "ab", from: 1, to: 1 });
  });

  it("dois marcadores viram um trecho selecionado", () => {
    expect(expandSnippet(`a${SNIPPET_CURSOR}bc${SNIPPET_CURSOR}d`)).toEqual({
      text: "abcd",
      from: 1,
      to: 3,
    });
  });

  it("sem marcador, o cursor vai para o fim", () => {
    expect(expandSnippet("abc")).toEqual({ text: "abc", from: 3, to: 3 });
  });

  it("todo item marca onde o cursor para", () => {
    for (const command of slashCommands(NOW)) {
      expect(command.snippet).toContain(SNIPPET_CURSOR);
    }
  });
});
