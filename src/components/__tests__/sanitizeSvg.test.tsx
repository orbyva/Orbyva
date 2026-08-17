import { describe, expect, it } from "vitest";
import { sanitizeSvgMarkup } from "@/components/markdown/sanitizeSvg";

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
