import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hapticLight } from "@/lib/haptics";

export function FormSection({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View
      style={[
        styles.block,
        { backgroundColor: theme.surface, borderColor: theme.backgroundSelected },
      ]}
    >
      <Pressable
        onPress={() => {
          void hapticLight();
          setOpen((cur) => !cur);
        }}
        style={styles.head}
      >
        <View style={styles.copy}>
          <ThemedText type="smallBold">{title}</ThemedText>
          {!open && hint ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {hint}
            </ThemedText>
          ) : null}
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.textSecondary}
        />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  copy: { flex: 1, gap: 2 },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: Spacing.three },
});
