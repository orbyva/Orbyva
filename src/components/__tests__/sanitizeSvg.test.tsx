import { describe, expect, it } from "vitest";
import {
  sanitizeSvgElement,
  sanitizeSvgMarkup,
} from "@/components/markdown/sanitizeSvg";

/** Arquivo `.tsx` só para cair no ambiente jsdom (o sanitizador usa `DOMParser`). */
describe("sanitizeSvgMarkup", () => {
  it("preserva o desenho: nós, arestas e texto continuam lá", () => {
    const svg =
      '<svg id="d1" width="100"><g class="node"><rect x="1" y="2"></rect><text>A</text></g><path d="M0 0L10 10"></path></svg>';

    const clean = sanitizeSvgMarkup(svg);

    expect(clean).toContain("<rect");
    expect(clean).toContain("<path");
    expect(clean).toContain("A</text>");
    expect(clean).toContain('id="d1"');
  });

  it("tira <script> de dentro do SVG", () => {
    const clean = sanitizeSvgMarkup(
      '<svg><script>window.__xss = 1</script><text>ok</text></svg>'
    );

    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("__xss");
    expect(clean).toContain("ok");
  });

  it("tira atributos de evento (onerror/onload/onclick)", () => {
    const clean = sanitizeSvgMarkup(
      '<svg><image href="x" onerror="alert(1)"></image><rect onclick="alert(2)" ONLOAD="alert(3)"></rect></svg>'
    );

    expect(clean.toLowerCase()).not.toContain("onerror");
    expect(clean.toLowerCase()).not.toContain("onclick");
    expect(clean.toLowerCase()).not.toContain("onload");
    expect(clean.toLowerCase()).not.toContain("alert(");
    expect(clean).toContain("<rect");
  });

  it("tira href javascript:, inclusive disfarçado com espaço e maiúscula", () => {
    const clean = sanitizeSvgMarkup(
      '<svg><a href="JaVaScRiPt: alert(1)"><text>clique</text></a><a href="/notes/n1"><text>ok</text></a></svg>'
    );

    expect(clean.toLowerCase()).not.toContain("javascript:");
    expect(clean).toContain('href="/notes/n1"');
    expect(clean).toContain("clique");
  });

  it("tira foreignObject, que é por onde HTML entra num SVG", () => {
    const clean = sanitizeSvgMarkup(
      '<svg><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">html cru</div></foreignObject><text>fica</text></svg>'
    );

    expect(clean.toLowerCase()).not.toContain("foreignobject");
    expect(clean).not.toContain("html cru");
    expect(clean).toContain("fica");
  });

  it("o SVG limpo, inserido de verdade na página, não deixa handler nenhum", () => {
    const host = document.createElement("div");
    host.innerHTML = sanitizeSvgMarkup(
      '<svg><rect onmouseover="alert(1)"></rect><script>alert(2)</script></svg>'
    );
    document.body.appendChild(host);

    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector("rect")?.getAttribute("onmouseover")).toBeNull();
    host.remove();
  });

  it("entrada vazia ou lixo não explode", () => {
    expect(sanitizeSvgMarkup("")).toBe("");
    expect(sanitizeSvgMarkup("<svg><rect>")).toContain("<rect");
  });
});

/**
 * Variante sobre nó pronto — o caso do canvas (058), em que `exportToSvg` devolve um
 * `SVGSVGElement` e anexá-lo por `ref` dispensa `dangerouslySetInnerHTML`.
 */
describe("sanitizeSvgElement", () => {
  function parseSvg(markup: string): SVGSVGElement {
    const host = document.createElement("div");
    host.innerHTML = markup;
    return host.firstElementChild as SVGSVGElement;
  }

  it("limpa o nó no lugar e devolve o mesmo elemento", () => {
    const svg = parseSvg(
      '<svg onload="alert(0)"><rect onclick="alert(1)"></rect><script>alert(2)</script>' +
        '<foreignObject><b>html</b></foreignObject><text>fica</text></svg>'
    );

    const clean = sanitizeSvgElement(svg);

    expect(clean).toBe(svg);
    // O `on*` da própria raiz também sai — varrer só os filhos deixaria `<svg onload>` passar.
    expect(clean.getAttribute("onload")).toBeNull();
    expect(clean.querySelector("script")).toBeNull();
    expect(clean.querySelector("foreignObject")).toBeNull();
    expect(clean.querySelector("rect")?.getAttribute("onclick")).toBeNull();
    expect(clean.querySelector("text")?.textContent).toBe("fica");
  });

  it("o nó limpo, inserido de verdade na página, não deixa handler nenhum", () => {
    const svg = sanitizeSvgElement(
      parseSvg('<svg><a href="javascript:alert(1)"><rect onmouseover="x()"></rect></a></svg>')
    );
    document.body.appendChild(svg);

    expect(document.querySelector("rect")?.getAttribute("onmouseover")).toBeNull();
    expect(document.querySelector("a")?.getAttribute("href")).toBeNull();
    svg.remove();
  });

  it("link interno do desenho continua clicável", () => {
    const svg = sanitizeSvgElement(parseSvg('<svg><a href="/notes/c1"><text>ir</text></a></svg>'));
    expect(svg.querySelector("a")?.getAttribute("href")).toBe("/notes/c1");
  });
});
