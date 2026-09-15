import { type Href, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { Alert, Modal, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { normalizePath, quickAddActionsForPath } from "@/lib/nav";

export function QuickAddSheet() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { quickAddOpen, setQuickAddOpen } = useAppShell();
  const actions = quickAddActionsForPath(normalizePath(pathname));

  useEffect(() => {
    setQuickAddOpen(false);
  }, [pathname, setQuickAddOpen]);

  function close() {
    setQuickAddOpen(false);
  }

  if (!quickAddOpen) return null;

  return (
    <Modal
      visible={quickAddOpen}
      animationType="fade"
      transparent
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={close}
    >
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.background }]}
          onPress={() => undefined}
        >
          <View style={styles.head}>
            <ThemedText type="smallBold">Adicionar</ThemedText>
            <Pressable onPress={close} hitSlop={8}>
              <ThemedText type="linkPrimary">Fechar</ThemedText>
            </Pressable>
          </View>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              onPress={() => {
                close();
                if (!action.href) {
                  Alert.alert("Em breve", "Esse módulo ainda não está no app.");
                  return;
                }
                if (action.params) {
                  router.push(
                    {
                      pathname: action.href,
                      params: action.params,
                    } as Href,
                    { withAnchor: true }
                  );
                } else {
                  router.push(action.href, { withAnchor: true });
                }
              }}
              style={[
                styles.row,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText type="smallBold">{action.label}</ThemedText>
              {action.href ? null : (
                <ThemedText type="small" themeColor="textSecondary">
                  Em breve
                </ThemedText>
              )}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(11,15,26,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
    gap: Spacing.two,
    paddingBottom: Spacing.five,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  row: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});
