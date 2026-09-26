import type { ComponentType } from "react";
import { MermaidBlock } from "@/components/markdown/MermaidBlock";
import { CanvasBlock } from "@/components/markdown/CanvasBlock";
import { MathBlock } from "@/components/markdown/MathBlock";
import {
  MATH_BLOCK_LANGUAGE,
  parseBlockLanguage,
} from "@/domain/notes/blockLanguage";
import { CANVAS_BLOCK_LANGUAGE } from "@/domain/notes/canvasScene";

/**
 * # Registry de renderers de bloco — os "plugins" do Markdown (feature 057)
 *
 * Bloco de código com linguagem registrada aqui deixa de ser texto monoespaçado e passa a ser
 * renderizado pelo componente correspondente. É como o Obsidian faz diagrama: não existe "tipo de
 * documento diagrama", existe ` ```mermaid ` e alguém que sabe desenhar mermaid.
 *
 * ## Como registrar um plugin novo (3 linhas)
 *
 * 1. Escreva o componente: `function FooBlock({ code }: { code: string })` — recebe o conteúdo cru
 *    do fence e devolve o que quiser. Se ele carregar biblioteca pesada, use `await import()`
 *    dentro dele (ver `MermaidBlock`), senão a dependência entra no bundle inicial.
 * 2. Adicione `foo: FooBlock` ao `blockRenderers` abaixo.
 * 3. Pronto: todo ` ```foo ` do app já renderiza por ele. Nada muda no editor nem no
 *    `MarkdownPreview`.
 *
 * **O que o renderer recebe é texto do usuário.** Quem produz HTML/SVG a partir dele é responsável
 * pela sanitização — o `MarkdownPreview` não tem `rehype-raw` de propósito (decisão da 055) e um
 * plugin não pode ser o buraco por onde HTML cru volta. Ver `src/lib/sanitizeSvg.ts`, que é a rede que o
 * `MermaidBlock` usa antes de deixar um SVG entrar na página.
 *
 * O outro ponto de extensão é o *parser*, não o render: `remarkPlugins.ts`.
 * O procedimento acima está exercitado em `MarkdownPreview.blocks.test.tsx`, que registra um
 * renderer de mentira exatamente assim e afirma o que aparece na tela.
 */
export type BlockRenderer = ComponentType<{
  code: string;
  /**
   * A `className` crua do `<code>` — o renderer quase sempre ignora, mas quem precisa da variante
   * dentro da linguagem lê daqui. É o caso do `MathBlock`, que distingue `math-inline` de
   * `math-display`. Renderer que só declara `{ code }` continua válido.
   */
  className?: string;
}>;

/**
 * Linguagem (minúscula, como `parseBlockLanguage` devolve) → componente.
 * Linguagem sem entrada aqui cai no bloco de código normal, com realce nenhum e nada quebrado.
 */
export const blockRenderers: Record<string, BlockRenderer> = {
  mermaid: MermaidBlock,
  // ```orbyva-canvas com o id de uma nota-canvas → o desenho da 058, em modo leitura.
  [CANVAS_BLOCK_LANGUAGE]: CanvasBlock,
  /**
   * `math` cobre dois caminhos de uma vez: o fence ` ```math ` (que o GitHub também renderiza) e o
   * `$$…$$`, porque o `remark-math` entrega justamente
   * `<pre><code class="language-math math-display">` ao hast. O `$…$` **não** passa por aqui — é
   * código inline, e quem o desvia para o `InlineMath` é o override de `code` do `MarkdownPreview`.
   */
  [MATH_BLOCK_LANGUAGE]: MathBlock,
};

/**
 * Renderer para a `className` que o `react-markdown` entrega no elemento `code`
 * (`language-<lang>`), ou `null` quando não há plugin para aquela linguagem — que é o caso da
 * esmagadora maioria dos blocos e do código inline.
 */
export function findBlockRenderer(
  className?: string | null
): BlockRenderer | null {
  const language = parseBlockLanguage(className);
  if (!language) return null;
  return blockRenderers[language] ?? null;
}
