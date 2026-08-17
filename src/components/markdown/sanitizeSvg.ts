/**
 * Segunda barreira sobre o SVG que um plugin de bloco produz a partir de texto do usuário.
 *
 * A primeira barreira é do próprio gerador — o mermaid roda com `securityLevel: "strict"`, que
 * desliga rótulos em HTML e passa o texto por DOMPurify (ver Decisões da 057). Esta função existe
 * porque essa barreira é de terceiro e fica a um `initialize` de distância de ser afrouxada por
 * engano, enquanto a decisão da 055 (HTML cru desligado no Markdown) vale para o app inteiro.
 *
 * Como funciona: o SVG é analisado num documento **inerte** do `DOMParser` — sem contexto de
 * navegação, portanto sem executar script e sem carregar imagem (é isso que impede um
 * `<img onerror>` de disparar *durante* a limpeza, que é o furo de tentar limpar depois de já ter
 * inserido na página). Lá dentro somem `<script>`, `<foreignObject>` (o caminho por onde HTML
 * arbitrário entra num SVG) e todo atributo `on*` ou com URL `javascript:`. O que volta é a
 * serialização do que sobrou.
 *
 * Não substitui um sanitizador de verdade para HTML arbitrário; é uma rede sob um gerador
 * específico, com superfície pequena e conhecida.
 */
export function sanitizeSvgMarkup(svg: string): string {
  if (typeof DOMParser === "undefined") return "";

  const doc = new DOMParser().parseFromString(svg, "text/html");
  const root = doc.body;
  if (!root) return "";

  scrubTree(root);

  return root.innerHTML;
}

/**
 * A mesma limpeza, sobre um elemento que já existe — o caso do canvas (feature 058), em que o
 * `exportToSvg` do Excalidraw devolve um `SVGSVGElement` pronto em vez de uma string.
 *
 * Anexar o nó direto é **mais seguro** que serializar e reinserir com `dangerouslySetInnerHTML`:
 * não há uma segunda passagem de parser entre a limpeza e a tela. A limpeza acontece enquanto o
 * elemento ainda está **fora do documento**, que é o momento em que ele não tem efeito nenhum.
 * Modifica no lugar e devolve o mesmo elemento, por conveniência de quem chama.
 */
export function sanitizeSvgElement<T extends Element>(svg: T): T {
  scrubTree(svg);
  // O nó raiz também é conteúdo: `<svg onload=…>` não seria pego por uma varredura só dos filhos.
  scrubAttributes(svg);
  return svg;
}

function scrubTree(root: Element): void {
  for (const element of Array.from(root.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();
    if (FORBIDDEN_TAGS.has(tag)) {
      element.remove();
      continue;
    }
    scrubAttributes(element);
  }
}

function scrubAttributes(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    if (isDangerousAttribute(attribute.name, attribute.value)) {
      element.removeAttribute(attribute.name);
    }
  }
}

/**
 * `foreignObject` é como se embute HTML dentro de um SVG — sem ele o desenho continua legível
 * (`securityLevel: "strict"` já manda o mermaid usar `<text>` em vez de rótulo HTML).
 */
const FORBIDDEN_TAGS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "link",
  "base",
  "meta",
]);

function isDangerousAttribute(name: string, value: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith("on")) return true;
  if (!URL_ATTRIBUTES.has(lower)) return false;
  // Tirar espaço/tab/controle antes de comparar cobre o `java\tscript:` clássico; as
  // entidades já foram decodificadas pelo parser.
  const compact = Array.from(value)
    .filter((char) => char.charCodeAt(0) > 0x20)
    .join("");
  return /^javascript:/i.test(compact);
}

const URL_ATTRIBUTES = new Set(["href", "xlink:href", "src", "action", "formaction"]);
