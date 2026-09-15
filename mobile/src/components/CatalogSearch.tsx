import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { CoverThumb } from "@/components/CoverThumb";
import { SearchField } from "@/components/SearchField";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";

export type CatalogHitView = {
  key: string;
  title: string;
  subtitle: string;
  cover?: string | null;
  square?: boolean;
};

export function CatalogSearch<T>({
  placeholder,
  enabled,
  unavailableHint,
  search,
  toView,
  onSelect,
  selectedLabel = null,
  onClear,
}: {
  placeholder: string;
  enabled: boolean;
  unavailableHint: string;
  search: (query: string) => Promise<T[]>;
  toView: (hit: T) => CatalogHitView;
  onSelect: (hit: T) => void;
  selectedLabel?: string | null;
  onClear?: () => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const searchRef = useRef(search);
  searchRef.current = search;
  const showingSelected = Boolean(selectedLabel) && query === "";

  useEffect(() => {
    if (!enabled) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      setLoading(true);
      void searchRef
        .current(q)
        .then((rows) => {
          if (reqId.current !== id) return;
          setHits(rows);
          setError(null);
        })
        .catch((err) => {
          if (reqId.current !== id) return;
          setHits([]);
          setError(
            getErrorMessage(err, "Não foi possível buscar no catálogo.")
          );
        })
        .finally(() => {
          if (reqId.current === id) setLoading(false);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [enabled, query]);

  if (!enabled) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {unavailableHint}
      </ThemedText>
    );
  }

  return (
    <View style={styles.block}>
      <SearchField
        value={showingSelected ? selectedLabel! : query}
        onChangeText={(next) => {
          if (selectedLabel) onClear?.();
          setQuery(next);
        }}
        placeholder={placeholder}
      />
      {loading ? <ActivityIndicator color={theme.primary} /> : null}
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
      {showingSelected ? null : (
        hits.map((hit) => {
          const view = toView(hit);
          return (
            <Pressable
              key={view.key}
              onPress={() => {
                Keyboard.dismiss();
                setQuery("");
                setHits([]);
                onSelect(hit);
              }}
            >
              <View style={styles.hit}>
                <CoverThumb
                  uri={view.cover}
                  fallback={view.title}
                  variant={view.square ? "square" : "poster"}
                />
                <View style={styles.copy}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {view.title}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    numberOfLines={2}
                  >
                    {view.subtitle}
                  </ThemedText>
                </View>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  hit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  copy: { flex: 1, gap: 2 },
});
