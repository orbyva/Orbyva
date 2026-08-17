import type { ComponentType } from "react";
import { parseBlockLanguage } from "@/domain/notes/blockLanguage";

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
 * plugin não pode ser o buraco por onde HTML cru volta.
 */
export type BlockRenderer = ComponentType<{ code: string }>;

/**
 * Linguagem (minúscula, como `parseBlockLanguage` devolve) → componente.
 * Linguagem sem entrada aqui cai no bloco de código normal, com realce nenhum e nada quebrado.
 */
export const blockRenderers: Record<string, BlockRenderer> = {};

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
