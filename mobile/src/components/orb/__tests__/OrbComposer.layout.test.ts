import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = fs.readFileSync(path.resolve(__dirname, "../OrbComposer.tsx"), "utf8");

/** Trecho JSX entre a abertura do cartão e o seu fechamento. */
function cardBlock(src: string): string {
  const start = src.indexOf("styles.card");
  const end = src.lastIndexOf("</View>\n    </View>");
  return start >= 0 && end > start ? src.slice(start, end) : "";
}

describe("compositor da Orb", () => {
  it("não usa o Input multiline do formulário, que fixa 96px de altura", () => {
    expect(SRC).not.toMatch(/<Input\b/);
    expect(SRC).toMatch(/<TextInput\b/);
  });

  it("o campo começa com uma linha e cresce até um teto", () => {
    expect(SRC).toMatch(/minHeight:\s*36/);
    expect(SRC).toMatch(/maxHeight:\s*120/);
  });

  it("enviar e parar são botões redondos de ícone dentro do cartão", () => {
    const card = cardBlock(SRC);
    expect(card).toContain('icon="arrow-up"');
    expect(card).toContain('icon="stop"');
    expect(card).toContain('accessibilityLabel="Enviar"');
    expect(SRC).toMatch(/send:\s*\{[^}]*borderRadius:\s*Radius\.full/);
  });
});
