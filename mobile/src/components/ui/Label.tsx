import { Text, type TextProps } from "react-native";

import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";

export function Label({ style, ...rest }: TextProps) {
  const theme = useTheme();
  return <Text style={[TypeScale.label, { color: theme.foreground }, style]} {...rest} />;
}
