import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../..");

/**
 * O app inteiro passa pela guarda. Ficam de fora só a arte exportada dos stories (cores próprias
 * da imagem) e a fonte dos tokens.
 */
const EXCLUDED = [
  "components/share",
  "constants",
  // o resto da fonte dos tokens: escala de tipo, variantes das primitivas e véu sobre mídia
  "domain/ui/typography.ts",
  "domain/ui/variants",
  "domain/ui/color.ts",
];

const RULES: { name: string; pattern: RegExp }[] = [
  { name: "cor hex literal", pattern: /#[0-9A-Fa-f]{3,8}\b/ },
  { name: "cor rgb/rgba literal", pattern: /rgba?\(/ },
  { name: "fontSize numérico", pattern: /fontSize:\s*\d/ },
  { name: "fontWeight", pattern: /fontWeight:/ },
  { name: "fontFamily", pattern: /fontFamily:/ },
  {
    name: "nome de tema anterior à 201",
    pattern:
      /\b(theme\.|themeColor=["'])(text|surface|backgroundElement|backgroundSelected|textSecondary|danger)\b(?!\w)/,
  },
  {
    name: "nome de tema anterior à 201 (string)",
    pattern: /["'](textSecondary|backgroundSelected|backgroundElement|surface)["']/,
  },
  {
    name: "nome de tema anterior à 201 (themeColor condicional)",
    pattern:
      /themeColor=\{[^}]*["'](text|surface|backgroundElement|backgroundSelected|textSecondary|danger)["']/,
  },
  { name: "raio anterior à 201", pattern: /Radius\.(card|input|control|chip)\b/ },
  { name: "raio numérico (use Radius)", pattern: /borderRadius:\s*(?:[6-9]|[1-9]\d+)\b/ },
];

const EXEMPT = /(\/\/|\/\*) token-livre: \S/;
/** Bloco de dado (paleta gravada no banco, espelho do web): uma marca abre, outra fecha. */
const EXEMPT_START = /\/\/ token-livre-início: \S/;
const EXEMPT_END = /\/\/ token-livre-fim\b/;

export function scanLines(lines: string[]): { line: number; rule: string; text: string }[] {
  const found: { line: number; rule: string; text: string }[] = [];
  let inBlock = false;
  lines.forEach((text, i) => {
    if (EXEMPT_START.test(text)) inBlock = true;
    if (EXEMPT_END.test(text)) {
      inBlock = false;
      return;
    }
    if (inBlock || EXEMPT.test(text)) return;
    for (const rule of RULES) {
      if (rule.pattern.test(text)) found.push({ line: i + 1, rule: rule.name, text: text.trim() });
    }
  });
  return found;
}

function guardedFiles(): string[] {
  return fs
    .readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter(
      (rel) =>
        /\.tsx?$/.test(rel) &&
        !rel.split(path.sep).includes("__tests__") &&
        !EXCLUDED.some((dir) => rel === dir || rel.startsWith(dir + path.sep))
    )
    .sort()
    .map((rel) => path.join(SRC, rel));
}

describe("teste-guarda de estilo em todo mobile/src", () => {
  const files = guardedFiles();

  it("cobre o app inteiro, menos as exceções", () => {
    const rels = files.map((f) => path.relative(SRC, f));
    expect(rels).toContain(path.join("components", "chrome", "MenuButton.tsx"));
    expect(rels).toContain(path.join("app", "(app)", "home.tsx"));
    expect(rels.some((r) => r.startsWith(path.join("components", "share")))).toBe(false);
    expect(rels.some((r) => r.startsWith("constants"))).toBe(false);
  });

  it("todo stack com header nativo usa o título em Syne (HeaderTitle)", () => {
    const layouts = files.filter((f) => path.basename(f) === "_layout.tsx");
    const semTitulo = layouts
      .filter((f) => {
        const src = fs.readFileSync(f, "utf8");
        return src.includes("headerTintColor") && !src.includes("headerTitleStyle: HeaderTitle");
      })
      .map((f) => path.relative(SRC, f));
    expect(layouts.length).toBeGreaterThan(10);
    expect(semTitulo).toEqual([]);
  });

  it("isenção por linha e por bloco só vale com motivo, e o bloco fecha", () => {
    const hits = scanLines([
      'a: "#111111", // token-livre: arte',
      "color: #111; /* token-livre: impressão */",
      'b: "#222222", // token-livre:',
      "// token-livre-início: paleta gravada no banco",
      '"#333333",',
      "// token-livre-fim",
      'c: "#444444",',
      "// token-livre-início:",
      '"#555555",',
    ]).map((v) => v.line);
    expect(hits).toEqual([3, 7, 9]);
  });

  it.each(files.map((f) => [path.relative(SRC, f), f]))("%s", (_rel, file) => {
    const violations = scanLines(fs.readFileSync(file, "utf8").split("\n")).map(
      (v) => `${path.relative(SRC, file)}:${v.line} ${v.rule} → ${v.text}`
    );
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
