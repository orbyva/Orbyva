import { describe, expect, it } from "vitest";
import { READING_WORDS_PER_MINUTE, countWords } from "@/domain/notes/wordCount";

/**
 * A contagem do rodapé do editor (feature 070). Conta texto, não marcação — é isso que cada caso
 * abaixo fixa.
 */

describe("countWords", () => {
  it("nota vazia (ou só espaço) não inventa número nem tempo de leitura", () => {
    expect(countWords("")).toEqual({ words: 0, characters: 0, minutes: 0 });
    expect(countWords("   \n\n  ")).toEqual({ words: 0, characters: 0, minutes: 0 });
  });

  it("conta as palavras do texto, não os marcadores", () => {
    // "# Título" vale uma palavra ("Título"), não duas.
    expect(countWords("# Título").words).toBe(1);
    expect(countWords("**negrito** e _itálico_").words).toBe(3);
    expect(countWords("- um\n- dois\n- três").words).toBe(3);
    expect(countWords("[Orbyva](https://orbyva.app) é bom").words).toBe(3);
  });

  it("espaço repetido e quebra de linha não viram palavra fantasma", () => {
    expect(countWords("uma    palavra\n\n\noutra").words).toBe(3);
  });

  it("bloco de código inteiro fica de fora da contagem", () => {
    const doc = ["texto antes", "", "```ts", "const a = 1;", "```", "", "texto depois"].join("\n");
    // "texto antes" + "texto depois" = 4 palavras; o código não conta.
    expect(countWords(doc).words).toBe(4);
  });

  it("nota que só tem código conta zero palavras", () => {
    expect(countWords("```sh\nls -la\n```").words).toBe(0);
  });

  it("acento é um caractere só, e emoji também", () => {
    expect(countWords("ção").characters).toBe(3);
    expect(countWords("café 🚀").characters).toBe(6);
  });

  it("tempo de leitura arredonda para cima e nunca é zero com texto", () => {
    expect(countWords("uma palavra só").minutes).toBe(1);

    const longo = Array.from({ length: READING_WORDS_PER_MINUTE + 1 }, () => "palavra").join(" ");
    expect(countWords(longo).words).toBe(READING_WORDS_PER_MINUTE + 1);
    expect(countWords(longo).minutes).toBe(2);
  });
});
