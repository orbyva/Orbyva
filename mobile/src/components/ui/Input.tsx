import { forwardRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { Label } from "@/components/ui/Label";
import { TypeScale } from "@/domain/ui/typography";
import { resolveInputStyle } from "@/domain/ui/variants/input";
import { useTheme } from "@/hooks/use-theme";
import { useOptionalThemeScheme } from "@/hooks/use-theme-preference";

export type InputProps = TextInputProps & {
  label?: string;
  /** Mensagem de erro: pinta a borda de `destructive` e aparece abaixo do campo. */
  error?: string | null;
  /** Borda de erro sem mensagem — quando o texto do erro fica com o `Field` em volta. */
  invalid?: boolean;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, invalid, hint, containerStyle, style, multiline, editable = true, onFocus, onBlur, ...rest },
  ref
) {
  const scheme = useOptionalThemeScheme();
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const s = resolveInputStyle(
    { focused, invalid: invalid || Boolean(error), disabled: !editable, multiline },
    scheme
  );

  return (
    <View style={[styles.field, containerStyle]}>
      {label ? <Label>{label}</Label> : null}
      <View style={s.container}>
        <TextInput
          ref={ref}
          editable={editable}
          multiline={multiline}
          placeholderTextColor={s.placeholderColor}
          selectionColor={theme.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[s.text, multiline ? styles.multiline : styles.single, style]}
          {...rest}
        />
      </View>
      {error ? (
        <Text style={[TypeScale.caption, { color: theme.destructive }]}>{error}</Text>
      ) : hint ? (
        <Text style={[TypeScale.caption, { color: theme.mutedForeground }]}>{hint}</Text>
      ) : null}
    </View>
  );
});

/** Visual de campo para controles que não são `TextInput` (data, hora, seletor). */
export function useInputStyle(state: { invalid?: boolean; disabled?: boolean } = {}) {
  const s = resolveInputStyle(state, useOptionalThemeScheme());
  return { container: s.container, text: s.text };
}

export const Textarea = forwardRef<TextInput, InputProps>(function Textarea(props, ref) {
  return <Input ref={ref} multiline {...props} />;
});

const styles = StyleSheet.create({
  field: { gap: 6 },
  single: { paddingVertical: 10 },
  multiline: { flex: 1, minHeight: 72 },
});
