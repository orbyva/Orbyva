import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hapticLight } from "@/lib/haptics";

/** Separação fixa no estilo web: título uppercase + linha + campos. */
export function FormBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.formBlock}>
      <View style={styles.formBlockHead}>
        <ThemedText type="micro" themeColor="mutedForeground" style={styles.formBlockTitle}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="mutedForeground">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <View
        style={[
          styles.formBlockRule,
          { backgroundColor: theme.border },
        ]}
      />
      <View style={styles.formBlockBody}>{children}</View>
    </View>
  );
}

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
        { backgroundColor: theme.card, borderColor: theme.border },
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
          <ThemedText type="bodyStrong">{title}</ThemedText>
          {!open && hint ? (
            <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1}>
              {hint}
            </ThemedText>
          ) : null}
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.mutedForeground}
        />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
  },
  copy: { flex: 1, gap: 2 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.three },
  formBlock: { gap: Spacing.two },
  formBlockHead: { gap: 2 },
  formBlockTitle: {
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  formBlockRule: { height: StyleSheet.hairlineWidth },
  formBlockBody: { gap: Spacing.three },
});
