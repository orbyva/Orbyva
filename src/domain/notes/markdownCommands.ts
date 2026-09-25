import { isInsideCode } from "@/domain/notes/wikiLinks";

/**
 * # Transformações de Markdown — o miolo puro dos atalhos e da barra de ferramentas (feature 070)
 *
 * Toda operação de formatação do editor de notas (negrito, título, lista, citação, link) é uma
 * função **pura** aqui: `(documento, seleção) => { text, selection }`. O comando do CodeMirror e o
 * botão da barra são cascas finas por cima disto.
 *
 * Por que separado do editor: é o que torna "aplicar negrito", "tirar negrito", "trocar o nível do
 * título" testável sem montar um editor nem abrir navegador — o mesmo espírito de `wikiLinks.ts` e
 * `canvasScene.ts`, que já isolam a regra do widget que a desenha.
 *
 * **Toda operação é _toggle_**: aplicar em texto que já tem a marcação **remove** a marcação. Meio
 * toggle é a origem de `****texto****` e de `#### ## Título`.
 */

/** Intervalo de seleção no documento, em offsets de caractere (`to` exclusivo). */
export interface TextSelection {
  from: number;
  to: number;
}

/** Documento novo + onde a seleção fica depois da transformação. */
export interface TextEdit {
  text: string;
  selection: TextSelection;
}

/** Marcadores de ênfase aceitos pelo `toggleWrap`. */
export type WrapMarker = "**" | "_" | "`" | "~~";

/** Tipos de lista que o `toggleList` aplica. */
export type ListKind = "bullet" | "ordered" | "task";

/** Níveis de título ATX (`#` a `######`). */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

function normalize(selection: TextSelection): TextSelection {
  const from = Math.max(0, Math.min(selection.from, selection.to));
  const to = Math.max(selection.from, selection.to);
  return { from, to };
}

/**
 * Envolve (ou desenvolve) a seleção com um marcador de ênfase.
 *
 * Três situações, nesta ordem:
 * 1. a própria seleção já começa e termina com o marcador (`**negrito**` selecionado inteiro) →
 *    remove;
 * 2. o marcador está **em volta** da seleção (`**negrito**` com só a palavra selecionada) → remove;
 * 3. caso contrário → envolve.
 *
 * Seleção vazia insere o par e deixa o cursor no meio — e, se o cursor já estiver no meio de um par
 * vazio, tira o par em vez de empilhar outro.
 */
export function toggleWrap(
  doc: string,
  selection: TextSelection,
  marker: WrapMarker
): TextEdit {
  const { from, to } = normalize(selection);
  const size = marker.length;
  const selected = doc.slice(from, to);

  if (from === to) {
    const wrapped =
      doc.slice(from - size, from) === marker &&
      doc.slice(from, from + size) === marker;
    if (wrapped) {
      return {
        text: doc.slice(0, from - size) + doc.slice(from + size),
        selection: { from: from - size, to: from - size },
      };
    }
    return {
      text: `${doc.slice(0, from)}${marker}${marker}${doc.slice(from)}`,
      selection: { from: from + size, to: from + size },
    };
  }

  if (
    selected.length >= size * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(size, selected.length - size);
    return {
      text: doc.slice(0, from) + inner + doc.slice(to),
      selection: { from, to: from + inner.length },
    };
  }

  if (doc.slice(from - size, from) === marker && doc.slice(to, to + size) === marker) {
    return {
      text: doc.slice(0, from - size) + selected + doc.slice(to + size),
      selection: { from: from - size, to: to - size },
    };
  }

  return {
    text: `${doc.slice(0, from)}${marker}${selected}${marker}${doc.slice(to)}`,
    selection: { from: from + size, to: to + size },
  };
}

/**
 * Aplica a transformação linha a linha em todas as linhas tocadas pela seleção, e devolve a seleção
 * remapeada.
 *
 * O remapeamento é possível porque **todas** as operações de linha daqui mexem só no prefixo: a
 * coluna de uma posição anda exatamente o tanto que o prefixo da linha dela cresceu ou encolheu.
 */
function editLines(
  doc: string,
  selection: TextSelection,
  transform: (line: string, index: number) => string
): TextEdit {
  const { from, to } = normalize(selection);
  const start = doc.lastIndexOf("\n", from - 1) + 1;
  const lineEnd = doc.indexOf("\n", to);
  const end = lineEnd === -1 ? doc.length : lineEnd;

  const lines = doc.slice(start, end).split("\n");
  const next = lines.map(transform);
  const deltas = next.map((line, index) => line.length - lines[index].length);
  const total = deltas.reduce((sum, delta) => sum + delta, 0);
  const text = doc.slice(0, start) + next.join("\n") + doc.slice(end);

  const map = (pos: number): number => {
    if (pos <= start) return pos;
    if (pos > end) return pos + total;
    let oldStart = start;
    let newStart = start;
    for (let i = 0; i < lines.length; i += 1) {
      const oldEnd = oldStart + lines[i].length;
      if (pos <= oldEnd) {
        const column = pos - oldStart;
        return newStart + Math.max(0, Math.min(column + deltas[i], next[i].length));
      }
      oldStart = oldEnd + 1;
      newStart += next[i].length + 1;
    }
    return pos + total;
  };

  return { text, selection: { from: map(from), to: map(to) } };
}

/** `#` a `######` no começo da linha, com o espaço obrigatório do CommonMark. */
const HEADING_RE = /^(\s{0,3})(#{1,6})\s+/;

/**
 * Título ATX no nível pedido. Linha que já está **nesse** nível volta a texto comum; linha em outro
 * nível **troca** de nível (não empilha `##` na frente de `#`).
 */
export function toggleHeading(
  doc: string,
  selection: TextSelection,
  level: HeadingLevel
): TextEdit {
  const { from, to } = normalize(selection);
  const start = doc.lastIndexOf("\n", from - 1) + 1;
  const lineEnd = doc.indexOf("\n", to);
  const end = lineEnd === -1 ? doc.length : lineEnd;
  const lines = doc.slice(start, end).split("\n");
  const marker = "#".repeat(level);
  const allAtLevel = lines.every((line) => HEADING_RE.exec(line)?.[2] === marker);

  return editLines(doc, selection, (line) => {
    const match = HEADING_RE.exec(line);
    const indent = match?.[1] ?? "";
    const content = match ? line.slice(match[0].length) : line.replace(/^\s{0,3}/, "");
    return allAtLevel ? indent + content : `${indent}${marker} ${content}`;
  });
}

/** Marcadores de lista reconhecidos, na ordem em que precisam ser testados (tarefa antes de item). */
const TASK_RE = /^(\s*)([-*+])\s+\[[ xX]\]\s+/;
const BULLET_RE = /^(\s*)([-*+])\s+/;
const ORDERED_RE = /^(\s*)(\d+)[.)]\s+/;

function listKindOf(line: string): ListKind | null {
  if (TASK_RE.test(line)) return "task";
  if (BULLET_RE.test(line)) return "bullet";
  if (ORDERED_RE.test(line)) return "ordered";
  return null;
}

/** Tira qualquer marcador de lista da linha, devolvendo indentação e conteúdo separados. */
function splitListLine(line: string): { indent: string; content: string } {
  const match = TASK_RE.exec(line) ?? BULLET_RE.exec(line) ?? ORDERED_RE.exec(line);
  if (!match) {
    const indent = /^\s*/.exec(line)?.[0] ?? "";
    return { indent, content: line.slice(indent.length) };
  }
  return { indent: match[1], content: line.slice(match[0].length) };
}

/**
 * Lista com marcador, lista numerada ou lista de tarefas.
 *
 * Linha que já é do tipo pedido perde o marcador; linha de **outro** tipo troca de marcador (um
 * item vira tarefa sem virar `- - [ ]`). Linha vazia fica vazia: marcador solto no meio do bloco é
 * item fantasma no render.
 */
export function toggleList(
  doc: string,
  selection: TextSelection,
  kind: ListKind
): TextEdit {
  const { from, to } = normalize(selection);
  const start = doc.lastIndexOf("\n", from - 1) + 1;
  const lineEnd = doc.indexOf("\n", to);
  const end = lineEnd === -1 ? doc.length : lineEnd;
  const lines = doc.slice(start, end).split("\n");
  const filled = lines.filter((line) => line.trim().length > 0);
  const allSame =
    filled.length > 0 && filled.every((line) => listKindOf(line) === kind);

  let ordinal = 0;
  return editLines(doc, selection, (line) => {
    if (!line.trim()) return line;
    const { indent, content } = splitListLine(line);
    if (allSame) return indent + content;
    ordinal += 1;
    if (kind === "ordered") return `${indent}${ordinal}. ${content}`;
    if (kind === "task") return `${indent}- [ ] ${content}`;
    return `${indent}- ${content}`;
  });
}

const QUOTE_RE = /^(\s*)>\s?/;

/** Citação (`> `). Bloco inteiro já citado volta a texto comum. */
export function toggleQuote(doc: string, selection: TextSelection): TextEdit {
  const { from, to } = normalize(selection);
  const start = doc.lastIndexOf("\n", from - 1) + 1;
  const lineEnd = doc.indexOf("\n", to);
  const end = lineEnd === -1 ? doc.length : lineEnd;
  const lines = doc.slice(start, end).split("\n");
  const allQuoted = lines.every((line) => QUOTE_RE.test(line));

  return editLines(doc, selection, (line) => {
    const match = QUOTE_RE.exec(line);
    if (allQuoted && match) return line.slice(0, match[1].length) + line.slice(match[0].length);
    if (allQuoted) return line;
    return `${line.slice(0, /^\s*/.exec(line)?.[0].length ?? 0)}> ${line.trimStart()}`;
  });
}

/**
 * Link markdown.
 *
 * Com seleção, o texto selecionado vira o rótulo e a seleção final cai **dentro dos parênteses** —
 * é lá que falta digitar. Sem seleção sai `[](url)` com o cursor entre os colchetes, que é o que
 * falta digitar nesse caso. `url` chega preenchida quando o atalho é usado com algo colado.
 */
export function insertLink(
  doc: string,
  selection: TextSelection,
  url = ""
): TextEdit {
  const { from, to } = normalize(selection);
  const label = doc.slice(from, to);
  const text = `${doc.slice(0, from)}[${label}](${url})${doc.slice(to)}`;

  if (label) {
    const urlStart = from + 1 + label.length + 2;
    return { text, selection: { from: urlStart, to: urlStart + url.length } };
  }
  return { text, selection: { from: from + 1, to: from + 1 } };
}

/**
 * Marca/desmarca a **n-ésima** caixa de tarefa do documento (0-based), devolvendo o markdown novo.
 *
 * O índice é a **ordem de ocorrência** no texto porque é a única chave que o preview também tem: o
 * `react-markdown` entrega o `<input type="checkbox">` sem posição no documento (não há
 * `sourcepos`), então quem clica no terceiro checkbox da tela está clicando no terceiro do texto.
 *
 * Caixa dentro de bloco de código **não conta** — lá é exemplo de sintaxe, e ela nem vira caixa na
 * tela. Índice fora do intervalo devolve o texto intacto, em vez de lançar: é uma ação de clique,
 * não vale derrubar a tela por uma contagem dessincronizada.
 */
export function toggleTaskListItem(markdown: string, index: number): string {
  if (index < 0) return markdown;

  // `-`, `*`, `+` ou `1.`/`1)` seguido de `[ ]`/`[x]` — a sintaxe de tarefa do GFM, em qualquer lista.
  const TASK_RE = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+\[)([ xX])(\])/gm;
  let match: RegExpExecArray | null;
  let seen = 0;

  while ((match = TASK_RE.exec(markdown)) !== null) {
    if (isInsideCode(markdown, match.index)) continue;
    if (seen === index) {
      const at = match.index + match[1].length;
      const next = match[2] === " " ? "x" : " ";
      // Troca **um** caractere: a indentação, o marcador e o texto do item ficam exatamente como
      // estavam. Reescrever a linha inteira é como se perde `- [ ]   texto   alinhado`.
      return markdown.slice(0, at) + next + markdown.slice(at + 1);
    }
    seen += 1;
  }

  return markdown;
}
