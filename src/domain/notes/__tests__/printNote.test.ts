// @vitest-environment jsdom
/**
 * `printNote` monta um iframe no `document` — `.test.ts` do domain roda em node por padrão.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPrintHtml, escapePrintText, printNote } from "@/domain/notes/printNote";

describe("buildPrintHtml", () => {
  it("monta um documento só com a nota, A4, sem a rota do app", () => {
    const html = buildPrintHtml("Atividades Finatec", "<p>olá</p>");
    expect(html).toContain("<title>Atividades Finatec</title>");
    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain("@page");
    expect(html).toContain("size: A4");
    expect(html).toContain("height: auto !important");
    expect(html).toContain("<p>olá</p>");
    expect(html).not.toContain("localhost");
    expect(html).not.toContain("App · Orbyva");
  });

  it("escapa o título para não quebrar o HTML", () => {
    const html = buildPrintHtml('A <script>x</script> & "y"', "<p>ok</p>");
    expect(html).toContain(escapePrintText('A <script>x</script> & "y"'));
    expect(html).not.toContain("<script>x</script>");
  });
});

describe("printNote", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll("iframe[title='Imprimir nota']").forEach((el) => el.remove());
  });

  it("imprime num iframe isolado, não a página inteira", () => {
    vi.useFakeTimers();
    printNote("Pauta", "<p>conteúdo da nota</p>");

    const iframe = document.querySelector<HTMLIFrameElement>("iframe[title='Imprimir nota']");
    expect(iframe).toBeTruthy();
    if (!iframe) return;

    expect(iframe.contentDocument?.documentElement.outerHTML).toContain("conteúdo da nota");
    expect(iframe.contentDocument?.documentElement.outerHTML).toContain("Pauta");

    const print = vi.spyOn(iframe.contentWindow!, "print").mockImplementation(() => {});
    vi.advanceTimersByTime(50);
    expect(print).toHaveBeenCalledOnce();
    expect(iframe.style.height).not.toBe("297mm");
  });
});
