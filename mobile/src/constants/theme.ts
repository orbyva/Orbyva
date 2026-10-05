/**
 * Paleta do web (`src/index.css`) convertida para hex — `tokenParity.test.ts` falha se um lado
 * mudar sem o outro. Hex porque `hexAlpha` (`lib/color.ts`) só aceita hex.
 */

import { Platform } from 'react-native';

const light = {
  background: '#F8F8F7',
  foreground: '#0C0A09',
  card: '#FFFFFF',
  cardForeground: '#0C0A09',
  popover: '#FFFFFF',
  popoverForeground: '#0C0A09',
  primary: '#0A7AAE',
  primaryForeground: '#FFFFFF',
  secondary: '#F0F0EF',
  secondaryForeground: '#1C1917',
  muted: '#F0F0EF',
  mutedForeground: '#726A65',
  accent: '#E3F4FC',
  accentForeground: '#085F87',
  destructive: '#DC2828',
  destructiveForeground: '#FFFFFF',
  success: '#1CA64F',
  successForeground: '#FFFFFF',
  warning: '#DB7706',
  warningForeground: '#FFFFFF',
  border: '#E7E5E4',
  input: '#E7E5E4',
  ring: '#0B84BC',
  chart1: '#0B84BC',
  chart2: '#AF20C5',
  chart3: '#1FB757',
  chart4: '#DC2828',
  chart5: '#DB7706',
  chart6: '#1C9C91',
};

const dark: typeof light = {
  background: '#080C16',
  foreground: '#F8FAFC',
  card: '#0C1322',
  cardForeground: '#F8FAFC',
  popover: '#0C1322',
  popoverForeground: '#F8FAFC',
  primary: '#18ADF2',
  primaryForeground: '#FFFFFF',
  secondary: '#18212F',
  secondaryForeground: '#F8FAFC',
  muted: '#18212F',
  mutedForeground: '#94A3B8',
  accent: '#0C2C3B',
  accentForeground: '#9EDDFA',
  destructive: '#DF3A3A',
  destructiveForeground: '#F8FAFC',
  success: '#23D163',
  successForeground: '#FFFFFF',
  warning: '#F6A823',
  warningForeground: '#FFFFFF',
  border: '#1D283A',
  input: '#1D283A',
  ring: '#18ADF2',
  chart1: '#18ADF2',
  chart2: '#DC6EED',
  chart3: '#23D163',
  chart4: '#DF3A3A',
  chart5: '#F6A823',
  chart6: '#2BCABD',
};

export const Colors = { light, dark };

export type ThemeColor = keyof typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const FabSize = 56;
export const MaxContentWidth = 800;

/**
 * `lg` = `--radius` do web (0.625rem); `md`/`sm` seguem o `tailwind.config.js`. `xl` é o
 * `rounded-xl` padrão do Tailwind (não derivado do `--radius`), usado pelo `Card` do web.
 */
export const Radius = {
  xl: 12,
  lg: 10,
  md: 8,
  sm: 6,
  full: 999,
} as const;

/** Cores de grupo da sidebar / hub — mesmas variáveis do web (`--hub`, `--productivity`, …). */
export const ModuleColors = {
  light: {
    hub: '#1216D3',
    finance: light.primary,
    productivity: '#8033E6',
    life: '#10B77F',
    health: '#F43E5C',
    entertainment: '#AF20C5',
    travel: '#188B81',
    car: '#F97015',
  },
  dark: {
    hub: '#6467F2',
    finance: dark.primary,
    productivity: '#A56EED',
    life: '#22C38E',
    health: '#F43E5C',
    entertainment: '#DC6EED',
    travel: '#2BCABD',
    car: '#FA802E',
  },
} as const;

export type ModuleColorKey = keyof typeof ModuleColors.light;

/** Texto/ícone sobre a cor do módulo (`--<módulo>-foreground` do web). */
export const ModuleForegrounds: Record<'light' | 'dark', Record<ModuleColorKey, string>> = {
  light: {
    hub: '#FFFFFF',
    finance: light.primaryForeground,
    productivity: '#FFFFFF',
    life: '#FFFFFF',
    health: '#FFFFFF',
    entertainment: '#FFFFFF',
    travel: '#FFFFFF',
    car: '#FFFFFF',
  },
  dark: {
    hub: '#FFFFFF',
    finance: dark.primaryForeground,
    productivity: '#FFFFFF',
    life: '#FFFFFF',
    health: '#FFFFFF',
    entertainment: '#0B111E',
    travel: '#FFFFFF',
    car: '#FFFFFF',
  },
};
