import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { Button } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";

/**
 * Espelha `src/components/orb/OrbComposer.tsx`: cartão arredondado com o campo de uma linha que
 * cresce até um teto e o botão redondo de seta dentro, alinhado à última linha. Não usa o `Input`
 * multiline do design system porque ele fixa altura mínima de formulário (96px).
 */
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
  const [focused, setFocused] = useState(false);
  const canSend = Boolean(text.trim()) && !disabled;

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled || streaming) return;
    setText("");
    onSend(trimmed);
  }

  return (
    <View style={[styles.bar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.card,
            borderColor: focused ? theme.ring : theme.border,
          },
        ]}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Pergunte à Orb…"
          placeholderTextColor={theme.mutedForeground}
          selectionColor={theme.primary}
          multiline
          editable={!disabled && !streaming}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel="Mensagem para a Orb"
          style={[styles.input, { color: theme.foreground }]}
        />
        {streaming ? (
          <Button
            size="icon"
            variant="secondary"
            icon="stop"
            accessibilityLabel="Parar"
            onPress={onStop}
            style={styles.send}
          />
        ) : (
          <Button
            size="icon"
            icon="arrow-up"
            accessibilityLabel="Enviar"
            disabled={!canSend}
            loading={disabled}
            onPress={submit}
            style={styles.send}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: 6,
  },
  input: {
    ...TypeScale.body,
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    textAlignVertical: "center",
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
  },
});
