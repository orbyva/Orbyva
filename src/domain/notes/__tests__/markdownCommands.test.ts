import { describe, expect, it } from "vitest";
import {
  insertLink,
  toggleHeading,
  toggleList,
  toggleQuote,
  toggleTaskListItem,
  toggleWrap,
} from "@/domain/notes/markdownCommands";

/**
 * As transformações de Markdown do editor de notas (feature 070). São funções puras de
 * `(texto, seleção)`, então cada caso afirma **o documento inteiro resultante** e onde a seleção
 * parou — sem editor, sem DOM, sem navegador.
 */

/** Açúcar: marca a seleção com `|` no documento de entrada e devolve doc + seleção. */
function parse(marked: string): { doc: string; from: number; to: number } {
  const from = marked.indexOf("|");
  const rest = marked.slice(0, from) + marked.slice(from + 1);
  const second = rest.indexOf("|");
  if (second === -1) return { doc: rest, from, to: from };
  return { doc: rest.slice(0, second) + rest.slice(second + 1), from, to: second };
}

/** O contrário: devolve o resultado com a seleção marcada, para a assertiva ficar legível. */
function render(text: string, selection: { from: number; to: number }): string {
  if (selection.from === selection.to) {
    return text.slice(0, selection.from) + "|" + text.slice(selection.from);
  }
  return (
    text.slice(0, selection.from) +
    "|" +
    text.slice(selection.from, selection.to) +
    "|" +
    text.slice(selection.to)
  );
}

function wrap(marked: string, marker: "**" | "_" | "`" | "~~"): string {
  const { doc, from, to } = parse(marked);
  const edit = toggleWrap(doc, { from, to }, marker);
  return render(edit.text, edit.selection);
}

function heading(marked: string, level: 1 | 2 | 3 | 4 | 5 | 6): string {
  const { doc, from, to } = parse(marked);
  const edit = toggleHeading(doc, { from, to }, level);
  return render(edit.text, edit.selection);
}

function list(marked: string, kind: "bullet" | "ordered" | "task"): string {
  const { doc, from, to } = parse(marked);
  const edit = toggleList(doc, { from, to }, kind);
  return render(edit.text, edit.selection);
}

function quote(marked: string): string {
  const { doc, from, to } = parse(marked);
  const edit = toggleQuote(doc, { from, to });
  return render(edit.text, edit.selection);
}

describe("toggleWrap", () => {
  it("envolve a seleção e mantém o texto selecionado por dentro do marcador", () => {
    expect(wrap("olha o |texto| aqui", "**")).toBe("olha o **|texto|** aqui");
    expect(wrap("olha o |texto| aqui", "_")).toBe("olha o _|texto|_ aqui");
    expect(wrap("olha o |texto| aqui", "`")).toBe("olha o `|texto|` aqui");
    expect(wrap("olha o |texto| aqui", "~~")).toBe("olha o ~~|texto|~~ aqui");
  });

  it("remove o marcador quando ele está dentro da seleção", () => {
    expect(wrap("olha o |**texto**| aqui", "**")).toBe("olha o |texto| aqui");
    expect(wrap("olha o |~~texto~~| aqui", "~~")).toBe("olha o |texto| aqui");
  });

  it("remove o marcador quando ele está em volta da seleção", () => {
    expect(wrap("olha o **|texto|** aqui", "**")).toBe("olha o |texto| aqui");
    expect(wrap("olha o `|cod|` aqui", "`")).toBe("olha o |cod| aqui");
  });

  it("com seleção vazia insere o par e põe o cursor no meio", () => {
    expect(wrap("escreva | aqui", "**")).toBe("escreva **|** aqui");
    expect(wrap("escreva | aqui", "`")).toBe("escreva `|` aqui");
  });

  it("com o cursor dentro de um par vazio, tira o par em vez de empilhar outro", () => {
    expect(wrap("escreva **|** aqui", "**")).toBe("escreva | aqui");
  });

  it("negrito em seleção de várias linhas envolve o bloco inteiro, sem tocar no conteúdo", () => {
    expect(wrap("|linha um\nlinha dois|", "**")).toBe("**|linha um\nlinha dois|**");
  });

  it("não confunde `_` com `**`: marcador diferente aninha em vez de remover", () => {
    expect(wrap("|**texto**|", "_")).toBe("_|**texto**|_");
  });
});

describe("toggleHeading", () => {
  it("transforma a linha do cursor em título do nível pedido", () => {
    expect(heading("Introdu|ção", 2)).toBe("## Introdu|ção");
  });

  it("troca de nível em vez de empilhar `#`", () => {
    expect(heading("## Introdu|ção", 3)).toBe("### Introdu|ção");
    expect(heading("### Introdu|ção", 1)).toBe("# Introdu|ção");
  });

  it("aplicar o mesmo nível de novo remove o título", () => {
    expect(heading("## Introdu|ção", 2)).toBe("Introdu|ção");
  });

  /**
   * Seleção que começa na coluna 0 continua na coluna 0: o marcador entra **dentro** do bloco
   * selecionado, então o bloco inteiro segue selecionado depois do toggle (e tocar o atalho de novo
   * desfaz exatamente o que acabou de ser feito).
   */
  it("aplica em todas as linhas tocadas pela seleção", () => {
    expect(heading("|um\ndois|", 1)).toBe("|# um\n# dois|");
  });

  it("só remove quando **todas** as linhas já estão no nível pedido", () => {
    expect(heading("|# um\ndois|", 1)).toBe("|# um\n# dois|");
    expect(heading("|# um\n# dois|", 1)).toBe("|um\ndois|");
  });
});

describe("toggleList", () => {
  it("aplica marcador, numeração e caixa de tarefa", () => {
    expect(list("com|prar", "bullet")).toBe("- com|prar");
    expect(list("com|prar", "ordered")).toBe("1. com|prar");
    expect(list("com|prar", "task")).toBe("- [ ] com|prar");
  });

  it("numera as linhas em sequência", () => {
    expect(list("|um\ndois\ntres|", "ordered")).toBe("|1. um\n2. dois\n3. tres|");
  });

  it("lista já aplicada volta a ser texto comum", () => {
    expect(list("- com|prar", "bullet")).toBe("com|prar");
    expect(list("|- um\n- dois|", "bullet")).toBe("|um\ndois|");
  });

  it("troca de tipo sem empilhar marcador", () => {
    expect(list("- com|prar", "task")).toBe("- [ ] com|prar");
    expect(list("- [ ] com|prar", "bullet")).toBe("- com|prar");
    expect(list("1. com|prar", "bullet")).toBe("- com|prar");
  });

  it("preserva a indentação de item aninhado", () => {
    expect(list("  - fi|lho", "task")).toBe("  - [ ] fi|lho");
  });

  it("deixa linha em branco em branco — marcador solto vira item fantasma", () => {
    expect(list("|um\n\ndois|", "bullet")).toBe("|- um\n\n- dois|");
  });
});

describe("toggleQuote", () => {
  it("cita e descita o bloco inteiro", () => {
    expect(quote("|um\ndois|")).toBe("|> um\n> dois|");
    expect(quote("|> um\n> dois|")).toBe("|um\ndois|");
  });

  it("bloco com uma linha fora da citação vira citação inteira", () => {
    expect(quote("|> um\ndois|")).toBe("|> > um\n> dois|");
  });
});

describe("insertLink", () => {
  it("com seleção vira `[sel](url)` e deixa a seleção dentro dos parênteses", () => {
    const edit = insertLink("veja o site aqui", { from: 7, to: 11 });
    expect(edit.text).toBe("veja o [site]() aqui");
    expect(edit.selection).toEqual({ from: 14, to: 14 });
  });

  it("com url conhecida preenche os parênteses e seleciona a url", () => {
    const edit = insertLink("veja o site aqui", { from: 7, to: 11 }, "https://a.b");
    expect(edit.text).toBe("veja o [site](https://a.b) aqui");
    expect(edit.text.slice(edit.selection.from, edit.selection.to)).toBe("https://a.b");
  });

  it("sem seleção vira `[](url)` com o cursor entre os colchetes", () => {
    const edit = insertLink("veja ", { from: 5, to: 5 });
    expect(edit.text).toBe("veja []()");
    expect(edit.selection).toEqual({ from: 6, to: 6 });
  });

  it("aceita seleção invertida (arrastada de trás para frente)", () => {
    const edit = insertLink("veja o site aqui", { from: 11, to: 7 });
    expect(edit.text).toBe("veja o [site]() aqui");
  });
});

/**
 * `toggleTaskListItem` — o checkbox clicável do preview (feature 070). O índice é a ordem de
 * ocorrência no texto, que é a única chave que o `react-markdown` também tem.
 */
describe("toggleTaskListItem", () => {
  const LISTA = ["- [ ] comprar pão", "- [x] pagar conta", "- [ ] ligar para a Ana"].join("\n");

  it("marca a caixa pedida, sem tocar nas outras", () => {
    expect(toggleTaskListItem(LISTA, 0)).toBe(
      ["- [x] comprar pão", "- [x] pagar conta", "- [ ] ligar para a Ana"].join("\n")
    );
    expect(toggleTaskListItem(LISTA, 2)).toBe(
      ["- [ ] comprar pão", "- [x] pagar conta", "- [x] ligar para a Ana"].join("\n")
    );
  });

  it("desmarca caixa já marcada, em qualquer caixa", () => {
    expect(toggleTaskListItem(LISTA, 1)).toBe(
      ["- [ ] comprar pão", "- [ ] pagar conta", "- [ ] ligar para a Ana"].join("\n")
    );
    expect(toggleTaskListItem("- [X] maiúsculo", 0)).toBe("- [ ] maiúsculo");
  });

  it("índice fora do intervalo devolve o texto intacto — clique não derruba a tela", () => {
    expect(toggleTaskListItem(LISTA, 9)).toBe(LISTA);
    expect(toggleTaskListItem(LISTA, -1)).toBe(LISTA);
    expect(toggleTaskListItem("sem tarefa nenhuma", 0)).toBe("sem tarefa nenhuma");
  });

  it("caixa dentro de bloco de código não conta na numeração", () => {
    const doc = [
      "```md",
      "- [ ] exemplo de sintaxe",
      "```",
      "",
      "- [ ] tarefa de verdade",
    ].join("\n");
    // Índice 0 é a **primeira de verdade**, não a do exemplo.
    expect(toggleTaskListItem(doc, 0)).toBe(
      ["```md", "- [ ] exemplo de sintaxe", "```", "", "- [x] tarefa de verdade"].join("\n")
    );
    // E a do exemplo continua intocada em qualquer índice.
    expect(toggleTaskListItem(doc, 1)).toBe(doc);
  });

  it("preserva indentação, marcador e espaçamento do item", () => {
    expect(toggleTaskListItem("    * [ ]   item  recuado", 0)).toBe(
      "    * [x]   item  recuado"
    );
    expect(toggleTaskListItem("1. [ ] em lista numerada", 0)).toBe(
      "1. [x] em lista numerada"
    );
  });

  it("não confunde link de colchete com caixa de tarefa", () => {
    const doc = "- [link](https://a.b) não é caixa\n- [ ] esta é";
    expect(toggleTaskListItem(doc, 0)).toBe(
      "- [link](https://a.b) não é caixa\n- [x] esta é"
    );
  });
});
