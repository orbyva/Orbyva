import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { tintedSurface } from "@/lib/color";

/**
 * Coração sempre visível: cheio e vermelho quando favorito, contorno quando não.
 * `pill` mostra o texto ("Favorito"/"Favoritar"); `icon` é o botão redondo do card da lista.
 */
export function FavoriteToggle({
  favorite,
  onToggle,
  disabled,
  variant = "pill",
  subject,
}: {
  favorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
  variant?: "pill" | "icon";
  subject?: string;
}) {
  const theme = useTheme();
  const on = tintedSurface(theme.destructive);
  const color = favorite ? theme.destructive : theme.mutedForeground;
  const label = favorite
    ? `Remover ${subject ?? ""} dos favoritos`.replace(/\s+/g, " ")
    : `Favoritar ${subject ?? ""}`.trim();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: favorite, disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={(event) => {
        event.stopPropagation?.();
        onToggle();
      }}
      style={({ pressed }) => [
        variant === "pill" ? styles.pill : styles.icon,
        favorite ? on : { borderColor: theme.border, backgroundColor: theme.card },
        (pressed || disabled) && styles.dim,
      ]}
    >
      <Ionicons
        name={favorite ? "heart" : "heart-outline"}
        size={variant === "pill" ? 16 : 18}
        color={color}
      />
      {variant === "pill" ? (
        <ThemedText type="smallBold" style={{ color }}>
          {favorite ? "Favorito" : "Favoritar"}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  icon: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  dim: { opacity: 0.6 },
});
