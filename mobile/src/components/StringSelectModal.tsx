import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { choiceChipColors } from "@/lib/color";

export function StringSelectModal({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
  searchable = false,
}: {
  visible: boolean;
  title: string;
  options: { id: string; label: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  searchable?: boolean;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase("pt-BR");
  const visibleOptions = needle
    ? options.filter((opt) =>
        opt.label.toLocaleLowerCase("pt-BR").includes(needle)
      )
    : options;

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
          <Pressable
            onPress={() => {
              setQuery("");
              onClose();
            }}
            hitSlop={8}
          >
            <ThemedText type="linkPrimary">Fechar</ThemedText>
          </Pressable>
        </View>
        {searchable ? (
          <TextInput
            placeholder="Buscar"
            placeholderTextColor={theme.textSecondary}
            value={query}
            onChangeText={setQuery}
            style={[
              styles.search,
              {
                color: theme.text,
                borderColor: theme.backgroundSelected,
                backgroundColor: theme.backgroundElement,
              },
            ]}
          />
        ) : null}
        <ScrollView contentContainerStyle={styles.list}>
          {visibleOptions.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Nada para escolher neste recorte.
            </ThemedText>
          ) : (
            visibleOptions.map((opt) => {
              const active = opt.id === selectedId;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    onSelect(opt.id);
                    setQuery("");
                    onClose();
                  }}
                  style={[styles.row, choiceChipColors(theme, active)]}
                >
                  <ThemedText
                    type={active ? "smallBold" : "default"}
                    style={active ? { color: theme.primary } : undefined}
                  >
                    {opt.label}
                  </ThemedText>
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
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  search: {
    marginHorizontal: Spacing.four,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  list: { padding: Spacing.four, gap: Spacing.two, paddingBottom: 48 },
  row: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14 },
});
