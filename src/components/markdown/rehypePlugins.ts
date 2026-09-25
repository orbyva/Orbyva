import type { PluggableList } from "unified";
import { rehypeHeadingIds } from "@/components/markdown/rehypeHeadingIds";
import { rehypeTaskIndex } from "@/components/markdown/rehypeTaskIndex";

/**
 * Plugins rehype do Markdown do app — o irmão de `remarkPlugins.ts`, do outro lado da ponte.
 *
 * `remark` trabalha no **markdown** (mdast); `rehype` trabalha no **HTML** (hast), já depois da
 * conversão. É aqui que entra o que só faz sentido com a árvore final na mão — `id` de título, por
 * exemplo, que precisa ver todos os títulos do documento para desempatar repetidos.
 *
 * **`rehype-raw` continua fora, e não é acidente**: é ele que faria o preview interpretar HTML
 * escrito na nota. Quem quiser ligá-lo tem que trazer `rehype-sanitize` no mesmo passo — invariante
 * da 055, repetida aqui porque este arquivo é exatamente o lugar onde alguém tentaria.
 */
export const MARKDOWN_REHYPE_PLUGINS: PluggableList = [rehypeHeadingIds, rehypeTaskIndex];
