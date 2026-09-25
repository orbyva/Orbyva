/**
 * # Âncora de título — `slugifyHeading` (feature 069)
 *
 * Todo título de uma nota ganha um `id` estável, derivado do próprio texto. É o que torna possível
 * apontar para **dentro** de uma nota: `[[nota#seção]]` (vocabulário da 056) e o sumário da 070
 * precisam de um alvo que exista no DOM e que não mude a cada render.
 *
 * As regras são as do GitHub, porque são as que o usuário já conhece de qualquer README:
 * minúsculas, acento removido, pontuação fora, espaço vira hífen. Acento sai de propósito — `#nao`
 * é digitável em qualquer teclado, `#não` não é.
 *
 * Isto é lógica pura (texto → texto), por isso mora em `domain/` e não no componente: é o pedaço
 * que dá para testar sem renderizar nada.
 */

/**
 * Texto do título → identificador de URL.
 *
 * ```
 * slugifyHeading("Como Rodar o Café?")  // "como-rodar-o-cafe"
 * slugifyHeading("  ")                  // "secao"
 * ```
 */
export function slugifyHeading(text: string): string {
  const slug = text
    .normalize("NFD")
    // Tira os diacríticos que o NFD separou da letra — "ção" vira "cao".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    // Pontuação some; o que separa palavra vira hífen.
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  // Título só de emoji, de pontuação ou vazio ainda precisa de um alvo para o link.
  return slug || FALLBACK_HEADING_SLUG;
}

export const FALLBACK_HEADING_SLUG = "secao";

/**
 * O mesmo título pode aparecer duas vezes na mesma nota ("Notas", "Notas"), e dois `id` iguais
 * fazem o link levar sempre ao primeiro. O segundo vira `-2`, o terceiro `-3`, como no GitHub.
 *
 * `used` é o contador da nota inteira, criado por quem percorre a árvore — a função em si continua
 * pura: mesma entrada, mesma saída.
 */
export function uniqueHeadingId(
  slug: string,
  used: Map<string, number>
): string {
  const seen = used.get(slug) ?? 0;
  used.set(slug, seen + 1);
  return seen === 0 ? slug : `${slug}-${seen + 1}`;
}
