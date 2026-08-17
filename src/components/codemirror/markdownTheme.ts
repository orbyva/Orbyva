import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/**
 * Tema do editor de Markdown, escrito só com as variáveis CSS de `src/index.css`
 * (`--background`, `--foreground`, `--muted`, `--primary`, `--border`, `--ring`).
 *
 * Por que variáveis e não cores literais: o dark mode do app é a classe `.dark` no `<html>`
 * (`tailwind.config.js: darkMode: ["class"]`), então um tema em `hsl(var(--…))` acompanha a troca
 * sozinho — sem tema claro/escuro duplicado nem listener de preferência.
 */
export const markdownEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "hsl(var(--foreground))",
    fontSize: "13px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
    lineHeight: "1.65",
  },
  ".cm-content": { padding: "8px 0", caretColor: "hsl(var(--foreground))" },
  ".cm-line": { padding: "0 12px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--foreground))" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "hsl(var(--primary) / 0.25)" },
  ".cm-activeLine": { backgroundColor: "hsl(var(--muted) / 0.45)" },
  ".cm-placeholder": { color: "hsl(var(--muted-foreground))" },
  ".cm-tooltip": {
    backgroundColor: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "6px",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    padding: "4px 8px",
    fontFamily: "inherit",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "hsl(var(--accent))",
    color: "hsl(var(--accent-foreground))",
  },
});

/**
 * Cores da sintaxe. Deliberadamente discreta: o realce forte de negrito/itálico/título é feito por
 * decorações no `livePreview`, aqui ficam só os tokens que o live preview não trata (link, código,
 * citação, marcador de lista).
 */
export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.link, color: "hsl(var(--primary))", textDecoration: "underline" },
  { tag: tags.url, color: "hsl(var(--muted-foreground))" },
  { tag: tags.monospace, color: "hsl(var(--primary))" },
  { tag: tags.quote, color: "hsl(var(--muted-foreground))", fontStyle: "italic" },
  { tag: tags.list, color: "hsl(var(--muted-foreground))" },
  { tag: tags.contentSeparator, color: "hsl(var(--muted-foreground))" },
  { tag: tags.processingInstruction, color: "hsl(var(--muted-foreground))" },
]);

/** Tema + realce de sintaxe, no formato que o `MarkdownCodeEditor` injeta. */
export const markdownThemeExtension: Extension = [
  markdownEditorTheme,
  syntaxHighlighting(markdownHighlightStyle),
];
