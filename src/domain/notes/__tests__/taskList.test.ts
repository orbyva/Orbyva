import { describe, expect, it } from "vitest";
import {
  extractTaskListItems,
  toggleTaskListItem,
} from "@/domain/notes/taskList";

/**
 * O que estes testes protegem é o casamento entre **duas contagens**: a dos checkboxes que aparecem
 * na tela e a dos itens que este módulo encontra no texto. Se elas divergirem, clicar num item
 * marca outro — e o usuário só descobre depois de a nota já ter sido salva errada.
 */
describe("extractTaskListItems", () => {
  it("encontra os itens na ordem do texto, com o estado de cada um", () => {
    const items = extractTaskListItems("- [ ] comprar\n- [x] pagar\n- [ ] enviar");

    expect(items.map((i) => i.index)).toEqual([0, 1, 2]);
    expect(items.map((i) => i.checked)).toEqual([false, true, false]);
    expect(items.map((i) => i.text)).toEqual(["comprar", "pagar", "enviar"]);
  });

  it("aceita os marcadores de lista do CommonMark, ordenada inclusive", () => {
    const items = extractTaskListItems(
      "* [ ] asterisco\n+ [ ] mais\n1. [ ] ordenada\n2) [ ] parêntese"
    );

    expect(items).toHaveLength(4);
  });

  it("`- [X]` maiúsculo conta como marcado", () => {
    expect(extractTaskListItems("- [X] feito")[0].checked).toBe(true);
  });

  it("checkbox dentro de bloco de código não entra na contagem", () => {
    const items = extractTaskListItems(
      "- [ ] real\n\n```md\n- [ ] exemplo\n- [x] exemplo\n```\n\n- [ ] outro real"
    );

    expect(items.map((i) => i.text)).toEqual(["real", "outro real"]);
    expect(items.map((i) => i.index)).toEqual([0, 1]);
  });

  it("bloco com `~~~` também esconde os checkboxes de dentro", () => {
    const items = extractTaskListItems("~~~\n- [ ] exemplo\n~~~\n- [ ] real");
    expect(items.map((i) => i.text)).toEqual(["real"]);
  });

  it("cerca mais longa não é fechada por uma mais curta lá dentro", () => {
    const items = extractTaskListItems(
      "````\n```\n- [ ] escondido\n````\n- [ ] real"
    );
    expect(items.map((i) => i.text)).toEqual(["real"]);
  });

  it("item dentro de citação conta (o GFM desenha checkbox lá também)", () => {
    const items = extractTaskListItems("> - [ ] na citação\n\n- [x] fora");

    expect(items.map((i) => i.text)).toEqual(["na citação", "fora"]);
  });

  it("item em lista aninhada conta, na ordem em que aparece", () => {
    const items = extractTaskListItems(
      "- [ ] pai\n  - [x] filho\n    - [ ] neto\n- [ ] tio"
    );

    expect(items.map((i) => i.text)).toEqual(["pai", "filho", "neto", "tio"]);
    expect(items.map((i) => i.checked)).toEqual([false, true, false, false]);
  });

  it("o que não é checkbox de verdade fica de fora", () => {
    const items = extractTaskListItems(
      "- item comum\n[ ] sem marcador de lista\n-[ ] sem espaço\ntexto [x] no meio"
    );

    expect(items).toHaveLength(0);
  });
});

describe("toggleTaskListItem", () => {
  it("marca o item pedido e deixa o resto do arquivo byte a byte igual", () => {
    const content = "# Lista\n\n- [ ] comprar\n- [ ] pagar\n\ntexto final\n";

    expect(toggleTaskListItem(content, 1)).toBe(
      "# Lista\n\n- [ ] comprar\n- [x] pagar\n\ntexto final\n"
    );
  });

  it("desmarca o que estava marcado", () => {
    expect(toggleTaskListItem("- [x] pago", 0)).toBe("- [ ] pago");
  });

  it("`- [X]` maiúsculo desmarca (e não vira `[X]` de novo)", () => {
    expect(toggleTaskListItem("- [X] pago", 0)).toBe("- [ ] pago");
  });

  it("preserva a indentação e o marcador originais da lista aninhada", () => {
    const content = "- [ ] pai\n\t* [ ] filho com tab\n    + [ ] neto\n";

    expect(toggleTaskListItem(content, 1)).toBe(
      "- [ ] pai\n\t* [x] filho com tab\n    + [ ] neto\n"
    );
    expect(toggleTaskListItem(content, 2)).toBe(
      "- [ ] pai\n\t* [ ] filho com tab\n    + [x] neto\n"
    );
  });

  it("item dentro de citação alterna sem perder o `>`", () => {
    expect(toggleTaskListItem("> - [ ] na citação", 0)).toBe("> - [x] na citação");
  });

  it("checkbox dentro de bloco de código não conta para o índice — nem é alterado", () => {
    const content =
      "- [ ] real\n\n```md\n- [ ] exemplo\n```\n\n- [ ] outro real\n";

    // O índice 1 é o "outro real", não o exemplo dentro do bloco.
    expect(toggleTaskListItem(content, 1)).toBe(
      "- [ ] real\n\n```md\n- [ ] exemplo\n```\n\n- [x] outro real\n"
    );
  });

  it("índice fora de faixa não altera nada", () => {
    const content = "- [ ] único\n";

    expect(toggleTaskListItem(content, 1)).toBe(content);
    expect(toggleTaskListItem(content, 99)).toBe(content);
    expect(toggleTaskListItem(content, -1)).toBe(content);
    expect(toggleTaskListItem(content, 1.5)).toBe(content);
  });

  it("conteúdo sem checkbox nenhum sai intacto", () => {
    const content = "só um parágrafo\n\n- item comum\n";
    expect(toggleTaskListItem(content, 0)).toBe(content);
  });

  it("quebra de linha do Windows sobrevive à alternância", () => {
    expect(toggleTaskListItem("- [ ] a\r\n- [ ] b\r\n", 0)).toBe(
      "- [x] a\r\n- [ ] b\r\n"
    );
  });

  it("alternar duas vezes devolve exatamente o conteúdo original", () => {
    const content = "- [ ] a\n  - [x] b\n\n> - [ ] c\n";

    for (const index of [0, 1, 2]) {
      expect(toggleTaskListItem(toggleTaskListItem(content, index), index)).toBe(
        content
      );
    }
  });

  it("o índice devolvido por `extractTaskListItems` é o mesmo que o toggle usa", () => {
    const content = "- [ ] a\n\n```\n- [ ] falso\n```\n\n> - [ ] b\n  - [x] c\n";

    for (const item of extractTaskListItems(content)) {
      const toggled = toggleTaskListItem(content, item.index);
      expect(extractTaskListItems(toggled)[item.index].checked).toBe(!item.checked);
    }
  });
});
