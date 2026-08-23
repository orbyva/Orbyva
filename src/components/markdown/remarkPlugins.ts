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
 * `remarkCallout` (067) é o primeiro plugin escrito aqui dentro: marca `> [!NOTE]` para o
 * `CalloutBlock` desenhar. Ele só **anota** o nó — nada de HTML.
 *
 * `remark-math` (067) reconhece `$…$` e `$$…$$` e os entrega como `code.language-math`, que é
 * exatamente o formato que o `blockRegistry` já sabe rotear — por isso quem desenha a fórmula é o
 * `MathBlock`, registrado lá, e não um `rehype-katex` que arrastaria o KaTeX para dentro deste
 * chunk. Ver Decisões da 067.
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
