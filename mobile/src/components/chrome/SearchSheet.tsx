import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  searchGlobal,
  SEARCH_KIND_LABEL,
  type GlobalSearchHit,
} from "@/api/search";
import { SearchField } from "@/components/SearchField";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";

export function SearchSheet() {
  const theme = useTheme();
  const router = useRouter();
  const { searchOpen, setSearchOpen } = useAppShell();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!searchOpen) {
      setQuery("");
      setHits([]);
      return;
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => {
      void searchGlobal(q)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, searchOpen]);

  function close() {
    setSearchOpen(false);
  }

  return (
    <Modal
      visible={searchOpen}
      animationType="none"
      transparent
      onRequestClose={close}
    >
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.background }]}
          onPress={() => undefined}
        >
          <View style={styles.head}>
            <ThemedText type="smallBold">Buscar</ThemedText>
            <Pressable onPress={close} hitSlop={8}>
              <ThemedText type="linkPrimary">Fechar</ThemedText>
            </Pressable>
          </View>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Transação, filme, lugar…"
          />
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.body}>
            {loading ? (
              <ActivityIndicator color={theme.primary} />
            ) : query.trim().length < 2 ? (
              <ThemedText themeColor="textSecondary">
                Digite pelo menos 2 letras.
              </ThemedText>
            ) : hits.length === 0 ? (
              <ThemedText themeColor="textSecondary">
                Nada encontrado.
              </ThemedText>
            ) : (
              hits.map((hit) => (
                <Pressable
                  key={hit.id}
                  onPress={() => {
                    close();
                    router.push(hit.href as never);
                  }}
                  style={[styles.row, { borderColor: theme.backgroundSelected }]}
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    {SEARCH_KIND_LABEL[hit.kind]}
                  </ThemedText>
                  <ThemedText type="smallBold">{hit.title}</ThemedText>
                  {hit.subtitle ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {hit.subtitle}
                    </ThemedText>
                  ) : null}
                </Pressable>
              ))
            )}
          </ScrollView>
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
    maxHeight: "80%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  body: { maxHeight: 420 },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 2,
  },
});
