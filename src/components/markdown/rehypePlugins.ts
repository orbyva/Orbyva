import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import type { PluggableList } from "unified";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { rehypeSkipRegisteredBlocks } from "@/components/markdown/rehypeSkipRegisteredBlocks";
import { rehypeTaskListIndex } from "@/components/markdown/rehypeTaskListIndex";

/**
 * Plugins rehype do Markdown do app — o terceiro ponto de extensão, irmão do `remarkPlugins.ts`
 * (feature 067).
 *
 * A diferença entre os dois é **em que árvore** cada um mexe. `remark` opera no mdast (a sintaxe do
 * Markdown: "isto é uma citação", "isto é uma fórmula"); `rehype` opera no hast, já convertido para
 * HTML ("este `<h2>` precisa de `id`", "este `<code>` precisa de `<span class="hljs-keyword">`").
 * Regra prática: sintaxe nova entra em `remarkPlugins.ts`; enriquecimento do HTML de saída entra
 * aqui. Acrescentar um plugin nesta lista vale para todo Markdown renderizado no app, nota e
 * descrição de tarefa inclusive.
 *
 * Começa com `rehype-slug`, que dá `id` a todo título (`# Etapas` → `<h2 id="etapas">`) usando o
 * `github-slugger` — mesmo algoritmo do GitHub, com desambiguação automática de títulos repetidos
 * (`etapas`, `etapas-1`). É o que permite linkar um trecho de nota, o que alimenta a âncora de
 * hover do `MarkdownPreview` e o que a 068 usa para montar o sumário.
 *
 * Sem `rehype-autolink-headings` de propósito: a âncora é um `components.h1..h6` próprio no
 * `MarkdownPreview`, para não instalar uma dependência inteira por causa de um `<a>`.
 *
 * **Cuidado com plugins que produzem HTML cru**: sem `rehype-raw` o `react-markdown` ignora HTML, e
 * é assim que o preview fica livre de XSS sem sanitizador (decisão da 055). Plugin que dependa de
 * HTML cru para funcionar exige `rehype-sanitize` no mesmo passo.
 */
/**
 * As linguagens registradas no realce, **uma a uma**. Não é `common` do lowlight (37 linguagens)
 * nem `all` (190): este chunk é carregado pela rota de Notas **e** pela descrição de tarefa, e
 * ninguém escreve nota em Erlang. Cada import é um arquivo do `highlight.js`, então a lista abaixo
 * é literalmente o que entra no bundle.
 *
 * Os apelidos vêm de brinde com a própria definição da linguagem (`ts`/`tsx` do `typescript`,
 * `js`/`jsx` do `javascript`, `html` do `xml`, `md` do `markdown`, `sh` do `bash`, `py` do
 * `python`), porque o `registerLanguage` do highlight.js registra os `aliases` declarados nela.
 *
 * Acrescentar uma linguagem é uma linha aqui — e um pouco mais de bundle, então vale medir com
 * `npm run check:bundle` (ver Notas da 067).
 */
export const MARKDOWN_HIGHLIGHT_LANGUAGES = {
  typescript,
  javascript,
  json,
  sql,
  bash,
  python,
  css,
  xml,
  markdown,
  diff,
};

export const MARKDOWN_REHYPE_PLUGINS: PluggableList = [
  rehypeSlug,
  /** Numera os `- [ ]` para o clique saber qual linha do Markdown reescrever (067). */
  rehypeTaskListIndex,
  /**
   * Precedência do `blockRegistry` (057) sobre o realce: precisa rodar **antes** do
   * `rehype-highlight`, senão ` ```mermaid ` chegaria ao `MermaidBlock` já picado em `<span>`.
   */
  rehypeSkipRegisteredBlocks,
  [
    rehypeHighlight,
    {
      languages: MARKDOWN_HIGHLIGHT_LANGUAGES,
      /**
       * `detect: false` é o padrão e fica explícito: bloco sem linguagem declarada continua texto
       * simples, em vez de o highlight.js chutar (e errar) o idioma de um trecho de três linhas.
       */
      detect: false,
    },
  ],
];
