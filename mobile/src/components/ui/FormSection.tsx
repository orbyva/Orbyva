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
        <ThemedText type="smallBold" style={styles.formBlockTitle}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <View
        style={[
          styles.formBlockRule,
          { backgroundColor: theme.backgroundSelected },
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
  formBlock: { gap: Spacing.two },
  formBlockHead: { gap: 2 },
  formBlockTitle: {
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  formBlockRule: { height: StyleSheet.hairlineWidth },
  formBlockBody: { gap: Spacing.three },
});
