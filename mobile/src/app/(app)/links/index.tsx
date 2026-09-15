import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  fetchContentLinks,
  markContentLinkConsumed,
  updateContentLink,
} from "@/api/links/links";
import { fetchTags } from "@/api/tasks/tags";
import { ChipBar } from "@/components/ChipBar";
import { FilterSelect } from "@/components/FilterSelect";
import { SearchField } from "@/components/SearchField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import {
  extractContentLinkDomain,
  LINK_STATUS_LABELS,
  LINK_TYPE_LABELS,
  normalizeContentLinkUrl,
} from "@/domain/contentLinks";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { ContentLink, ContentLinkStatus, ContentLinkType } from "@/types/contentLinks";
import type { Tag } from "@/types/tasks";

const TYPE_CHIPS: { id: "all" | ContentLinkType; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "article", label: LINK_TYPE_LABELS.article },
  { id: "video", label: LINK_TYPE_LABELS.video },
  { id: "website", label: LINK_TYPE_LABELS.website },
];
const STATUS_CHIPS: { id: ContentLinkStatus; label: string }[] = [
  { id: "to_consume", label: LINK_STATUS_LABELS.to_consume },
  { id: "consumed", label: LINK_STATUS_LABELS.consumed },
];

export default function LinksScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { fail } = useFeedback();
  const { bottomInset } = useAppShell();
  const [links, setLinks] = useState<ContentLink[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [status, setStatus] = useState<ContentLinkStatus>("to_consume");
  const [typeFilter, setTypeFilter] = useState<"all" | ContentLinkType>("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    const [rows, tagRows] = await Promise.all([
      fetchContentLinks(),
      fetchTags().catch(() => [] as Tag[]),
    ]);
    setLinks(rows);
    setTags(tagRows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar os links."));
          }
        })
        .finally(() => {
          if (!cancelled) {
            hasLoaded.current = true;
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setRefreshing(false);
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return links.filter((link) => {
      if (link.status !== status) return false;
      if (typeFilter !== "all" && link.type !== typeFilter) return false;
      if (tagFilter !== "all" && !(link.tag_ids ?? []).includes(tagFilter)) {
        return false;
      }
      if (favoritesOnly && !link.is_favorite) return false;
      if (!q) return true;
      return (
        link.title.toLowerCase().includes(q) ||
        link.url.toLowerCase().includes(q)
      );
    });
  }, [favoritesOnly, links, search, status, tagFilter, typeFilter]);

  async function toggleConsumed(link: ContentLink) {
    const next = link.status !== "consumed";
    setBusyId(link.id);
    try {
      await markContentLinkConsumed(link.id, next);
      setLinks((cur) =>
        cur.map((row) =>
          row.id === link.id
            ? {
                ...row,
                status: next ? "consumed" : "to_consume",
                consumed_at: next ? new Date().toISOString() : null,
              }
            : row
        )
      );
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar o status."));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleFavorite(link: ContentLink) {
    setBusyId(link.id);
    try {
      await updateContentLink({ id: link.id, is_favorite: !link.is_favorite });
      setLinks((cur) =>
        cur.map((row) =>
          row.id === link.id ? { ...row, is_favorite: !link.is_favorite } : row
        )
      );
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar o favorito."));
    } finally {
      setBusyId(null);
    }
  }

  async function openUrl(url: string) {
    try {
      await Linking.openURL(normalizeContentLinkUrl(url));
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível abrir o link."));
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
      {loading && links.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
            />
          }
        >
          <ChipBar options={STATUS_CHIPS} value={status} onChange={setStatus} />
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar título ou URL"
          />
          <View style={styles.filters}>
            <FilterSelect
              label="Tipo"
              value={typeFilter}
              options={TYPE_CHIPS}
              onChange={(id) =>
                setTypeFilter(id as "all" | ContentLinkType)
              }
            />
            {tags.length > 0 ? (
              <FilterSelect
                label="Tag"
                value={tagFilter}
                options={[
                  { id: "all", label: "Todas as tags" },
                  ...tags.map((tag) => ({ id: tag.id, label: tag.name })),
                ]}
                onChange={setTagFilter}
              />
            ) : null}
            <Pressable
              onPress={() => setFavoritesOnly((cur) => !cur)}
              style={[
                styles.favChip,
                { backgroundColor: theme.backgroundElement },
                favoritesOnly && { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <ThemedText type="smallBold">
                {favoritesOnly ? "♥ Favoritos" : "Favoritos"}
              </ThemedText>
            </Pressable>
          </View>
          {visible.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Nenhum link neste filtro.
            </ThemedText>
          ) : (
            visible.map((link) => (
              <Pressable
                key={link.id}
                onPress={() =>
                  router.push({
                    pathname: "/links/form",
                    params: { id: link.id },
                  })
                }
              >
                <Card style={styles.card}>
                  <View style={styles.copy}>
                    <ThemedText type="smallBold" numberOfLines={2}>
                      {link.title}
                      {link.is_favorite ? " ♥" : ""}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {[
                        LINK_TYPE_LABELS[link.type],
                        extractContentLinkDomain(link.url),
                        ...(link.tag_ids ?? [])
                          .map((tagId) => tags.find((tag) => tag.id === tagId)?.name)
                          .filter(Boolean),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </ThemedText>
                    <View style={styles.actions}>
                      <Pressable onPress={() => void openUrl(link.url)} hitSlop={8}>
                        <ThemedText type="small" style={{ color: theme.primary }}>
                          Abrir
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        disabled={busyId === link.id}
                        onPress={() => void toggleFavorite(link)}
                        hitSlop={8}
                      >
                        <ThemedText type="small" style={{ color: theme.primary }}>
                          {link.is_favorite ? "Desfavoritar" : "Favoritar"}
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        disabled={busyId === link.id}
                        onPress={() => void toggleConsumed(link)}
                        hitSlop={8}
                      >
                        <ThemedText type="small" style={{ color: theme.primary }}>
                          {link.status === "consumed" ? "Marcar para ver" : "Marcar visto"}
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
  list: { padding: Spacing.four, gap: Spacing.three },
  filters: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  card: { padding: Spacing.three },
  copy: { gap: 4 },
  actions: { flexDirection: "row", gap: 16, marginTop: 4 },
  favChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
