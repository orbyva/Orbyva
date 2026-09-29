import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export function OrbComposer({
  disabled,
  streaming,
  onSend,
  onStop,
}: {
  disabled?: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled || streaming) return;
    setText("");
    onSend(trimmed);
  }

  return (
    <View style={[styles.row, { borderTopColor: theme.backgroundSelected, backgroundColor: theme.background }]}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Pergunte à Orb…"
        placeholderTextColor={theme.textSecondary}
        multiline
        editable={!disabled && !streaming}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: theme.backgroundSelected,
          },
        ]}
      />
      {streaming ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Parar"
          onPress={onStop}
          style={[styles.btn, { backgroundColor: theme.textSecondary }]}
        >
          <ThemedText type="smallBold" style={{ color: "#fff" }}>
            Parar
          </ThemedText>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enviar"
          onPress={submit}
          disabled={!text.trim() || disabled}
          style={[
            styles.btn,
            {
              backgroundColor: theme.primary,
              opacity: !text.trim() || disabled ? 0.4 : 1,
            },
          ]}
        >
          {disabled ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText type="smallBold" style={{ color: "#fff" }}>
              Enviar
            </ThemedText>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  btn: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
});
