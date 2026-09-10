import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export function SelectListModal({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { id: number; label: string; hint?: string }[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.flex}>
        <View style={styles.head}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <Pressable onPress={onClose} hitSlop={8}>
            <ThemedText type="linkPrimary">Fechar</ThemedText>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          {options.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Nada para escolher neste recorte.
            </ThemedText>
          ) : (
            options.map((opt) => {
              const active = opt.id === selectedId;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    onSelect(opt.id);
                    onClose();
                  }}
                  style={[
                    styles.row,
                    {
                      backgroundColor: active
                        ? theme.backgroundSelected
                        : theme.backgroundElement,
                    },
                  ]}
                >
                  <ThemedText type={active ? "smallBold" : "default"}>
                    {opt.label}
                  </ThemedText>
                  {opt.hint ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {opt.hint}
                    </ThemedText>
                  ) : null}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  list: {
    padding: Spacing.four,
    gap: Spacing.two,
    paddingBottom: 48,
  },
  row: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
});
