import { markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import {
  LRLanguage,
  Language,
  LanguageDescription,
  LanguageSupport,
  ParseContext,
} from "@codemirror/language";
import { parseCode } from "@lezer/markdown";
import { keymap } from "@codemirror/view";
import type { MarkdownParser } from "@lezer/markdown";
import type { Parser } from "@lezer/common";

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
 * **O realce dentro do fence voltou na 070**, mas pelo caminho oficial de carga sob demanda: o
 * `parseCode` do `@lezer/markdown` aceita um `codeParser` que devolve
 * `ParseContext.getSkippingParser(promise)` — o bloco fica sem cor até a gramática chegar e é
 * reparseado sozinho depois. Cada `import()` abaixo vira um chunk lazy próprio (ver o
 * `manualChunks` do `vite.config.ts`, que precisa **excluir** estes pacotes do chunk `codemirror`),
 * então o custo fixo do editor não muda: quem nunca escreve ```sql nunca baixa o parser de SQL.
 * É a resposta direta ao trade-off que a 057 registrou.
 *
 * O HTML dentro do Markdown continua sem parser de propósito: HTML embutido nem é renderizado no
 * preview (decisão de segurança da 055), e é ele que arrastava os 73 KB. ` ```html ` como bloco de
 * código, esse sim, é colorido — é conteúdo, não marcação ativa.
 *
 * `markdownKeymap` vem junto porque é o que continua lista/citação no Enter e apaga a marcação no
 * Backspace — comportamento de editor de notas, e não depende de nenhum parser de linguagem.
 */

/**
 * Gramáticas oferecidas dentro de ` ```lang `. Lista curta de propósito: é o que aparece numa nota
 * deste app. Linguagem fora dela não é erro — o bloco sai sem cor, exatamente como hoje.
 *
 * Os `alias` seguem os nomes que as pessoas escrevem no fence (`js`, `ts`, `sh`, `py`…).
 */
export const FENCE_LANGUAGES: LanguageDescription[] = [
  LanguageDescription.of({
    name: "javascript",
    alias: ["js", "jsx", "typescript", "ts", "tsx"],
    extensions: ["js", "jsx", "ts", "tsx"],
    load: () =>
      import("@codemirror/lang-javascript").then((m) =>
        m.javascript({ jsx: true, typescript: true })
      ),
  }),
  LanguageDescription.of({
    name: "json",
    extensions: ["json"],
    load: () => import("@codemirror/lang-json").then((m) => m.json()),
  }),
  LanguageDescription.of({
    name: "css",
    extensions: ["css"],
    load: () => import("@codemirror/lang-css").then((m) => m.css()),
  }),
  /**
   * HTML vem do **parser cru** (`@lezer/html`), não de `@codemirror/lang-html`.
   *
   * Motivo, medido nesta feature: `@codemirror/lang-markdown` importa `lang-html` de forma
   * estática (é o que a fábrica `markdown()` usa para o HTML embutido). Hoje ele é eliminado por
   * tree-shaking porque ninguém o usa; bastou um `import()` dinâmico dele aqui para o Rollup ter
   * de mantê-lo no grafo **estático** — e o chunk `codemirror` saltou de 138,9 KB para 211,8 KB
   * gzip, estourando o teto de vendor. Indo direto ao `@lezer/html`, que só o fence alcança, o
   * realce de HTML continua existindo e o custo fixo do editor não muda.
   */
  LanguageDescription.of({
    name: "html",
    alias: ["htm"],
    extensions: ["html", "htm"],
    load: () =>
      import("@lezer/html").then(
        (m) => new LanguageSupport(LRLanguage.define({ parser: m.parser }))
      ),
  }),
  LanguageDescription.of({
    name: "sql",
    extensions: ["sql"],
    load: () => import("@codemirror/lang-sql").then((m) => m.sql()),
  }),
  LanguageDescription.of({
    name: "python",
    alias: ["py"],
    extensions: ["py"],
    load: () => import("@codemirror/lang-python").then((m) => m.python()),
  }),
  LanguageDescription.of({
    name: "shell",
    alias: ["bash", "sh", "zsh", "console"],
    extensions: ["sh"],
    load: () =>
      Promise.all([
        import("@codemirror/legacy-modes/mode/shell"),
        import("@codemirror/language"),
      ]).then(
        ([mode, language]) =>
          new LanguageSupport(language.StreamLanguage.define(mode.shell))
      ),
  }),
];

/**
 * Parser do fence: o nome escrito depois das crases → parser da linguagem, ou `null` (bloco sem
 * cor). Enquanto o `import()` não resolve, `getSkippingParser` deixa o trecho intocado e manda
 * reparsear quando a promessa chega — nada trava e nada pisca em vermelho.
 */
function fenceCodeParser(info: string): Parser | null {
  if (!info) return null;
  // O nome do fence pode vir com atributos (```js {1,3}) — só a primeira palavra é a linguagem.
  const name = info.split(/\s+/)[0];
  const found = LanguageDescription.matchLanguageName(FENCE_LANGUAGES, name, true);
  if (!found) return null;
  if (found.support) return found.support.language.parser;
  return ParseContext.getSkippingParser(found.load());
}

/**
 * O mesmo `markdownLanguage` do `lang-markdown`, com o parser de fence pendurado.
 *
 * O `data` é reaproveitado (e não criado de novo) porque é nele que penduram o autocomplete de
 * `[[` (056) e o menu `/` (070): um facet novo deixaria os dois falando com uma linguagem que o
 * editor não usa.
 */
const markdownWithCode = new Language(
  markdownLanguage.data,
  // `Language.parser` é tipado como `Parser` genérico; aqui ele é, comprovadamente, o parser de
  // Markdown do `@lezer/markdown` — que é quem sabe `configure`.
  (markdownLanguage.parser as MarkdownParser).configure([
    parseCode({ codeParser: fenceCodeParser }),
  ]),
  [],
  "markdown"
);

export const markdownSupport = new LanguageSupport(markdownWithCode, [
  keymap.of(markdownKeymap),
]);
