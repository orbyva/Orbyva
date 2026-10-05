import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PhoneMockupBasic from "@/components/ui/phone-mockups-1";

/**
 * LCP da landing: o print do hub precisa estar no DOM no primeiro render, antes do chunk lazy do
 * carrossel (e do framer-motion) resolver. Senão o Lighthouse mede ~6s de render delay.
 */
describe("PhoneMockupBasic", () => {
  it("pinta o hub no fallback, sem esperar o chunk do carrossel", () => {
    const { container } = render(<PhoneMockupBasic />);

    expect(screen.queryByRole("button", { name: "Próximo" })).toBeNull();

    const img = screen.getByAltText("Início: saldo do mês, alertas e resumo do dia");
    expect(img.getAttribute("src")).toBe("/marketing/hub.png");
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");

    const source = container.querySelector('picture > source[type="image/webp"]');
    expect(source?.getAttribute("srcset")).toBe("/marketing/hub.webp");
  });

  it("troca o fallback pelo carrossel quando o chunk carrega", async () => {
    render(<PhoneMockupBasic />);
    expect(await screen.findByRole("button", { name: "Próximo" })).toBeTruthy();
    expect(screen.getByAltText("Início: saldo do mês, alertas e resumo do dia")).toBeTruthy();
  });
});
