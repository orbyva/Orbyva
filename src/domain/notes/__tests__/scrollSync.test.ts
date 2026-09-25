import { describe, expect, it } from "vitest";
import { proportionalScrollTop } from "@/domain/notes/scrollSync";

/**
 * A conta da rolagem proporcional do modo "Dividir" (feature 070). Pura, então dá para afirmar os
 * casos que de fato quebram: nada a rolar, painel menor que o outro, valor além do fim.
 */

const editor = { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 };
const preview = { scrollTop: 0, scrollHeight: 600, clientHeight: 200 };

describe("proportionalScrollTop", () => {
  it("no topo, o destino vai para o topo", () => {
    expect(proportionalScrollTop(editor, preview)).toBe(0);
  });

  it("na metade do curso, o destino vai para a metade do curso dele", () => {
    // Editor: 800 de curso, 400 rolados = 50%. Preview: 400 de curso → 200.
    expect(proportionalScrollTop({ ...editor, scrollTop: 400 }, preview)).toBe(200);
  });

  it("no fim, o destino vai para o fim — sem passar dele", () => {
    expect(proportionalScrollTop({ ...editor, scrollTop: 800 }, preview)).toBe(400);
    // `scrollTop` maior que o curso (rolagem elástica do macOS) continua parando no fim.
    expect(proportionalScrollTop({ ...editor, scrollTop: 5000 }, preview)).toBe(400);
  });

  it("valor negativo (elástico para cima) para no topo", () => {
    expect(proportionalScrollTop({ ...editor, scrollTop: -50 }, preview)).toBe(0);
  });

  it("nota curta, que cabe inteira na tela, não vira divisão por zero", () => {
    const curto = { scrollTop: 0, scrollHeight: 200, clientHeight: 200 };
    expect(proportionalScrollTop(curto, preview)).toBe(0);
    expect(proportionalScrollTop(editor, curto)).toBe(0);
    expect(Number.isNaN(proportionalScrollTop(curto, curto))).toBe(false);
  });

  it("devolve inteiro — `scrollTop` fracionário faz o navegador arredondar sozinho", () => {
    const resultado = proportionalScrollTop({ ...editor, scrollTop: 333 }, preview);
    expect(Number.isInteger(resultado)).toBe(true);
  });
});
