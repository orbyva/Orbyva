import { describe, expect, it } from "vitest";
import {
  READING_WORDS_PER_MINUTE,
  countWords,
  formatWordCount,
} from "@/domain/notes/wordCount";

/**
 * A contagem do rodapé. O que precisa ficar provado é o **recorte**: o número conta o que o
 * leitor lê, não o que está no arquivo — senão a nota mais formatada é a que mais mente.
 */
describe("countWords", () => {
  it("nota vazia dá zero em tudo", () => {
    expect(countWords("")).toEqual({
      words: 0,
      characters: 0,
      readingMinutes: 0,
      minutes: 0,
    });
    expect(countWords("   \n\n\t")).toEqual({
      words: 0,
      characters: 0,
      readingMinutes: 0,
      minutes: 0,
    });
  });

  it("conta as palavras de um parágrafo comum", () => {
    const { words, characters } = countWords("comprar cimento e areia");
    expect(words).toBe(4);
    expect(characters).toBe("comprar cimento e areia".length);
  });

  it("marcação não conta como palavra", () => {
    // Seis palavras visíveis: "Etapas", "prazo", "curto", "da", "obra", "hoje".
    const content = "# Etapas\n\n**prazo** _curto_ da ~~obra~~ `hoje`";
    expect(countWords(content).words).toBe(6);
  });

  it("marcador de lista, citação e regra não viram palavra", () => {
    expect(countWords("- pão\n- leite\n\n> nota\n\n---").words).toBe(4);
  });

  it("link conta o texto, não a URL", () => {
    expect(countWords("veja o [site da obra](https://exemplo.com/x)").words).toBe(5);
  });

  it("bloco de código não conta", () => {
    const content = [
      "antes",
      "",
      "```ts",
      "const muitas = palavras.que.nao.sao.texto(1, 2, 3);",
      "```",
      "",
      "depois",
    ].join("\n");
    expect(countWords(content).words).toBe(2);
  });

  it("cerca ainda não fechada (nota em edição) também não conta", () => {
    expect(countWords("antes\n\n```sql\nSELECT muitas colunas FROM tabela").words).toBe(
      1
    );
  });

  it("tag HTML não conta — o preview nem a renderiza", () => {
    expect(countWords("<div class='x'>texto de verdade</div>").words).toBe(3);
  });

  it("acento e hífen: `guarda-chuva` é uma palavra, `Reunião` é uma palavra", () => {
    expect(countWords("Reunião sobre o guarda-chuva").words).toBe(4);
  });

  it("espaço repetido e quebra de linha não inflam a contagem", () => {
    expect(countWords("uma    palavra\n\n\noutra").words).toBe(3);
  });

  it("acento é um caractere só, e emoji também", () => {
    expect(countWords("ção").characters).toBe(3);
    expect(countWords("café 🚀").characters).toBe(6);
  });

  it("nota que só tem código conta zero palavras", () => {
    expect(countWords("```sh\nls -la\n```").words).toBe(0);
  });

  it("o rodapé sai com plural certo", () => {
    expect(formatWordCount(countWords("oi"))).toBe(
      "1 palavra · 2 caracteres · 1 min de leitura"
    );
    expect(
      formatWordCount({ words: 12, characters: 1, readingMinutes: 3, minutes: 3 })
    ).toBe("12 palavras · 1 caractere · 3 min de leitura");
  });

  it("o tempo de leitura arredonda para cima e nunca é zero com texto", () => {
    expect(countWords("uma palavra").readingMinutes).toBe(1);
    expect(countWords("uma palavra").minutes).toBe(1);

    const muitas = Array.from(
      { length: READING_WORDS_PER_MINUTE * 2 + 1 },
      () => "palavra"
    ).join(" ");
    expect(countWords(muitas).words).toBe(READING_WORDS_PER_MINUTE * 2 + 1);
    expect(countWords(muitas).readingMinutes).toBe(3);
    expect(countWords(muitas).minutes).toBe(3);
  });
});
