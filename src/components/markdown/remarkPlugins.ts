import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { PluggableList } from "unified";
import { remarkCallout } from "@/components/markdown/remarkCallout";

/**
 * Plugins remark do Markdown do app — o segundo ponto de extensão da feature 057.
 *
 * Enquanto o `blockRegistry` estende o *render* (linguagem de fence → componente), este array
 * estende o *parser*: é onde entra qualquer sintaxe nova (footnote, mark, math…) sem tocar em
 * `MarkdownPreview`. Acrescentar um plugin aqui vale para todo Markdown renderizado no app, nota e
 * descrição de tarefa inclusive.
 *
 * Começa com `remark-gfm` (tabela, riscado, checklist, autolink), que é o que já existia.
 *
 * `remarkCallout` é o primeiro plugin escrito aqui dentro: marca `> [!NOTE]` para o
 * `CalloutBlock` desenhar. Ele só **anota** o nó — nada de HTML. Título opcional na mesma linha
 * (dialeto Obsidian) vira atributo; tipo desconhecido continua citação comum.
 *
 * `remark-math` só **parseia** `$…$` e `$$…$$`; ele não desenha nada. O que ele entrega ao hast é
 * `code.language-math` — o mesmo formato de fence que o `blockRegistry` já sabe rotear — e é por
 * lá que `MathBlock`/`InlineMath` entram. Sem eles, uma fórmula degrada para o código-fonte em
 * monoespaçada: legível, nunca em branco. O **rendering** é `katex`, carregado por `import()`
 * dinâmico dentro do componente — não aqui, senão ele entraria no chunk da rota.
 *
 * **Cuidado com plugins que produzem HTML cru**: sem `rehype-raw` o `react-markdown` ignora HTML, e
 * é assim que o preview fica livre de XSS sem sanitizador (decisão da 055). Plugin que dependa de
 * HTML cru para funcionar exige `rehype-sanitize` no mesmo passo.
 */
export const MARKDOWN_REMARK_PLUGINS: PluggableList = [
  remarkGfm,
  remarkCallout,
  remarkMath,
];
