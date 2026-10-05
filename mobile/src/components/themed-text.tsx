import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { TypeScale, weightStyle, weightToFamily, type TextStyleToken } from '@/domain/ui/typography';
import { useTheme } from '@/hooks/use-theme';

const TYPE_STYLES = {
  display: TypeScale.display,
  title: TypeScale.title,
  heading: TypeScale.heading,
  body: TypeScale.body,
  bodyStrong: TypeScale.bodyStrong,
  label: TypeScale.label,
  caption: TypeScale.caption,
  micro: TypeScale.micro,
  value: TypeScale.value,
  code: TypeScale.mono,
  /** Nomes anteriores à 201, mantidos para as telas que ainda os usam. */
  default: TypeScale.body,
  subtitle: TypeScale.heading,
  small: TypeScale.caption,
  smallBold: { ...TypeScale.caption, ...weightStyle(700) },
  link: TypeScale.caption,
  linkPrimary: TypeScale.caption,
} satisfies Record<string, TextStyleToken>;

export type ThemedTextProps = TextProps & {
  type?: keyof typeof TYPE_STYLES;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const base = TYPE_STYLES[type];
  const color = theme[themeColor ?? (type === 'linkPrimary' ? 'primary' : 'foreground')];
  const override = weightToFamily(base, (StyleSheet.flatten(style) ?? {}) as TextStyle);

  return <Text style={[{ color }, base, override]} {...rest} />;
}
