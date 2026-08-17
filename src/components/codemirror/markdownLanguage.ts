import { markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { LanguageSupport } from "@codemirror/language";
import { keymap } from "@codemirror/view";

/**
 * Markdown estendido (GFM: tabela, tarefa, riscado) **sem** a fábrica `markdown()` do
 * `@codemirror/lang-markdown`.
 *
 * Motivo, medido: `markdown()` embute `@codemirror/lang-html` para o HTML dentro do Markdown, que
 * arrasta `lang-javascript` e `lang-css` junto — o chunk `codemirror` ia a 212 KB gzip, acima do
 * teto de 200 KB de vendor (`scripts/check-bundle-budget.mjs`). Montando o `LanguageSupport`
 * direto do `markdownLanguage`, o parser de Markdown fica inteiro (é dele que o live preview lê a
 * árvore de sintaxe) e os três parsers de linguagem saem do bundle: 212 KB → 139 KB gzip.
 *
 * O que se perde: realce de sintaxe *dentro* de bloco de código cercado (```js) e de tag HTML —
 * o texto continua lá, cru e monoespaçado, só não vem colorido por linguagem. Trade-off aceito:
 * HTML embutido nem é renderizado no preview (decisão de segurança da 055).
 *
 * `markdownKeymap` vem junto porque é o que continua lista/citação no Enter e apaga a marcação no
 * Backspace — comportamento de editor de notas, e não depende de nenhum parser de linguagem.
 */
export const markdownSupport = new LanguageSupport(markdownLanguage, [
  keymap.of(markdownKeymap),
]);
