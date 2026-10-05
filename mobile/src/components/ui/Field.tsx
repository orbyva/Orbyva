import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Label } from "@/components/ui/Label";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";

/** Moldura de campo de formulário: rótulo, dica, controle e erro — para qualquer controle. */
export function Field({
  label,
  required,
  hint,
  error,
  children,
  style,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.field, style]}>
      <Label>
        {label}
        {required ? <Text style={{ color: theme.destructive }}> *</Text> : null}
      </Label>
      {hint ? (
        <Text style={[TypeScale.caption, { color: theme.mutedForeground }]}>{hint}</Text>
      ) : null}
      {children}
      {error ? (
        <Text style={[TypeScale.caption, { color: theme.destructive }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
});
