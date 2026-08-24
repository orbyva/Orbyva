import { sanitizeSvgMarkup } from "@/lib/sanitizeSvg";

/**
 * Teto do markup colado, em bytes. Ícone é ícone: 64 KB já é generoso para um SVG de 24×24 com
 * gradiente. O teto do bucket `task-icons` é 1 MB (ver `20260814010000_task_icon.sql`), então este
 * limite não existe para proteger o storage — existe para o campo de colar não virar um caminho de
 * subir um arquivo qualquer disfarçado de ícone, e para a prévia em data URI não travar a aba.
 */
export const SVG_ICON_MAX_BYTES = 64 * 1024;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Por que um markup colado foi recusado — lista fechada, cada uma com mensagem própria em
 * `SVG_ICON_REJECTION_MESSAGES`. */
export type SvgIconRejection = "not-svg" | "empty-after-sanitize" | "too-large";

export type PrepareSvgIconResult =
  | {
      ok: true;
      /** O SVG **já limpo** — é este texto que sobe para o bucket, nunca o que o usuário colou. */
      svg: string;
      /** A limpeza tirou alguma coisa (tag ou atributo). A UI avisa em uma linha discreta, porque
       * o desenho pode ter mudado em relação ao que o usuário viu no site de origem. */
      removedSomething: boolean;
    }
  | { ok: false; reason: SvgIconRejection };

export const SVG_ICON_REJECTION_MESSAGES: Record<SvgIconRejection, string> = {
  "not-svg": "Isso não parece um SVG — cole o markup começando em <svg>.",
  "empty-after-sanitize":
    "Esse SVG só tinha conteúdo que foi removido por segurança — não sobrou desenho nenhum.",
  "too-large": "SVG grande demais — o limite é 64 KB.",
};

/**
 * Transforma o markup que o usuário **colou** no SVG que pode ser gravado como ícone — ou explica
 * por que não dá.
 *
 * Esta é a primeira das duas barreiras da feature 086 (a segunda é o consumo sempre por `<img>`,
 * nunca inline). Ela roda **antes** do upload, e o que sobe é o `svg` devolvido daqui, nunca o
 * texto original: o bucket `task-icons` é público, e a URL de um arquivo lá pode ser aberta como
 * navegação de topo — contexto em que o modo restrito do `<img>` não vale e o único que protege é
 * o arquivo já estar limpo.
 *
 * Puro no sentido que importa aqui: não faz I/O nenhum (nem rede, nem storage, nem `document`
 * vivo). Usa `DOMParser` para analisar num documento **inerte**, sem contexto de navegação — é o
 * mesmo terreno de `sanitizeSvgMarkup`, onde script não executa e imagem não carrega durante a
 * limpeza.
 *
 * A ordem das checagens não é acidental: o tamanho vem antes do parse (não faz sentido analisar
 * 5 MB de texto para depois recusar), e "é um SVG?" vem antes de "sobrou desenho?" para que um
 * texto qualquer receba a mensagem de "não parece um SVG" em vez da de conteúdo removido.
 */
export function prepareSvgIcon(markup: string): PrepareSvgIconResult {
  const source = markup.trim();
  if (!source) return { ok: false, reason: "not-svg" };
  if (byteLength(source) > SVG_ICON_MAX_BYTES) return { ok: false, reason: "too-large" };

  // A raiz precisa ser o próprio `<svg>`: `<div><svg/></div>` é um pedaço de página, não um ícone,
  // e aceitá-lo significaria gravar HTML arbitrário num arquivo servido como image/svg+xml.
  const original = svgRootOf(source);
  if (!original) return { ok: false, reason: "not-svg" };

  const cleaned = svgRootOf(sanitizeSvgMarkup(source));
  // `<svg>` não está entre as tags que a limpeza remove, então isto só aconteceria sem `DOMParser`.
  if (!cleaned) return { ok: false, reason: "empty-after-sanitize" };

  // Comparar as duas serializações (as duas passadas pelo mesmo parser) é o que sobrevive à
  // normalização do HTML — `<path/>` vira `<path></path>` dos dois lados, e só uma remoção de
  // verdade faz os textos diferirem.
  const removedSomething = cleaned.outerHTML !== original.outerHTML;

  // Sem nenhum elemento dentro não há desenho: ou o markup já era um `<svg>` vazio, ou tudo que
  // ele tinha era `<script>`/`<foreignObject>` e a limpeza levou.
  if (!cleaned.querySelector("*")) return { ok: false, reason: "empty-after-sanitize" };

  // Um SVG colado de dentro de uma página costuma vir **sem** `xmlns` (inline em HTML não precisa).
  // Como aqui ele vira um arquivo servido como `image/svg+xml` e consumido por `<img>`, sem o
  // namespace o navegador não o desenha — o ícone salvaria "com sucesso" e apareceria quebrado.
  if (!cleaned.hasAttribute("xmlns")) cleaned.setAttribute("xmlns", SVG_NAMESPACE);

  return { ok: true, svg: cleaned.outerHTML, removedSomething };
}

/** Heurística barata para o `onPaste` do popover decidir se o que caiu na área de transferência
 * merece abrir o campo de colar — não valida nada, quem valida é `prepareSvgIcon`. */
export function looksLikeSvgMarkup(text: string): boolean {
  return /^\s*(?:<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!doctype[^>]*>|\s)*<svg[\s>]/i.test(text);
}

function byteLength(text: string): number {
  if (typeof TextEncoder === "undefined") return text.length;
  return new TextEncoder().encode(text).length;
}

/**
 * O elemento `<svg>` raiz de um markup, analisado num documento inerte — `null` quando a raiz não é
 * um `<svg>` (inclusive quando há texto solto antes dele, o caso de colar um parágrafo junto).
 */
function svgRootOf(markup: string): Element | null {
  if (typeof DOMParser === "undefined") return null;
  const body = new DOMParser().parseFromString(markup, "text/html").body;
  if (!body) return null;

  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType === 3 /* text */) {
      if ((node.textContent ?? "").trim()) return null;
      continue;
    }
    if (node.nodeType === 8 /* comment */) continue;
    if (node.nodeType !== 1 /* element */) return null;
    return (node as Element).tagName.toLowerCase() === "svg" ? (node as Element) : null;
  }
  return null;
}
