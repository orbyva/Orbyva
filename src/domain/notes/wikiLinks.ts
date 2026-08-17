/**
 * Wiki-links `[[Título da nota]]` — o que transforma notas soltas numa teia (feature 056).
 *
 * O link resolve por **título**, não por id: é o que o usuário digita e o que sobrevive a
 * copiar/colar entre notas. A consequência aceita (ver Decisões da 056) é que renomear uma nota
 * quebra os links que apontavam para o nome antigo; a UI mostra isso como "não resolvido" com ação
 * de criar a nota faltante, igual ao Obsidian, em vez de reescrever o markdown das outras notas.
 *
 * Módulo puro, sem I/O — quem vai ao banco é `src/api/notes/*`.
 */

/** Uma ocorrência de `[[…]]` no texto. `start`/`end` são índices no conteúdo (`end` exclusivo). */
export interface WikiLinkMatch {
  /** Título referenciado, já sem os colchetes e sem espaço nas pontas. */
  title: string;
  start: number;
  end: number;
}

/**
 * `[[` … `]]` sem colchete nem quebra de linha no meio. Recusar `[`/`]` internos é o que faz
 * `[[a[[b]]` casar só o `[[b]]`, e mantém o parser longe de link markdown comum (`[texto](url)`).
 */
const WIKI_LINK_RE = /\[\[([^[\]\n]+)]]/g;

/** Cerca de bloco de código: três ou mais crases/tis no começo da linha (pode vir indentada). */
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Intervalos `[from, to)` do conteúdo que são código — bloco cercado ou código inline. Wiki-link
 * dentro deles é texto literal, não referência: quem escreve ```` `[[exemplo]]` ```` está mostrando
 * a sintaxe, não linkando.
 */
function codeRanges(content: string): [number, number][] {
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

/**
 * Todos os `[[wiki-links]]` do conteúdo, na ordem em que aparecem — vários por linha inclusive.
 * Ocorrências dentro de código (bloco ou inline) ficam de fora, e `[[   ]]` (título vazio) também.
 */
export function parseWikiLinks(content: string): WikiLinkMatch[] {
  if (!content.includes("[[")) return [];
  const skip = codeRanges(content);
  const matches: WikiLinkMatch[] = [];

  WIKI_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_RE.exec(content)) !== null) {
    const start = match.index;
    if (skip.some(([from, to]) => start >= from && start < to)) continue;
    const title = match[1].trim();
    if (!title) continue;
    matches.push({ title, start, end: start + match[0].length });
  }

  return matches;
}

/**
 * Títulos referenciados, sem repetição e preservando a ordem de aparição. É o que a UI usa para
 * resolver os links de uma vez só, em vez de uma consulta por ocorrência.
 *
 * A comparação de título é feita por quem consome (`normalizeWikiTitle`); aqui a chave é o título
 * normalizado, mas o valor devolvido é a primeira grafia encontrada — quem escreveu decide a caixa.
 */
export function wikiLinkTitles(content: string): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const { title } of parseWikiLinks(content)) {
    const key = normalizeWikiTitle(title);
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  return titles;
}

/**
 * Chave de comparação entre o título escrito no `[[…]]` e o título da nota: sem caixa, sem espaço
 * duplicado nas pontas ou no meio. Acento **não** é removido — "Reunião" e "Reuniao" são notas
 * diferentes, e ignorar isso faria um link apontar para a nota errada.
 */
export function normalizeWikiTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}
