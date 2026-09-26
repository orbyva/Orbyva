import { stripMarkdown } from "@/lib/markdown";

/**
 * # Contagem de palavras da nota
 *
 * O rodapé do editor mostra quanto texto existe — e "texto" aqui é o que o **leitor** vê, não o que
 * está no arquivo. Contar `#`, `**` e o conteúdo de um bloco de código como palavra deixaria o
 * número errado exatamente nas notas mais formatadas, que são as que mais precisam da contagem.
 *
 * A limpeza reusa o `stripMarkdown` de `lib/markdown.ts` (o mesmo que os cards da lista usam para o
 * excerpt), com dois acréscimos que só fazem sentido aqui: cerca **não fechada** — comum enquanto
 * se escreve — e tag HTML, que o preview nem renderiza (decisão da 055) e portanto ninguém lê.
 */
export type NoteWordCount = {
  words: number;
  characters: number;
  /** Minutos de leitura, arredondados para cima. Zero só quando não há palavra nenhuma. */
  readingMinutes: number;
  /** Alias de `readingMinutes` — consumidores da feature 070 usam este nome. */
  minutes: number;
};

/**
 * Palavras por minuto de leitura silenciosa de prosa. 200 é o número conservador usado pela
 * literatura (adulto, texto comum); mais alto que isso vira promessa que o leitor não cumpre.
 */
export const READING_WORDS_PER_MINUTE = 200;

/** Cerca de bloco de código, na mesma leitura que `outline.ts` faz. */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** Tag HTML. O preview não renderiza HTML cru (055) — o que está aqui é marcação invisível. */
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;

/**
 * Tira os blocos de código, linha a linha — **inclusive o que não fechou**, que é o estado normal
 * de uma nota sendo escrita. Linha a linha, e não por regex de bloco inteiro, porque uma regex com
 * `$` e a flag `m` pararia na primeira quebra de linha (bug pego em teste).
 */
function stripFencedBlocks(content: string): string {
  const kept: string[] = [];
  let openFence: string | null = null;

  for (const line of content.split("\n")) {
    const fence = FENCE_RE.exec(line);
    if (fence) {
      if (openFence === null) openFence = fence[1];
      else if (fence[1][0] === openFence[0] && fence[1].length >= openFence.length) {
        openFence = null;
      }
      continue;
    }
    if (openFence === null) kept.push(line);
  }

  return kept.join("\n");
}

/**
 * A linha do rodapé: `12 palavras · 68 caracteres · 1 min de leitura`.
 *
 * Mora aqui, e não no componente, porque plural é regra de texto e regra de texto se testa: "1
 * palavra" e "2 palavras", "1 caractere" e "2 caracteres".
 */
export function formatWordCount(count: NoteWordCount): string {
  return [
    plural(count.words, "palavra", "palavras"),
    plural(count.characters, "caractere", "caracteres"),
    `${count.readingMinutes} min de leitura`,
  ].join(" · ");
}

function plural(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

export function countWords(content: string): NoteWordCount {
  const plain = stripMarkdown(
    stripFencedBlocks(content).replace(HTML_TAG_RE, " ")
  );

  if (!plain) return { words: 0, characters: 0, readingMinutes: 0, minutes: 0 };

  const words = plain.split(/\s+/).filter(Boolean).length;
  // `[...plain]` conta **caracteres**, não unidades UTF-16: um emoji é um, "ção" é três.
  const characters = [...plain].length;
  const readingMinutes = Math.max(1, Math.ceil(words / READING_WORDS_PER_MINUTE));
  return {
    words,
    characters,
    readingMinutes,
    minutes: readingMinutes,
  };
}
