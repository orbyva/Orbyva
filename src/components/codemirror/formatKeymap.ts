import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { Command, KeyBinding } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import {
  insertLink,
  toggleHeading,
  toggleInlineMark,
  toggleLinePrefix,
} from "@/components/codemirror/markdownCommands";

/**
 * # Atalhos de formatação e o catálogo que a barra reusa (feature 068)
 *
 * Uma lista só, dois consumidores: o `keymap` do `MarkdownCodeEditor` e a
 * `NoteEditorToolbar`. Rótulo, tecla e comando ficam **no mesmo lugar** — a barra não redigita
 * "Negrito" nem "Mod-b", ela lê daqui. Botão e atalho que discordam do que fazem são o jeito mais
 * fácil de a barra virar mentira.
 *
 * Mora num módulo próprio, e não no `MarkdownCodeEditor.tsx`, pela mesma razão que `CALLOUT_LABEL`
 * saiu do `CalloutBlock` na 067: constante exportada de arquivo de componente acende
 * `react-refresh/only-export-components`, e a regra do repo é não acrescentar warning novo.
 */
export type FormatActionId =
  | "bold"
  | "italic"
  | "strikethrough"
  | "code"
  | "link"
  | "bullet"
  | "ordered"
  | "task"
  | "quote"
  | "heading1"
  | "heading2"
  | "heading3";

export type FormatAction = {
  id: FormatActionId;
  /** Nome em português — vira `aria-label` do botão e prefixo do `title`. */
  label: string;
  /** Notação de tecla do CodeMirror (`Mod` = ⌘ no macOS, Ctrl no resto). Sem tecla = só na barra. */
  key?: string;
  run: Command;
};

export const MARKDOWN_FORMAT_ACTIONS: readonly FormatAction[] = [
  { id: "bold", label: "Negrito", key: "Mod-b", run: (view) => toggleInlineMark(view, "bold") },
  { id: "italic", label: "Itálico", key: "Mod-i", run: (view) => toggleInlineMark(view, "italic") },
  {
    id: "strikethrough",
    label: "Riscado",
    key: "Mod-Shift-x",
    run: (view) => toggleInlineMark(view, "strikethrough"),
  },
  { id: "code", label: "Código", key: "Mod-e", run: (view) => toggleInlineMark(view, "code") },
  { id: "link", label: "Link", key: "Mod-k", run: insertLink },
  { id: "bullet", label: "Lista", run: (view) => toggleLinePrefix(view, "bullet") },
  { id: "ordered", label: "Lista numerada", run: (view) => toggleLinePrefix(view, "ordered") },
  // Checklist e citação ficam **sem** atalho de propósito: a Decisão da feature lista as teclas uma
  // a uma e estas não estão lá. `Mod-Shift-c` seria o candidato óbvio e é o inspetor do Chrome —
  // atalho que o navegador não devolve não é atalho.
  { id: "task", label: "Checklist", run: (view) => toggleLinePrefix(view, "task") },
  { id: "quote", label: "Citação", run: (view) => toggleLinePrefix(view, "quote") },
  { id: "heading1", label: "Título 1", key: "Mod-Shift-1", run: (view) => toggleHeading(view, 1) },
  { id: "heading2", label: "Título 2", key: "Mod-Shift-2", run: (view) => toggleHeading(view, 2) },
  { id: "heading3", label: "Título 3", key: "Mod-Shift-3", run: (view) => toggleHeading(view, 3) },
];

/** Índice por id — a barra pede a ação pelo nome, sem varrer a lista. */
export const FORMAT_ACTION_BY_ID: Record<FormatActionId, FormatAction> =
  Object.fromEntries(
    MARKDOWN_FORMAT_ACTIONS.map((action) => [action.id, action])
  ) as Record<FormatActionId, FormatAction>;

/**
 * `Mod-k` é o atalho da busca global do app (`GlobalSearch` escuta no `window`). Com
 * `stopPropagation`, a tecla tratada aqui **não** sobe até lá — senão inserir um link no meio da
 * nota abriria a busca global por cima do editor. O `preventDefault` implícito do CodeMirror já
 * cuida do comportamento nativo do navegador.
 */
const bindings: readonly KeyBinding[] = MARKDOWN_FORMAT_ACTIONS.filter(
  (action): action is FormatAction & { key: string } => Boolean(action.key)
).map((action) => ({
  key: action.key,
  run: action.run,
  stopPropagation: true,
}));

/**
 * `Prec.high` porque o keymap padrão do CodeMirror também disputa algumas destas teclas
 * (`Mod-i`/`Mod-e` em macOS, por exemplo). Fica abaixo do `literalTabKeymap` (`Prec.highest`), que
 * é onde o `Tab` precisa ganhar de tudo.
 */
export const markdownFormatKeymap: Extension = Prec.high(keymap.of(bindings));

/** macOS mostra ⌘; o resto do mundo, Ctrl. Detecção uma vez só, no carregamento do módulo. */
const IS_APPLE =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");

/**
 * `Mod-Shift-x` → `⌘⇧X` / `Ctrl+Shift+X`. É o texto do `title` do botão: a barra é a porta de
 * entrada, e o atalho ao lado do rótulo é como o usuário para de precisar dela.
 */
export function shortcutLabel(key: string): string {
  const parts = key.split("-");
  const last = parts.pop() ?? "";
  const mods = parts.map((part) => {
    if (part === "Mod") return IS_APPLE ? "⌘" : "Ctrl";
    if (part === "Shift") return IS_APPLE ? "⇧" : "Shift";
    if (part === "Alt") return IS_APPLE ? "⌥" : "Alt";
    return part;
  });
  const keyName = last.length === 1 ? last.toUpperCase() : last;
  return IS_APPLE
    ? `${mods.join("")}${keyName}`
    : [...mods, keyName].join("+");
}
