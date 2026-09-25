import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { LanguageDescription, ensureSyntaxTree } from "@codemirror/language";
import {
  FENCE_LANGUAGES,
  markdownSupport,
} from "@/components/codemirror/markdownLanguage";

/**
 * A linguagem do editor de notas: Markdown + GFM, com realce **dentro** do fence carregado sob
 * demanda (feature 070, desfazendo o trade-off que a 057 registrou).
 *
 * O teste roda no nível do `EditorState`: monta o estado, força a árvore de sintaxe inteira e
 * afirma que nós da linguagem interna aparecem dentro do bloco. Sem navegador, sem editor montado.
 */

/** Árvore de sintaxe completa do documento (sem orçamento de tempo apertado, para não flakear). */
function treeFor(doc: string) {
  const state = EditorState.create({ doc, extensions: [markdownSupport] });
  const tree = ensureSyntaxTree(state, doc.length, 10_000);
  if (!tree) throw new Error("a árvore de sintaxe não ficou pronta");
  return tree;
}

/** Nomes dos nós de Markdown do documento. */
function nodeNames(doc: string): string[] {
  const names: string[] = [];
  treeFor(doc).iterate({ enter: (node) => void names.push(node.name) });
  return names;
}

/**
 * O nome do nó **mais interno** naquela posição.
 *
 * É por aqui que a linguagem aninhada aparece: o parser misto pendura a árvore interna como
 * *mount* no nó do fence, e `iterate` não entra em mount por padrão — `resolveInner` entra. É
 * exatamente o caminho que o realce do CodeMirror percorre.
 */
function innermostAt(doc: string, pos: number): string {
  return treeFor(doc).resolveInner(pos, 1).name;
}

describe("markdownSupport — Markdown e GFM", () => {
  it("continua parseando o GFM que o editor depende (tabela, tarefa, riscado)", () => {
    expect(nodeNames("| a | b |\n| - | - |\n| 1 | 2 |")).toContain("Table");
    expect(nodeNames("- [ ] comprar")).toContain("TaskMarker");
    expect(nodeNames("~~riscado~~")).toContain("Strikethrough");
  });

  it("reaproveita o `data` do `markdownLanguage`, onde moram os autocompletes", () => {
    // `wikiLinkAutocomplete` (056) e o menu `/` (070) penduram a fonte nesse facet: um facet novo
    // deixaria os dois falando com uma linguagem que o editor não usa.
    const state = EditorState.create({ doc: "", extensions: [markdownSupport] });
    expect(state.facet(markdownSupport.language.data)).not.toBeUndefined();
  });
});

describe("realce dentro do fence", () => {
  it("reconhece os nomes e apelidos das linguagens oferecidas", () => {
    const match = (name: string) =>
      LanguageDescription.matchLanguageName(FENCE_LANGUAGES, name, true)?.name ?? null;

    expect(match("js")).toBe("javascript");
    expect(match("ts")).toBe("javascript");
    expect(match("TSX")).toBe("javascript");
    expect(match("py")).toBe("python");
    expect(match("bash")).toBe("shell");
    expect(match("sh")).toBe("shell");
    expect(match("json")).toBe("json");
    expect(match("sql")).toBe("sql");
    expect(match("css")).toBe("css");
    expect(match("html")).toBe("html");
  });

  it("linguagem desconhecida não é erro — o bloco fica sem realce, com o texto intacto", () => {
    expect(
      LanguageDescription.matchLanguageName(FENCE_LANGUAGES, "brainfuck", true)
    ).toBeNull();
    const doc = "```brainfuck\n+++.\n```";
    const names = nodeNames(doc);
    expect(names).toContain("FencedCode");
    expect(names).toContain("CodeText");
    // Sem gramática, o miolo continua sendo texto de código puro.
    expect(innermostAt(doc, 14)).toBe("CodeText");
  });

  it("com a gramática carregada, o bloco ```js ganha nós de JavaScript", async () => {
    const doc = "```js\nconst total = 1 + 2;\n```";
    // Antes de carregar, o `getSkippingParser` deixa o miolo intocado — um nó anônimo (`""`) ou o
    // `CodeText` de sempre. É o que o usuário vê enquanto o chunk da gramática não chegou: bloco
    // sem cor, com o texto inteiro, nunca bloco vazio nem erro.
    expect(["", "CodeText"]).toContain(innermostAt(doc, 12));

    const javascript = LanguageDescription.matchLanguageName(FENCE_LANGUAGES, "js", true);
    expect(javascript).not.toBeNull();
    // `load()` guarda o `support` na própria descrição: daí em diante o parser é síncrono.
    await javascript?.load();

    // `total` vira uma definição de variável, e `2` um número: quem colore o editor lê daqui.
    expect(innermostAt(doc, 12)).toBe("VariableDefinition");
    expect(innermostAt(doc, 24)).toBe("Number");
    // O texto do bloco não muda por causa do realce — realce é árvore, não edição.
    expect(
      EditorState.create({ doc, extensions: [markdownSupport] }).doc.toString()
    ).toBe(doc);
  });

  it("cada linguagem oferecida carrega de verdade e devolve um LanguageSupport", async () => {
    for (const description of FENCE_LANGUAGES) {
      const support = await description.load();
      expect(support.language.parser).toBeDefined();
    }
  });
});
