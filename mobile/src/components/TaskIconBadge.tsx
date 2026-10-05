import Ionicons from "@expo/vector-icons/Ionicons";
import { Image, StyleSheet } from "react-native";

import { useTheme } from "@/hooks/use-theme";

const PRESET_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  flag: "flag-outline",
  star: "star-outline",
  bookmark: "bookmark-outline",
  pin: "pin-outline",
  bell: "notifications-outline",
  "alert-circle": "alert-circle-outline",
  "check-circle": "checkmark-circle-outline",
  "shopping-cart": "cart-outline",
  pill: "medkit-outline",
  github: "logo-github",
  gitlab: "logo-gitlab",
  figma: "color-palette-outline",
  youtube: "logo-youtube",
  kanban: "grid-outline",
  notebook: "journal-outline",
  "file-text": "document-text-outline",
  globe: "globe-outline",
  external: "open-outline",
};

export function TaskIconBadge({
  iconKey,
  iconUrl,
  size = 12,
  color,
}: {
  iconKey?: string | null;
  iconUrl?: string | null;
  size?: number;
  color?: string;
}) {
  const theme = useTheme();
  const tint = color ?? theme.mutedForeground;
  if (iconUrl) {
    return (
      <Image
        source={{ uri: iconUrl }}
        style={[styles.img, { width: size, height: size, borderRadius: 2 }]}
      />
    );
  }
  const name = iconKey ? PRESET_ICONS[iconKey] : null;
  if (!name) return null;
  return <Ionicons name={name} size={size} color={tint} />;
}

const styles = StyleSheet.create({
  img: { flexShrink: 0 },
});
