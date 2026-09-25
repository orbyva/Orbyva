import { stripMarkdown } from "@/lib/markdown";

/**
 * # Contagem da nota — palavras, caracteres e tempo de leitura (feature 070)
 *
 * O que o rodapé do editor mostra enquanto se escreve. Conta o **texto**, não a marcação: `**` de
 * negrito, `#` de título e bloco de código inteiro ficam de fora, senão a contagem premia quem
 * escreve mais símbolo. Quem faz esse corte é o `stripMarkdown` de `lib/markdown.ts` — o mesmo que
 * já gera o excerpt dos cards, para os dois números nunca discordarem.
 *
 * Pura de propósito: é a parte que erra (acento contado como dois, espaço duplo virando palavra
 * fantasma) e a que dá para testar sem renderizar nada.
 */

/**
 * Palavras por minuto de leitura silenciosa em português adulto. 200 é o meio da faixa clássica
 * (180–240) e é o que Medium/Obsidian usam para textos comuns; número redondo de propósito, porque
 * a promessa aqui é "dá para ler num café", não precisão de cronômetro.
 */
export const READING_WORDS_PER_MINUTE = 200;

export interface NoteCount {
  words: number;
  /** Caracteres do texto limpo, espaços inclusos — é o que conta para um limite de publicação. */
  characters: number;
  /** Minutos de leitura, arredondados para cima. Texto não vazio nunca é "0 min". */
  minutes: number;
}

export function countWords(markdown: string): NoteCount {
  const text = stripMarkdown(markdown);
  if (!text) return { words: 0, characters: 0, minutes: 0 };

  // `stripMarkdown` já colapsou espaço repetido e cortou as pontas: o `split` não gera vazio.
  const words = text.split(" ").filter(Boolean).length;
  return {
    words,
    // `[...text]` conta **caracteres**, não unidades UTF-16: um emoji é um, "ção" é três.
    characters: [...text].length,
    minutes: Math.max(1, Math.ceil(words / READING_WORDS_PER_MINUTE)),
  };
}
