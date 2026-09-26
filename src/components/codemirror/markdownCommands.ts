import { EditorSelection } from "@codemirror/state";
import type {
  ChangeSpec,
  EditorState,
  TransactionSpec,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/**
 * # Comandos de formatação do Markdown (feature 068)
 *
 * A barra de ferramentas e os atalhos (`Mod-b`, `Mod-i`…) são **dois gatilhos para as mesmas
 * funções** que estão aqui. Nada neste módulo toca em React nem em DOM: cada comando é uma função
 * pura de `EditorState` → `TransactionSpec`, e o wrapper que recebe `EditorView` só despacha o que
 * a função pura montou.
 *
 * É a mesma escolha de `livePreview.ts` e `wikiLinkCompletion.ts`, e pelo mesmo motivo: assim dá
 * para afirmar em teste que "negrito com seleção vazia põe o cursor no meio" e que "aplicar duas
 * vezes desfaz", sem navegador — que é o único jeito de provar comportamento neste projeto (a
 * skill `next` proíbe verificação por Chrome).
 *
 * O documento continua sendo markdown cru: estes comandos **escrevem a sintaxe** que o usuário
 * escreveria à mão, em vez de guardar formatação em outra estrutura. É o contrato "MARKDOWN NA
 * VEIA" da 056 continuando de pé — o que muda é só o custo de digitar.
 */

/** Delimitador de cada marca inline, na sintaxe que o preview (067) renderiza. */
export const INLINE_MARK = {
  bold: "**",
  italic: "_",
  strikethrough: "~~",
  code: "`",
} as const;

export type InlineMark = keyof typeof INLINE_MARK;

/** Prefixos de linha que o editor sabe alternar. `1.` sempre, porque o Markdown renumera sozinho. */
export const LINE_PREFIX = {
  bullet: "- ",
  ordered: "1. ",
  task: "- [ ] ",
  quote: "> ",
} as const;

export type LinePrefixKind = keyof typeof LINE_PREFIX;

/**
 * Como reconhecer um prefixo **já escrito** — mais largo que o que o editor insere: `*` e `+`
 * também abrem lista no Markdown, `- [x]` é uma tarefa já marcada, e `7.` é uma lista numerada
 * começando em outro número. Alternar precisa reconhecer o que o usuário escreveu, não só o que
 * este módulo produz.
 *
 * A ordem importa: `task` antes de `bullet`, senão `- [ ] item` seria lido como lista comum.
 */
const PREFIX_PATTERN: readonly [LinePrefixKind, RegExp][] = [
  ["task", /^[-*+] \[[ xX]\] /],
  ["bullet", /^[-*+] /],
  ["ordered", /^\d+\. /],
  ["quote", /^> /],
];

/** `## ` — o marcador de título ATX, com o espaço obrigatório. */
const HEADING_PATTERN = /^(#{1,6}) /;

/** Níveis oferecidos por atalho e pela barra. Nota não é livro: três níveis dão a hierarquia toda. */
export const HEADING_LEVELS = [1, 2, 3] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/**
 * Alterna uma marca inline sobre cada seleção.
 *
 * Três casos, nesta ordem:
 * 1. a seleção **contém** os delimitadores (`[**forte**]`) → tira, e a seleção passa a ser o texto;
 * 2. os delimitadores estão logo **fora** da seleção (`**[forte]**`, e também o cursor vazio dentro
 *    de um par recém-inserido `**|**`) → tira;
 * 3. caso contrário, envolve — com seleção vazia isso vira o par com o cursor no meio, que é o que
 *    faz `Mod-b` e depois digitar funcionar como em qualquer editor.
 */
export function inlineMarkEdit(
  state: EditorState,
  mark: InlineMark
): TransactionSpec {
  const delimiter = INLINE_MARK[mark];
  const size = delimiter.length;

  return state.changeByRange((range) => {
    const { from, to } = range;
    const selected = state.sliceDoc(from, to);

    if (
      selected.length >= size * 2 &&
      selected.startsWith(delimiter) &&
      selected.endsWith(delimiter)
    ) {
      const inner = selected.slice(size, selected.length - size);
      return {
        changes: { from, to, insert: inner },
        range: EditorSelection.range(from, from + inner.length),
      };
    }

    const before = state.sliceDoc(Math.max(0, from - size), from);
    const after = state.sliceDoc(to, Math.min(state.doc.length, to + size));
    if (before === delimiter && after === delimiter) {
      return {
        changes: [
          { from: from - size, to: from },
          { from: to, to: to + size },
        ],
        range: EditorSelection.range(from - size, to - size),
      };
    }

    return {
      changes: [
        { from, insert: delimiter },
        { from: to, insert: delimiter },
      ],
      range: range.empty
        ? EditorSelection.cursor(from + size)
        : EditorSelection.range(from + size, to + size),
    };
  });
}

/**
 * Alterna o nível de título das linhas tocadas pela seleção.
 *
 * Aplicar `## ` numa linha que já é `# ` **troca o nível** em vez de virar `### `: acumular `#` é
 * exatamente o erro que faz o usuário desistir do atalho e voltar a digitar na mão. Aplicar o mesmo
 * nível duas vezes devolve a linha a parágrafo.
 */
export function headingEdit(
  state: EditorState,
  level: HeadingLevel
): TransactionSpec {
  const marker = `${"#".repeat(level)} `;
  return lineEdit(state, (text) => {
    const current = HEADING_PATTERN.exec(text);
    if (!current) return { remove: 0, insert: marker };
    if (current[1].length === level) return { remove: current[0].length, insert: "" };
    return { remove: current[0].length, insert: marker };
  });
}

/**
 * Alterna lista, lista numerada, checklist ou citação nas linhas da seleção.
 *
 * Trocar de um prefixo para outro **substitui** (uma linha não é lista e citação ao mesmo tempo
 * pelo mesmo marcador), e repetir o mesmo prefixo remove. A indentação é preservada: alternar
 * checklist num item aninhado não pode desalinhá-lo da lista de cima.
 */
export function linePrefixEdit(
  state: EditorState,
  kind: LinePrefixKind
): TransactionSpec {
  const marker = LINE_PREFIX[kind];
  return lineEdit(state, (text) => {
    const indent = /^[ \t]*/.exec(text)?.[0] ?? "";
    const body = text.slice(indent.length);
    const found = detectPrefix(body);
    if (!found) return { remove: indent.length, insert: `${indent}${marker}` };
    if (found.kind === kind) {
      return { remove: indent.length + found.text.length, insert: indent };
    }
    return {
      remove: indent.length + found.text.length,
      insert: `${indent}${marker}`,
    };
  });
}

/**
 * Insere o esqueleto de link.
 *
 * Com seleção, o texto selecionado vira o rótulo e o cursor cai **dentro dos parênteses**, que é o
 * que falta escrever. Sem seleção, entra `[]()` com o cursor dentro dos colchetes.
 */
export function linkEdit(state: EditorState): TransactionSpec {
  return state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    const insert = `[${text}]()`;
    const cursor = range.empty
      ? range.from + 1
      : range.from + insert.length - 1;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(cursor),
    };
  });
}

/**
 * Insere um trecho pronto no lugar da seleção, com o cursor em `cursorOffset` caracteres depois do
 * início do trecho — é assim que "bloco de código" deixa o cursor **dentro** da cerca, e não depois
 * dela.
 */
export function snippetEdit(
  state: EditorState,
  text: string,
  cursorOffset: number = text.length
): TransactionSpec {
  return state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: text },
    range: EditorSelection.cursor(range.from + cursorOffset),
  }));
}

// ---- wrappers de view -------------------------------------------------------------------------
// A camada fina que a barra e o keymap chamam. Tudo o que decide *o que* muda está acima.

export function toggleInlineMark(view: EditorView, mark: InlineMark): boolean {
  return apply(view, inlineMarkEdit(view.state, mark));
}

export function toggleHeading(view: EditorView, level: HeadingLevel): boolean {
  return apply(view, headingEdit(view.state, level));
}

export function toggleLinePrefix(
  view: EditorView,
  kind: LinePrefixKind
): boolean {
  return apply(view, linePrefixEdit(view.state, kind));
}

export function insertLink(view: EditorView): boolean {
  return apply(view, linkEdit(view.state));
}

export function insertSnippet(
  view: EditorView,
  text: string,
  cursorOffset?: number
): boolean {
  return apply(view, snippetEdit(view.state, text, cursorOffset));
}

/**
 * Despacha e devolve o foco. O foco importa: quase todo comando daqui é disparado por um botão da
 * barra, e sem isso o usuário teria que clicar de volta no texto para continuar escrevendo.
 */
function apply(view: EditorView, spec: TransactionSpec): boolean {
  view.dispatch({ ...spec, scrollIntoView: true, userEvent: "input.format" });
  view.focus();
  return true;
}

// ---- internos ---------------------------------------------------------------------------------

/** Qual prefixo (se algum) já abre esta linha, e com que texto exato. */
function detectPrefix(
  body: string
): { kind: LinePrefixKind; text: string } | null {
  for (const [kind, pattern] of PREFIX_PATTERN) {
    const match = pattern.exec(body);
    if (match) return { kind, text: match[0] };
  }
  return null;
}

/** O que trocar no **começo** de uma linha: quantos caracteres saem e o que entra no lugar. */
type LineChange = { remove: number; insert: string };

/**
 * Aplica uma troca de prefixo em cada linha tocada pela seleção.
 *
 * Só o começo da linha entra no `ChangeSet` — reescrever a linha inteira faria a seleção do usuário
 * colapsar ao ser remapeada. Com a mudança restrita ao prefixo, `selection.map` devolve as mesmas
 * posições deslocadas, e quem estava com um trecho selecionado continua com ele selecionado depois
 * de virar lista.
 */
function lineEdit(
  state: EditorState,
  transform: (text: string) => LineChange
): TransactionSpec {
  const changes: ChangeSpec[] = [];
  for (const lineNumber of selectedLineNumbers(state)) {
    const line = state.doc.line(lineNumber);
    const { remove, insert } = transform(line.text);
    if (remove === 0 && insert === "") continue;
    if (line.text.slice(0, remove) === insert) continue;
    changes.push({ from: line.from, to: line.from + remove, insert });
  }
  if (changes.length === 0) return {};
  const set = state.changes(changes);
  // `assoc: 1` mantém o cursor **depois** do marcador recém-inserido: quem apertou `Mod-Shift-1`
  // com o cursor no começo da linha continua pronto para digitar o título, não antes do `# `.
  return { changes: set, selection: state.selection.map(set, 1) };
}

/** Números (1-based) das linhas tocadas por alguma seleção, sem repetir. */
function selectedLineNumbers(state: EditorState): number[] {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n += 1) lines.add(n);
  }
  return [...lines].sort((a, b) => a - b);
}
