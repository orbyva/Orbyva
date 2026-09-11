import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useAppShell } from "@/hooks/use-app-shell";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useThemePreference } from "@/hooks/use-theme-preference";
import { isNavActive, NAV_GROUPS, normalizePath, type AppHref } from "@/lib/nav";

function hexAlpha(hex: string, alpha: number): string {
  const n = hex.replace("#", "");
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function AppSidebar() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const path = normalizePath(pathname);
  const { user } = useAuth();
  const { scheme, toggleScheme } = useThemePreference();
  const { sidebarOpen, setSidebarOpen } = useAppShell();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const panelWidth = Math.min(340, Math.round(windowWidth * 0.84));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Início:
      path.startsWith("/home") || path === "/" || path.startsWith("/timeline"),
    Finanças: path.startsWith("/finance"),
    Produtividade:
      path.startsWith("/tasks") ||
      path.startsWith("/notes") ||
      path.startsWith("/shopping"),
  });

  function close() {
    setSidebarOpen(false);
  }

  function go(href: AppHref) {
    if (!href) {
      Alert.alert("Em breve", "Esse módulo ainda não está no app.");
      return;
    }
    close();
    if (isNavActive(path, href)) return;
    router.navigate(href);
  }

  return (
    <Modal
      visible={sidebarOpen}
      animationType="fade"
      transparent
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar menu"
          onPress={close}
          style={styles.backdrop}
        />
        <View
          style={[
            styles.panel,
            {
              width: panelWidth,
              backgroundColor: theme.background,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              paddingLeft: insets.left,
            },
          ]}
        >
          <View style={styles.brandRow}>
            <View style={styles.mark}>
              <ThemedText style={styles.markText}>O</ThemedText>
            </View>
            <Pressable onPress={() => go("/home")} style={styles.brandCopy}>
              <ThemedText type="smallBold">Orbyva</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                sua vida em uma só órbita
              </ThemedText>
            </Pressable>
            <Pressable onPress={close} hitSlop={8} style={styles.close}>
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {NAV_GROUPS.map((group) => {
              const items = group.items.filter((item) => item.href);
              if (items.length === 0) return null;
              const expanded = Boolean(openGroups[group.title]);
              const groupActive = items.some((item) =>
                isNavActive(path, item.href)
              );
              return (
                <View key={group.title} style={styles.group}>
                  <Pressable
                    onPress={() =>
                      setOpenGroups((cur) => ({
                        ...cur,
                        [group.title]: !expanded,
                      }))
                    }
                    style={[
                      styles.groupBtn,
                      groupActive && { backgroundColor: hexAlpha(group.color, 0.12) },
                    ]}
                  >
                    <View
                      style={[
                        styles.groupIcon,
                        { backgroundColor: hexAlpha(group.color, 0.16) },
                      ]}
                    >
                      <Ionicons name={group.icon} size={16} color={group.color} />
                    </View>
                    <ThemedText type="smallBold" style={{ flex: 1, color: group.color }}>
                      {group.title}
                    </ThemedText>
                    <Ionicons
                      name={expanded ? "chevron-down" : "chevron-forward"}
                      size={16}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                  {expanded
                    ? items.map((item) => {
                        const active = isNavActive(path, item.href);
                        return (
                          <Pressable
                            key={item.title}
                            onPress={() => go(item.href)}
                            style={[
                              styles.leaf,
                              active && {
                                backgroundColor: hexAlpha(group.color, 0.14),
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.leafDot,
                                { backgroundColor: group.color },
                              ]}
                            />
                            <ThemedText
                              style={{
                                flex: 1,
                                color: theme.text,
                                fontWeight: active ? "700" : "500",
                              }}
                            >
                              {item.title}
                            </ThemedText>
                          </Pressable>
                        );
                      })
                    : null}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                scheme === "dark" ? "Alternar para Claro" : "Alternar para Escuro"
              }
              onPress={toggleScheme}
              style={[
                styles.themeBtn,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <Ionicons
                name={scheme === "dark" ? "sunny-outline" : "moon-outline"}
                size={18}
                color={theme.text}
              />
            </Pressable>
            <Pressable
              onPress={() => go("/account")}
              style={[
                styles.account,
                {
                  backgroundColor: theme.backgroundElement,
                },
                isNavActive(path, "/account") && {
                  backgroundColor: theme.backgroundSelected,
                },
              ]}
            >
              <View style={[styles.groupIcon, { backgroundColor: theme.backgroundSelected }]}>
                <Ionicons name="person-outline" size={16} color={theme.text} />
              </View>
              <View style={styles.accountCopy}>
                <ThemedText type="smallBold">Conta</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {user?.email ?? "sem e-mail"}
                </ThemedText>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(11,15,26,0.5)",
  },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 8, height: 0 },
    elevation: 12,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#0EA5E9",
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { color: "#0B0F1A", fontSize: 18, fontWeight: "800" },
  brandCopy: { flex: 1, gap: 1 },
  close: { padding: 4 },
  scroll: { flex: 1 },
  list: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.four, gap: 4 },
  group: { marginBottom: 2 },
  groupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
  },
  groupIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  leaf: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 18,
    marginRight: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  leafDot: { width: 6, height: 6, borderRadius: 3 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: Spacing.two,
  },
  themeBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  account: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  accountCopy: { flex: 1, gap: 1 },
});
