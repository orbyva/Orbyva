import { StyleSheet, Text, View, type TextProps, type ViewProps } from "react-native";

import { resolveCardStyle } from "@/domain/ui/variants/card";
import { useOptionalThemeScheme } from "@/hooks/use-theme-preference";

function useCardStyle() {
  return resolveCardStyle(useOptionalThemeScheme());
}

/** Mesmo papel do `Card` do web: só a moldura — o padding vem de `CardHeader`/`CardContent`. */
export function Card({ style, ...rest }: ViewProps) {
  const s = useCardStyle();
  return <View style={[s.container, styles.border, style]} {...rest} />;
}

export function CardHeader({ style, ...rest }: ViewProps) {
  return <View style={[useCardStyle().header, style]} {...rest} />;
}

export function CardTitle({ style, ...rest }: TextProps) {
  return <Text style={[useCardStyle().title, style]} {...rest} />;
}

export function CardDescription({ style, ...rest }: TextProps) {
  return <Text style={[useCardStyle().description, style]} {...rest} />;
}

export function CardContent({ style, ...rest }: ViewProps) {
  return <View style={[useCardStyle().content, style]} {...rest} />;
}

export function CardFooter({ style, ...rest }: ViewProps) {
  return <View style={[useCardStyle().footer, style]} {...rest} />;
}

const styles = StyleSheet.create({
  border: { borderWidth: StyleSheet.hairlineWidth },
});
