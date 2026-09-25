import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  deleteContentLink,
  fetchContentLinks,
  markContentLinkConsumed,
  updateContentLink,
} from "@/api/links/links";
import { fetchTags } from "@/api/tasks/tags";
import { ChipBar } from "@/components/ChipBar";
import { ChoiceChip } from "@/components/ChoiceChip";
import { FilterSelect } from "@/components/FilterSelect";
import { SearchField } from "@/components/SearchField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import {
  contentLinkFaviconUrl,
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

const STAR_ON = "#F59E0B";

const BRAND_ICONS: {
  roots: readonly string[];
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { roots: ["instagram.com", "instagr.am"], icon: "logo-instagram" },
  { roots: ["youtube.com", "youtu.be"], icon: "logo-youtube" },
  { roots: ["tiktok.com"], icon: "logo-tiktok" },
  { roots: ["twitter.com"], icon: "logo-twitter" },
  { roots: ["x.com"], icon: "logo-x" },
  { roots: ["github.com"], icon: "logo-github" },
  { roots: ["linkedin.com"], icon: "logo-linkedin" },
  { roots: ["facebook.com", "fb.com"], icon: "logo-facebook" },
  { roots: ["reddit.com"], icon: "logo-reddit" },
  { roots: ["twitch.tv"], icon: "logo-twitch" },
  { roots: ["vimeo.com"], icon: "logo-vimeo" },
  { roots: ["pinterest.com"], icon: "logo-pinterest" },
  { roots: ["discord.com", "discord.gg"], icon: "logo-discord" },
  { roots: ["whatsapp.com", "wa.me"], icon: "logo-whatsapp" },
  { roots: ["telegram.org", "t.me"], icon: "paper-plane-outline" },
  { roots: ["medium.com"], icon: "logo-medium" },
  { roots: ["apple.com"], icon: "logo-apple" },
  { roots: ["google.com"], icon: "logo-google" },
];

function brandIconForDomain(
  domain: string | null
): keyof typeof Ionicons.glyphMap | null {
  if (!domain) return null;
  const host = domain.toLowerCase();
  const hit = BRAND_ICONS.find(({ roots }) =>
    roots.some((root) => host === root || host.endsWith(`.${root}`))
  );
  return hit?.icon ?? null;
}

function LinkSourceIcon({ url, color }: { url: string; color: string }) {
  const domain = extractContentLinkDomain(url);
  const brand = brandIconForDomain(domain);
  const [faviconFailed, setFaviconFailed] = useState(false);

  if (brand) {
    return <Ionicons name={brand} size={20} color={color} />;
  }
  if (domain && !faviconFailed) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: contentLinkFaviconUrl(domain) }}
        style={styles.favicon}
        onError={() => setFaviconFailed(true)}
      />
    );
  }
  return <Ionicons name="link-outline" size={20} color={color} />;
}

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

  function confirmDelete(link: ContentLink) {
    Alert.alert("Excluir link", link.title, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void deleteContentLink(link.id)
            .then(() =>
              setLinks((cur) => cur.filter((row) => row.id !== link.id))
            )
            .catch((err) =>
              fail(getErrorMessage(err, "Não foi possível excluir."))
            );
        },
      },
    ]);
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
            <ChoiceChip
              label={favoritesOnly ? "♥ Favoritos" : "Favoritos"}
              active={favoritesOnly}
              onPress={() => setFavoritesOnly((cur) => !cur)}
            />
          </View>
          {visible.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Nenhum link neste filtro.
            </ThemedText>
          ) : (
            visible.map((link) => {
              const consumed = link.status === "consumed";
              const domain = extractContentLinkDomain(link.url);
              return (
                <Card key={link.id} style={styles.card}>
                  <Pressable
                    accessibilityLabel={
                      consumed ? "Marcar para ver" : "Marcar como visto"
                    }
                    accessibilityState={{ selected: consumed }}
                    disabled={busyId === link.id}
                    hitSlop={6}
                    onPress={() => void toggleConsumed(link)}
                    style={styles.iconBtn}
                  >
                    <Ionicons
                      name={consumed ? "checkmark-circle" : "ellipse-outline"}
                      size={22}
                      color={consumed ? theme.primary : theme.textSecondary}
                    />
                  </Pressable>
                  <View style={styles.sourceIcon}>
                    <LinkSourceIcon url={link.url} color={theme.text} />
                  </View>
                  <Pressable
                    style={styles.copy}
                    onPress={() =>
                      router.push(
                        {
                          pathname: "/links/form",
                          params: { id: link.id },
                        },
                        { withAnchor: true }
                      )
                    }
                  >
                    <ThemedText
                      type="smallBold"
                      numberOfLines={2}
                      style={consumed ? styles.done : undefined}
                    >
                      {link.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {[
                        LINK_TYPE_LABELS[link.type],
                        domain,
                        ...(link.tag_ids ?? [])
                          .map((tagId) =>
                            tags.find((tag) => tag.id === tagId)?.name
                          )
                          .filter(Boolean),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={
                      link.is_favorite ? "Remover favorito" : "Favoritar"
                    }
                    disabled={busyId === link.id}
                    hitSlop={6}
                    onPress={() => void toggleFavorite(link)}
                    style={styles.iconBtn}
                  >
                    <Ionicons
                      name={link.is_favorite ? "star" : "star-outline"}
                      size={18}
                      color={link.is_favorite ? STAR_ON : theme.textSecondary}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Abrir link"
                    hitSlop={6}
                    onPress={() => void openUrl(link.url)}
                    style={styles.iconBtn}
                  >
                    <Ionicons
                      name="open-outline"
                      size={18}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Excluir link"
                    hitSlop={6}
                    onPress={() => confirmDelete(link)}
                    style={styles.iconBtn}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={theme.danger}
                    />
                  </Pressable>
                </Card>
              );
            })
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
  card: {
    padding: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sourceIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  favicon: { width: 18, height: 18, borderRadius: 4 },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  done: { textDecorationLine: "line-through", opacity: 0.6 },
});
