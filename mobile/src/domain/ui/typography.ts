import { Fonts } from "@/constants/theme";

/** Mesmos pesos que o web importa em `src/index.css`. */
export const FontFamily = {
  sans400: "PlusJakartaSans_400Regular",
  sans500: "PlusJakartaSans_500Medium",
  sans600: "PlusJakartaSans_600SemiBold",
  sans700: "PlusJakartaSans_700Bold",
  display600: "Syne_600SemiBold",
  display700: "Syne_700Bold",
} as const;

export type FontWeightStep = 400 | 500 | 600 | 700;

/**
 * No Android `fontWeight` não escolhe o arquivo de uma fonte customizada: o peso tem que vir na
 * própria família. Syne só é carregada em 600/700.
 */
export function fontFor(weight: FontWeightStep, display = false): string {
  if (display) return weight === 700 ? FontFamily.display700 : FontFamily.display600;
  return FontFamily[`sans${weight}`];
}

function nearestStep(weight: string | number): FontWeightStep {
  const numeric =
    weight === "bold" ? 700 : weight === "normal" ? 400 : Number(weight) || 400;
  if (numeric >= 700) return 700;
  if (numeric >= 600) return 600;
  if (numeric >= 500) return 500;
  return 400;
}

/**
 * `fontWeight` passado no `style` de um texto não vale com fonte customizada (Android ignora, iOS
 * pode cair na fonte do sistema). Troca pela família do mesmo peso, na mesma fonte da base.
 */
export function weightToFamily<
  T extends { fontWeight?: string | number; fontFamily?: string },
>(base: TextStyleToken, override: T): Omit<T, "fontWeight"> | T {
  if (override.fontWeight === undefined || override.fontFamily !== undefined) return override;
  const display = base.fontFamily.startsWith("Syne");
  const isLoaded = (Object.values(FontFamily) as string[]).includes(base.fontFamily);
  if (!isLoaded) return override;
  const { fontWeight, ...rest } = override;
  return { ...rest, fontFamily: fontFor(nearestStep(fontWeight), display) };
}

export type TextStyleToken = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
};

export const TypeScale = {
  display: { fontFamily: fontFor(700, true), fontSize: 28, lineHeight: 38 },
  title: { fontFamily: fontFor(700, true), fontSize: 22, lineHeight: 30 },
  heading: { fontFamily: fontFor(600), fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fontFor(400), fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFor(600), fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fontFor(500), fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fontFor(500), fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: fontFor(600), fontSize: 11, lineHeight: 14 },
  /** Só grade densa de calendário (bloco de 30 min, chip na célula do mês). */
  nano: { fontFamily: fontFor(600), fontSize: 10, lineHeight: 12 },
  value: { fontFamily: fontFor(700, true), fontSize: 28, lineHeight: 38 },
  mono: { fontFamily: Fonts?.mono ?? "monospace", fontSize: 12, lineHeight: 18 },
} satisfies Record<string, TextStyleToken>;

/** Só a família de um peso — para trecho dentro de outro `Text` (negrito inline). */
export function weightStyle(weight: FontWeightStep): { fontFamily: string } {
  return { fontFamily: fontFor(weight) };
}

/** Código inline: só troca a família, mantém tamanho e entrelinha do texto em volta. */
export const MonoInline = { fontFamily: TypeScale.mono.fontFamily };

/** `headerTitleStyle` do stack nativo: só aceita família e tamanho (sem `lineHeight`). */
export const HeaderTitle = { fontFamily: fontFor(700, true), fontSize: 18 };
