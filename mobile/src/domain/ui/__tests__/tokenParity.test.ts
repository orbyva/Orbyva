import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { Colors, ModuleColors, ModuleForegrounds, Radius } from "@/constants/theme";
import { hslToHex } from "@/domain/ui/color";

const WEB_CSS = path.resolve(__dirname, "../../../../../src/index.css");

function readBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Bloco ${selector} não encontrado em ${WEB_CSS}`);
  const body = css.slice(start, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const css = fs.readFileSync(WEB_CSS, "utf8");
const web = { light: readBlock(css, ":root"), dark: readBlock(css, ".dark") };

/** Variável do web → chave do mobile. */
const THEME_KEYS: Record<string, keyof typeof Colors.light> = {
  background: "background",
  foreground: "foreground",
  card: "card",
  "card-foreground": "cardForeground",
  popover: "popover",
  "popover-foreground": "popoverForeground",
  primary: "primary",
  "primary-foreground": "primaryForeground",
  secondary: "secondary",
  "secondary-foreground": "secondaryForeground",
  muted: "muted",
  "muted-foreground": "mutedForeground",
  accent: "accent",
  "accent-foreground": "accentForeground",
  destructive: "destructive",
  "destructive-foreground": "destructiveForeground",
  success: "success",
  "success-foreground": "successForeground",
  warning: "warning",
  "warning-foreground": "warningForeground",
  border: "border",
  input: "input",
  ring: "ring",
  "chart-1": "chart1",
  "chart-2": "chart2",
  "chart-3": "chart3",
  "chart-4": "chart4",
  "chart-5": "chart5",
  "chart-6": "chart6",
};

const MODULE_KEYS: Record<string, keyof typeof ModuleColors.light> = {
  hub: "hub",
  primary: "finance",
  productivity: "productivity",
  life: "life",
  health: "health",
  cinema: "entertainment",
  travel: "travel",
  car: "car",
};

function channels(hex: string): number[] {
  const n = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16));
}

/** Arredondamento da conversão HSL→RGB pode diferir em 1 por canal. */
function expectSameColor(actual: string, expected: string, label: string) {
  const a = channels(actual);
  const e = channels(expected);
  const off = a.some((v, i) => Math.abs(v - e[i]) > 1);
  expect(off, `${label}: mobile ${actual} ≠ web ${expected}`).toBe(false);
}

describe.each(["light", "dark"] as const)("paridade de tokens com o web (%s)", (scheme) => {
  it.each(Object.entries(THEME_KEYS))("--%s → Colors.%s", (cssVar, key) => {
    const value = web[scheme][cssVar];
    expect(value, `--${cssVar} ausente no ${scheme} do web`).toBeDefined();
    expectSameColor(Colors[scheme][key], hslToHex(value), `${scheme}.${key}`);
  });

  it.each(Object.entries(MODULE_KEYS))("--%s → ModuleColors.%s", (cssVar, key) => {
    const value = web[scheme][cssVar] ?? web.light[cssVar];
    expect(value, `--${cssVar} ausente no web`).toBeDefined();
    expectSameColor(ModuleColors[scheme][key], hslToHex(value), `${scheme}.module.${key}`);
  });

  it.each(Object.entries(MODULE_KEYS))(
    "--%s-foreground → ModuleForegrounds.%s",
    (cssVar, key) => {
      const value =
        web[scheme][`${cssVar}-foreground`] ?? web.light[`${cssVar}-foreground`];
      const expected = value ? hslToHex(value) : "#FFFFFF";
      expectSameColor(ModuleForegrounds[scheme][key], expected, `${scheme}.moduleFg.${key}`);
    }
  );
});

describe("raio", () => {
  it("Radius.lg é o --radius do web em px", () => {
    const rem = Number.parseFloat(web.light.radius);
    expect(Radius.lg).toBe(rem * 16);
    expect(Radius.md).toBe(Radius.lg - 2);
    expect(Radius.sm).toBe(Radius.lg - 4);
  });
});
