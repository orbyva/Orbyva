import { describe, expect, it } from "vitest";

import { Colors, ModuleColors } from "@/constants/theme";
import { FontFamily } from "@/domain/ui/typography";
import { resolveBadgeStyle, type BadgeVariant } from "@/domain/ui/variants/badge";
import {
  MIN_TOUCH,
  resolveButtonStyle,
  type ButtonSize,
  type ButtonVariant,
} from "@/domain/ui/variants/button";
import { resolveCardStyle } from "@/domain/ui/variants/card";
import { resolveChipStyle } from "@/domain/ui/variants/chip";
import { resolveInputStyle } from "@/domain/ui/variants/input";
import { resolveTabsStyle } from "@/domain/ui/variants/tabs";

type Scheme = "light" | "dark";
const SCHEMES: Scheme[] = ["light", "dark"];
const BUTTON_VARIANTS: ButtonVariant[] = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
];
const BUTTON_SIZES: ButtonSize[] = ["sm", "default", "lg", "icon"];
const BADGE_VARIANTS: BadgeVariant[] = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "success",
  "warning",
];

function rgb(hex: string): string {
  const n = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16)).join(",");
}

/** Toda cor de estilo tem que sair dos tokens do tema — direto ou via `hexAlpha`. */
function expectOnlyTokenColors(style: unknown, scheme: Scheme, label: string) {
  const palette = [
    ...Object.values(Colors[scheme]),
    ...Object.values(ModuleColors[scheme]),
  ].map((c) => c.toUpperCase());
  const paletteRgb = new Set(palette.map(rgb));

  const visit = (value: unknown, path: string) => {
    if (typeof value === "string") {
      if (value.startsWith("#")) {
        expect(palette, `${label}.${path} = ${value}`).toContain(value.toUpperCase());
      } else if (value.startsWith("rgba(")) {
        const [r, g, b] = value.slice(5, -1).split(",");
        expect(paletteRgb.has(`${r},${g},${b}`), `${label}.${path} = ${value}`).toBe(true);
      }
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) visit(v, path ? `${path}.${k}` : k);
    }
  };
  visit(style, "");
}

function expectLoadedFont(style: { fontFamily?: string }, label: string) {
  expect(Object.values(FontFamily) as string[], label).toContain(style.fontFamily);
  expect(style, label).not.toHaveProperty("fontWeight");
}

describe.each(SCHEMES)("button (%s)", (scheme) => {
  const theme = Colors[scheme];

  it("default é primary cheio com texto primaryForeground", () => {
    const s = resolveButtonStyle({ variant: "default" }, scheme);
    expect(s.container.backgroundColor).toBe(theme.primary);
    expect(s.label.color).toBe(theme.primaryForeground);
  });

  it("destructive usa destructive; outline tem borda input e fundo background", () => {
    const d = resolveButtonStyle({ variant: "destructive" }, scheme);
    expect(d.container.backgroundColor).toBe(theme.destructive);
    expect(d.label.color).toBe(theme.destructiveForeground);
    const o = resolveButtonStyle({ variant: "outline" }, scheme);
    expect(o.container.borderColor).toBe(theme.input);
    expect(o.container.backgroundColor).toBe(theme.background);
    expect(o.label.color).toBe(theme.foreground);
  });

  it("pressionado: outline/ghost ganham accent, como o hover do web", () => {
    for (const variant of ["outline", "ghost"] as const) {
      const s = resolveButtonStyle({ variant, pressed: true }, scheme);
      expect(s.container.backgroundColor, variant).toBe(theme.accent);
      expect(s.label.color, variant).toBe(theme.accentForeground);
    }
    const p = resolveButtonStyle({ variant: "default", pressed: true }, scheme);
    expect(p.container.backgroundColor).not.toBe(theme.primary);
  });

  it.each(BUTTON_SIZES)("tamanho %s: alvo de toque >= 44 contando hitSlop", (size) => {
    const s = resolveButtonStyle({ size }, scheme);
    expect(s.container.minHeight + 2 * s.hitSlop).toBeGreaterThanOrEqual(MIN_TOUCH);
  });

  it("desabilitado fica com opacidade 0.5", () => {
    expect(resolveButtonStyle({ disabled: true }, scheme).container.opacity).toBe(0.5);
    expect(resolveButtonStyle({}, scheme).container.opacity).toBe(1);
  });

  it.each(BUTTON_VARIANTS)("%s: só cores do tema e fonte carregada", (variant) => {
    for (const pressed of [false, true]) {
      const s = resolveButtonStyle({ variant, pressed }, scheme);
      expectOnlyTokenColors(s, scheme, `button.${variant}`);
      expectLoadedFont(s.label, `button.${variant}`);
    }
  });
});

describe.each(SCHEMES)("card (%s)", (scheme) => {
  const theme = Colors[scheme];
  const s = resolveCardStyle(scheme);

  it("fundo card, borda border, raio 12 (rounded-xl do web)", () => {
    expect(s.container.backgroundColor).toBe(theme.card);
    expect(s.container.borderColor).toBe(theme.border);
    expect(s.container.borderRadius).toBe(12);
  });

  it("header e content com padding 16; título e descrição nos tokens", () => {
    expect(s.header.padding).toBe(16);
    expect(s.content.paddingHorizontal).toBe(16);
    expect(s.title.color).toBe(theme.cardForeground);
    expect(s.description.color).toBe(theme.mutedForeground);
    expectLoadedFont(s.title, "card.title");
    expectLoadedFont(s.description, "card.description");
  });

  it("só cores do tema", () => expectOnlyTokenColors(s, scheme, "card"));
});

describe.each(SCHEMES)("badge (%s)", (scheme) => {
  const theme = Colors[scheme];

  it("default/secondary/destructive seguem o web", () => {
    expect(resolveBadgeStyle("default", scheme).container.backgroundColor).toBe(theme.primary);
    expect(resolveBadgeStyle("secondary", scheme).label.color).toBe(
      theme.secondaryForeground
    );
    expect(resolveBadgeStyle("destructive", scheme).container.backgroundColor).toBe(
      theme.destructive
    );
    expect(resolveBadgeStyle("outline", scheme).container.borderColor).toBe(theme.border);
  });

  it("success/warning são tingidos com a própria cor no texto", () => {
    expect(resolveBadgeStyle("success", scheme).label.color).toBe(theme.success);
    expect(resolveBadgeStyle("warning", scheme).label.color).toBe(theme.warning);
  });

  it.each(BADGE_VARIANTS)("%s: pílula, cores do tema, fonte carregada", (variant) => {
    const s = resolveBadgeStyle(variant, scheme);
    expect(s.container.borderRadius).toBe(999);
    expectOnlyTokenColors(s, scheme, `badge.${variant}`);
    expectLoadedFont(s.label, `badge.${variant}`);
  });
});

describe.each(SCHEMES)("input (%s)", (scheme) => {
  const theme = Colors[scheme];

  it("borda input em repouso, ring com foco, destructive inválido", () => {
    expect(resolveInputStyle({}, scheme).container.borderColor).toBe(theme.input);
    expect(resolveInputStyle({ focused: true }, scheme).container.borderColor).toBe(theme.ring);
    expect(
      resolveInputStyle({ focused: true, invalid: true }, scheme).container.borderColor
    ).toBe(theme.destructive);
  });

  it("altura >= 44, texto 16 em foreground, placeholder mutedForeground", () => {
    const s = resolveInputStyle({}, scheme);
    expect(s.container.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH);
    expect(s.text.fontSize).toBe(16);
    expect(s.text.color).toBe(theme.foreground);
    expect(s.placeholderColor).toBe(theme.mutedForeground);
    expectLoadedFont(s.text, "input.text");
  });

  it("multiline cresce e desabilitado fica 0.5", () => {
    expect(resolveInputStyle({ multiline: true }, scheme).container.minHeight).toBeGreaterThan(
      MIN_TOUCH
    );
    expect(resolveInputStyle({ disabled: true }, scheme).container.opacity).toBe(0.5);
  });

  it("só cores do tema", () => {
    for (const state of [{}, { focused: true }, { invalid: true }]) {
      expectOnlyTokenColors(resolveInputStyle(state, scheme), scheme, "input");
    }
  });
});

describe.each(SCHEMES)("chip (%s)", (scheme) => {
  const theme = Colors[scheme];

  it("selecionado usa primary por padrão e a cor de módulo quando vem tint", () => {
    expect(resolveChipStyle({ selected: true }, scheme).label.color).toBe(theme.primary);
    const tint = ModuleColors[scheme].life;
    const s = resolveChipStyle({ selected: true, tint }, scheme);
    expect(s.label.color).toBe(tint);
    expect(s.container.borderColor).toBe(tint);
  });

  it("não selecionado: borda border e texto foreground", () => {
    const s = resolveChipStyle({ selected: false }, scheme);
    expect(s.container.borderColor).toBe(theme.border);
    expect(s.label.color).toBe(theme.foreground);
  });

  it("alvo de toque >= 44 contando hitSlop; cores do tema; fonte carregada", () => {
    for (const selected of [false, true]) {
      const s = resolveChipStyle({ selected }, scheme);
      expect(s.container.minHeight + 2 * s.hitSlop).toBeGreaterThanOrEqual(MIN_TOUCH);
      expectOnlyTokenColors(s, scheme, "chip");
      expectLoadedFont(s.label, "chip");
    }
  });
});

describe.each(SCHEMES)("tabs (%s)", (scheme) => {
  const theme = Colors[scheme];
  const s = resolveTabsStyle(scheme);

  it("trilho muted; aba ativa background com texto foreground; inativa mutedForeground", () => {
    expect(s.track.backgroundColor).toBe(theme.muted);
    expect(s.tabActive.backgroundColor).toBe(theme.background);
    expect(s.labelActive.color).toBe(theme.foreground);
    expect(s.label.color).toBe(theme.mutedForeground);
  });

  it("cores do tema e fontes carregadas", () => {
    expectOnlyTokenColors(s, scheme, "tabs");
    expectLoadedFont(s.label, "tabs.label");
    expectLoadedFont(s.labelActive, "tabs.labelActive");
  });
});
