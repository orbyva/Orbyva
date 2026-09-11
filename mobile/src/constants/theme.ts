/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B0F1A',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    primary: '#0EA5E9',
    danger: '#E11D48',
    success: '#16A34A',
  },
  dark: {
    text: '#ffffff',
    background: '#0B0F1A',
    surface: '#16181D',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    primary: '#0EA5E9',
    danger: '#FB7185',
    success: '#4ADE80',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

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

export const Radius = {
  card: 16,
  input: 14,
  chip: 999,
  control: 12,
} as const;

/** Cores de grupo da sidebar / hub, alinhadas ao web (`moduleColors`). */
export const ModuleColors = {
  hub: "#6B7CFA",
  finance: "#0EA5E9",
  productivity: "#A855F7",
  life: "#22A37A",
  entertainment: "#D46BE8",
} as const;
