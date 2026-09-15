import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchAllAlbums, updateAlbum } from "@/api/music/albums";
import { ChipBar } from "@/components/ChipBar";
import { CatalogMediaCard } from "@/components/CatalogMediaCard";
import { FilterSelect } from "@/components/FilterSelect";
import { InsightsStrip } from "@/components/InsightsStrip";
import { ReviewSheet } from "@/components/ReviewSheet";
import { SearchField } from "@/components/SearchField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Spacing } from "@/constants/theme";
import { CATALOG_SORT_OPTIONS, sortAlbums } from "@/domain/entertainment/sort";
import {
  ALBUM_STATUS_LABELS,
  ALBUM_TYPE_LABELS,
  albumStatusUpdate,
  collectAlbumTypes,
  filterAlbumsByMeta,
  formatArtists,
  getAlbumLibraryStats,
  pickRandomToListenAlbum,
} from "@/domain/music";
import { getTodayIso } from "@/domain/timeline";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Album, AlbumRatingFloor, AlbumStatus } from "@/types/music";

const STATUS_CHIPS: { id: AlbumStatus; label: string }[] = [
  { id: "to_listen", label: ALBUM_STATUS_LABELS.to_listen },
  { id: "listened", label: ALBUM_STATUS_LABELS.listened },
];
const RATING_CHIPS: { id: AlbumRatingFloor; label: string }[] = [
  { id: "all", label: "Qualquer nota" },
  { id: "6", label: "6+" },
  { id: "7", label: "7+" },
  { id: "8", label: "8+" },
  { id: "9", label: "9+" },
];

export default function MusicScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { fail } = useFeedback();
  const { bottomInset } = useAppShell();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [status, setStatus] = useState<AlbumStatus>("to_listen");
  const [albumType, setAlbumType] = useState("all");
  const [ratingFloor, setRatingFloor] = useState<AlbumRatingFloor>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<(typeof CATALOG_SORT_OPTIONS)[number]["id"]>(
    "default"
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewAlbum, setReviewAlbum] = useState<Album | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    setAlbums(await fetchAllAlbums());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar a música."));
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

  const stats = useMemo(() => getAlbumLibraryStats(albums), [albums]);
  const statusAlbums = useMemo(
    () => albums.filter((album) => album.status === status),
    [albums, status]
  );
  const types = useMemo(() => collectAlbumTypes(statusAlbums), [statusAlbums]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = filterAlbumsByMeta(statusAlbums, {
      albumType,
      minRating: status === "listened" ? ratingFloor : "all",
    });
    if (favoritesOnly) list = list.filter((album) => album.is_favorite === true);
    if (q) {
      list = list.filter(
        (album) =>
          album.title.toLowerCase().includes(q) ||
          album.artists.some((artist) => artist.toLowerCase().includes(q))
      );
    }
    return sortAlbums(list, sort, status);
  }, [albumType, favoritesOnly, ratingFloor, search, sort, status, statusAlbums]);

  async function markListened(
    album: Album,
    extras: { rating: number | null; recommend: boolean }
  ) {
    setBusyId(album.musicbrainz_id);
    try {
      await updateAlbum({
        ...albumStatusUpdate(album, "listened", getTodayIso()),
        rating: extras.rating,
        would_recommend: extras.recommend,
      });
      setAlbums((cur) =>
        cur.map((row) =>
          row.musicbrainz_id === album.musicbrainz_id
            ? {
                ...row,
                status: "listened",
                rating: extras.rating,
                would_recommend: extras.recommend,
              }
            : row
        )
      );
      setReviewAlbum(null);
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar o status."));
    } finally {
      setBusyId(null);
    }
  }

  function openAlbum(id: string) {
    router.push({ pathname: "/music/[id]", params: { id } });
  }

  function surprise() {
    const pick = pickRandomToListenAlbum(albums);
    if (!pick) {
      fail("Nada na fila para ouvir.");
      return;
    }
    openAlbum(pick.musicbrainz_id);
  }

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
      {loading && albums.length === 0 ? (
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
          <InsightsStrip
            items={[
              { label: "ouvidos", value: stats.listened },
              { label: "este ano", value: stats.thisYear },
              { label: "na fila", value: stats.toListen },
              { label: "favoritos", value: stats.favorites },
            ]}
          />
          <ChipBar options={STATUS_CHIPS} value={status} onChange={setStatus} />
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar álbum ou artista"
          />
          <View style={styles.filters}>
            {types.length > 0 ? (
              <FilterSelect
                label="Tipo"
                value={albumType}
                options={[
                  { id: "all", label: "Todos os tipos" },
                  ...types.map((id) => ({ id, label: ALBUM_TYPE_LABELS[id] })),
                ]}
                onChange={setAlbumType}
              />
            ) : null}
            {status === "listened" ? (
              <FilterSelect
                label="Nota"
                value={ratingFloor}
                options={RATING_CHIPS}
                onChange={(id) => setRatingFloor(id as AlbumRatingFloor)}
              />
            ) : null}
            <FilterSelect
              label="Ordenar"
              value={sort}
              options={CATALOG_SORT_OPTIONS}
              onChange={(id) =>
                setSort(id as (typeof CATALOG_SORT_OPTIONS)[number]["id"])
              }
            />
            <Pressable
              onPress={() => setFavoritesOnly((cur) => !cur)}
              style={[
                styles.chip,
                { backgroundColor: theme.backgroundElement },
                favoritesOnly && { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <ThemedText type="smallBold">
                {favoritesOnly ? "♥ Favoritos" : "Favoritos"}
              </ThemedText>
            </Pressable>
            <Pressable onPress={surprise}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Me surpreenda
              </ThemedText>
            </Pressable>
          </View>
          {visible.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Nenhum álbum neste filtro.
            </ThemedText>
          ) : (
            visible.map((album) => (
              <CatalogMediaCard
                key={album.musicbrainz_id}
                coverUri={album.cover_url}
                fallback={album.title}
                coverVariant="square"
                title={album.title}
                favorite={album.is_favorite === true}
                rating={album.rating != null ? String(album.rating) : null}
                meta={[
                  formatArtists(album.artists),
                  ALBUM_TYPE_LABELS[album.album_type],
                  album.release_year,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                actionLabel={
                  album.status !== "listened" ? "Marcar ouvido" : null
                }
                onAction={
                  busyId === album.musicbrainz_id
                    ? undefined
                    : () => setReviewAlbum(album)
                }
                onPress={() => openAlbum(album.musicbrainz_id)}
              />
            ))
          )}
        </ScrollView>
      )}
      <ReviewSheet
        visible={reviewAlbum != null}
        title="Avaliar álbum"
        itemTitle={reviewAlbum?.title ?? ""}
        confirmLabel="Marcar ouvido"
        busy={reviewAlbum != null && busyId === reviewAlbum.musicbrainz_id}
        onClose={() => setReviewAlbum(null)}
        onConfirm={(result) => {
          if (!reviewAlbum) return;
          return markListened(reviewAlbum, result);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
  list: { padding: Spacing.four, gap: Spacing.three },
  filters: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
