import { useRouter } from "expo-router";
import { Pressable } from "react-native";

import { ThemedText } from "@/components/themed-text";

export function FormCloseButton({
  onPress,
  disabled,
}: {
  onPress?: () => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => (onPress ? onPress() : router.back())}
      hitSlop={8}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Fechar"
    >
      <ThemedText type="linkPrimary">Fechar</ThemedText>
    </Pressable>
  );
}
