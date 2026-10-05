import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { Spacing } from "@/constants/theme";
import { resolveInputStyle } from "@/domain/ui/variants/input";
import { useTheme } from "@/hooks/use-theme";
import { useOptionalThemeScheme } from "@/hooks/use-theme-preference";

export function SearchField({
  value,
  onChangeText,
  placeholder,
  style,
  editable = true,
  onFocus,
  onBlur,
  ...rest
}: Omit<TextInputProps, "style" | "value" | "onChangeText"> & {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const s = resolveInputStyle({ focused, disabled: !editable }, useOptionalThemeScheme());

  return (
    <View style={[s.container, styles.wrap, style]}>
      <Ionicons name="search-outline" size={16} color={s.placeholderColor} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={s.placeholderColor}
        selectionColor={theme.primary}
        editable={editable}
        style={[s.text, styles.input]}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  input: { flex: 1, paddingVertical: 10 },
});
