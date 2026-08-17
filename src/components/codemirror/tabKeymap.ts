import { EditorSelection, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { Command, KeyBinding } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * `Tab` insere um tab literal no cursor (substituindo a seleção). É o mesmo contrato de
 * `MarkdownTextarea` (feature 055): indentar lista aninhada e bloco de código sem sair do campo.
 * Tab literal, não `indentWithTab` do `@codemirror/commands`, porque o documento é markdown cru do
 * usuário — o editor não decide unidade de indentação por ele.
 */
export const insertLiteralTab: Command = (view) => {
  view.dispatch(view.state.replaceSelection("\t"));
  return true;
};

/**
 * `Shift+Tab` remove **um** tab imediatamente antes do cursor, e só isso: com seleção ativa, ou
 * quando o caractere anterior não é tab, não faz nada (mesma regra do `MarkdownTextarea`).
 */
export const removeLiteralTab: Command = (view) => {
  const { state } = view;
  const spec = state.changeByRange((range) => {
    if (!range.empty || range.from === 0) return { range };
    if (state.sliceDoc(range.from - 1, range.from) !== "\t") return { range };
    return {
      changes: { from: range.from - 1, to: range.from },
      range: EditorSelection.cursor(range.from - 1),
    };
  });
  if (spec.changes.empty) return false;
  view.dispatch(spec);
  return true;
};

const bindings: readonly KeyBinding[] = [
  { key: "Tab", run: insertLiteralTab },
  { key: "Shift-Tab", run: removeLiteralTab },
];

/**
 * `Prec.highest` porque o keymap padrão do CodeMirror também disputa `Tab` (indentação por
 * linguagem); sem a precedência, quem ganha depende da ordem de montagem das extensões.
 */
export const literalTabKeymap: Extension = Prec.highest(keymap.of(bindings));
