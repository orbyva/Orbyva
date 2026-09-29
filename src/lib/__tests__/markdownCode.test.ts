import { describe, expect, it } from "vitest";
import { codeRanges } from "@/lib/markdownCode";

/**
 * Os trechos de texto que os intervalos cobrem — ler o que foi marcado é mais claro do que ler
 * número de offset, e ainda prova que o offset aponta mesmo para onde se espera.
 */
function snippets(content: string): string[] {
  return codeRanges(content).map(([from, to]) => content.slice(from, to));
}

describe("codeRanges", () => {
  it("marca bloco cercado com crase, linha de abertura e de fechamento inclusive", () => {
    const content = "antes\n```\ncodigo\n```\ndepois";
    expect(codeRanges(content)).toEqual([
      [6, 9],
      [10, 16],
      [17, 20],
    ]);
    expect(snippets(content)).toEqual(["```", "codigo", "```"]);
    expect(content.slice(0, 5)).toBe("antes"); // a prosa de fora fica de fora
  });

  it("marca bloco cercado com til igual ao de crase", () => {
    expect(snippets("antes\n~~~\ncodigo\n~~~\nfim")).toEqual(["~~~", "codigo", "~~~"]);
  });

  it("não deixa cerca de um caractere fechar bloco aberto com o outro", () => {
    const content = "```\nx\n~~~\ny\n```\nfim";
    expect(codeRanges(content)).toEqual([
      [0, 3],
      [4, 5],
      [6, 9],
      [10, 11],
      [12, 15],
    ]);
    expect(snippets(content)).toEqual(["```", "x", "~~~", "y", "```"]);
  });

  it("só fecha o bloco com cerca do mesmo tamanho ou maior", () => {
    const content = "````\nx\n```\ny\n````";
    expect(snippets(content)).toEqual(["````", "x", "```", "y", "````"]);
  });

  it("aceita cerca indentada em até 3 espaços", () => {
    const content = "   ```\nx\n   ```\nfim";
    expect(codeRanges(content)).toEqual([
      [0, 6],
      [7, 8],
      [9, 15],
    ]);
    expect(snippets(content)).toEqual(["   ```", "x", "   ```"]);
  });

  it("bloco aberto e nunca fechado engole o resto do conteúdo", () => {
    const content = "antes\n```\nresto\nmais";
    expect(codeRanges(content)).toEqual([
      [6, 9],
      [10, 15],
      [16, 20],
    ]);
    expect(snippets(content)).toEqual(["```", "resto", "mais"]);
  });

  it("marca código inline e fecha com a primeira sequência do mesmo tamanho", () => {
    const simples = "a `b` c `d` e";
    expect(snippets(simples)).toEqual(["`b`", "`d`"]);

    // Regra do CommonMark: abriu com duas crases, fecha na próxima dupla — a crase solta do meio
    // faz parte do conteúdo do código.
    const content = "ver ``a`b`` fim";
    expect(codeRanges(content)).toEqual([[4, 11]]);
    expect(content.slice(4, 11)).toBe("``a`b``");
  });

  it("crase sem par não abre nada", () => {
    expect(codeRanges("custa 10` e nada")).toEqual([]);
    expect(codeRanges("`abre mas nunca fecha")).toEqual([]);
    expect(codeRanges("``duas abrem e nada fecha")).toEqual([]);
  });

  it("desloca o offset do código inline pela linha em que ele está", () => {
    const content = "linha um\nver `x` aqui";
    expect(codeRanges(content)).toEqual([[13, 16]]);
    expect(content.slice(13, 16)).toBe("`x`");
  });

  it("dentro do bloco cercado a linha inteira vira um intervalo só, sem contar crase inline", () => {
    const content = "```\nuse `x` aqui\n```";
    expect(snippets(content)).toEqual(["```", "use `x` aqui", "```"]);
  });

  it("texto sem código nenhum devolve lista vazia", () => {
    expect(codeRanges("nada de código por aqui")).toEqual([]);
    expect(codeRanges("")).toEqual([]);
    expect(codeRanges("   ")).toEqual([]);
    expect(codeRanges("linha um\nlinha dois\n")).toEqual([]);
  });
});
