/**
 * "Que trechos deste Markdown são código?" — bloco cercado e código inline.
 *
 * Isto é regra de Markdown, não de notas: todo parser de marca no texto (wiki-link `[[…]]`,
 * referência de tarefa `[Rótulo](orbyva-task:<id>)`, e o que vier depois) precisa da mesma
 * resposta, sempre pelo mesmo critério. Viveu privado em `domain/notes/wikiLinks.ts` até a
 * feature 103; saiu de lá porque o domínio de tarefa não pode importar do de notas (fecharia
 * ciclo) e duplicar significaria dois parsers de cerca divergindo com o tempo.
 *
 * Módulo puro, sem I/O e sem dependência de domínio nenhum.
 */

/** Cerca de bloco de código: três ou mais crases/tis no começo da linha (pode vir indentada). */
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Intervalos `[from, to)` do conteúdo que são código — bloco cercado ou código inline. Marca
 * dentro deles é texto literal, não referência: quem escreve ```` `[[exemplo]]` ```` está
 * mostrando a sintaxe, não linkando.
 */
export function codeRanges(content: string): [number, number][] {
  const ranges: [number, number][] = [];
  let offset = 0;
  let fence: string | null = null;

  for (const line of content.split("\n")) {
    const fenceMatch = FENCE_RE.exec(line);
    if (fence) {
      // Dentro do bloco: a linha inteira é código, inclusive a linha que fecha a cerca.
      ranges.push([offset, offset + line.length]);
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
    } else if (fenceMatch) {
      fence = fenceMatch[1];
      ranges.push([offset, offset + line.length]);
    } else {
      for (const [from, to] of inlineCodeRanges(line)) {
        ranges.push([offset + from, offset + to]);
      }
    }
    offset += line.length + 1; // +1 = o "\n" que o split comeu
  }

  return ranges;
}

/**
 * Código inline numa linha: uma sequência de crases abre e a **primeira sequência do mesmo
 * tamanho** fecha (regra do CommonMark, que é o que permite `` `a`b` `` ). Crase sem par não abre
 * nada.
 */
function inlineCodeRanges(line: string): [number, number][] {
  const ranges: [number, number][] = [];
  let index = 0;

  while (index < line.length) {
    if (line[index] !== "`") {
      index += 1;
      continue;
    }
    let openEnd = index;
    while (line[openEnd] === "`") openEnd += 1;
    const ticks = line.slice(index, openEnd);
    const closeStart = line.indexOf(ticks, openEnd);
    if (closeStart === -1) {
      index = openEnd;
      continue;
    }
    let closeEnd = closeStart;
    while (line[closeEnd] === "`") closeEnd += 1;
    ranges.push([index, closeEnd]);
    index = closeEnd;
  }

  return ranges;
}
