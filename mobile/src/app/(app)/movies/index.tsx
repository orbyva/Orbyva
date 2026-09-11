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

import { fetchWatchedEpisodeCounts } from "@/api/movies/episodes";
import { fetchAllMovies, updateMovie } from "@/api/movies/movies";
import { ChipBar } from "@/components/ChipBar";
import { CoverThumb } from "@/components/CoverThumb";
import { InsightsStrip } from "@/components/InsightsStrip";
import { SearchField } from "@/components/SearchField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import { CATALOG_SORT_OPTIONS, sortMovies } from "@/domain/entertainment/sort";
import {
  collectMovieGenres,
  filterMoviesByGenreAndRating,
  filterMoviesByType,
  getCinemaLibraryStats,
  MOVIE_STATUS_LABELS,
  MOVIE_TYPE_LABELS,
  movieStatusUpdate,
  pickRandomToWatchMovie,
} from "@/domain/movies";
import { getTodayIso } from "@/domain/timeline";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import {
  MovieStatus,
  type Movie,
  type MovieListFilter,
  type MovieRatingFloor,
  type MovieTypeFilter,
} from "@/types/movies";

const STATUS_CHIPS: { id: MovieListFilter; label: string }[] = [
  { id: "to_watch", label: MOVIE_STATUS_LABELS.to_watch },
  { id: "watching", label: MOVIE_STATUS_LABELS.watching },
  { id: "watched", label: MOVIE_STATUS_LABELS.watched },
  { id: "abandoned", label: MOVIE_STATUS_LABELS.abandoned },
];
const TYPE_CHIPS: { id: MovieTypeFilter; label: string }[] = [
  { id: "all", label: "Tudo" },
  { id: "movie", label: "Filme" },
  { id: "series", label: "Série" },
];
const RATING_CHIPS: { id: MovieRatingFloor; label: string }[] = [
  { id: "all", label: "Qualquer nota" },
  { id: "6", label: "6+" },
  { id: "7", label: "7+" },
  { id: "8", label: "8+" },
  { id: "9", label: "9+" },
];

export default function MoviesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { fail } = useFeedback();
  const { bottomInset } = useAppShell();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [episodeCounts, setEpisodeCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<MovieListFilter>("to_watch");
  const [typeFilter, setTypeFilter] = useState<MovieTypeFilter>("all");
  const [genre, setGenre] = useState("all");
  const [ratingFloor, setRatingFloor] = useState<MovieRatingFloor>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<(typeof CATALOG_SORT_OPTIONS)[number]["id"]>(
    "default"
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    const rows = await fetchAllMovies();
    setMovies(rows);
    const seriesIds = rows
      .filter((movie) => movie.type === "series")
      .map((movie) => movie.imdb_id);
    setEpisodeCounts(await fetchWatchedEpisodeCounts(seriesIds).catch(() => ({})));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar o cinema."));
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

  const stats = useMemo(() => getCinemaLibraryStats(movies), [movies]);
  const statusMovies = useMemo(
    () => movies.filter((movie) => movie.status === status),
    [movies, status]
  );
  const genres = useMemo(
    () => collectMovieGenres(statusMovies),
    [statusMovies]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = filterMoviesByType(statusMovies, typeFilter);
    list = filterMoviesByGenreAndRating(list, {
      genre,
      minRating: status === "watched" ? ratingFloor : "all",
    });
    if (favoritesOnly) list = list.filter((movie) => movie.is_favorite === true);
    if (q) {
      list = list.filter(
        (movie) =>
          movie.title.toLowerCase().includes(q) ||
          movie.director?.toLowerCase().includes(q) ||
          movie.genre.some((item) => item.toLowerCase().includes(q))
      );
    }
    return sortMovies(list, sort, status);
  }, [
    favoritesOnly,
    genre,
    ratingFloor,
    search,
    sort,
    status,
    statusMovies,
    typeFilter,
  ]);

  async function markWatched(movie: Movie) {
    setBusyId(movie.imdb_id);
    try {
      await updateMovie(movieStatusUpdate(movie, MovieStatus.WATCHED, getTodayIso()));
      setMovies((cur) =>
        cur.map((row) =>
          row.imdb_id === movie.imdb_id
            ? { ...row, status: MovieStatus.WATCHED }
            : row
        )
      );
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar o status."));
    } finally {
      setBusyId(null);
    }
  }

  function openMovie(id: string) {
    router.push({ pathname: "/movies/[id]", params: { id } });
  }

  function surprise() {
    const pick = pickRandomToWatchMovie(movies, genre);
    if (!pick) {
      fail("Nada na fila para assistir.");
      return;
    }
    openMovie(pick.imdb_id);
  }

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
      {loading && movies.length === 0 ? (
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
              { label: "assistidos", value: stats.watched },
              { label: "este ano", value: stats.thisYear },
              { label: "na lista", value: stats.toWatch },
              { label: "favoritos", value: stats.favorites },
            ]}
          />
          <ChipBar options={STATUS_CHIPS} value={status} onChange={setStatus} />
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar título, diretor ou gênero"
          />
          <ChipBar options={TYPE_CHIPS} value={typeFilter} onChange={setTypeFilter} />
          {genres.length > 0 ? (
            <ChipBar
              options={[
                { id: "all", label: "Gêneros" },
                ...genres.map((id) => ({ id, label: id })),
              ]}
              value={genre}
              onChange={setGenre}
            />
          ) : null}
          {status === "watched" ? (
            <ChipBar
              options={RATING_CHIPS}
              value={ratingFloor}
              onChange={setRatingFloor}
            />
          ) : null}
          <View style={styles.row}>
            <Pressable
              onPress={() => setFavoritesOnly((cur) => !cur)}
              style={[
                styles.chip,
                { backgroundColor: theme.backgroundElement },
                favoritesOnly && { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <ThemedText type="smallBold">Favoritos</ThemedText>
            </Pressable>
            <Pressable onPress={surprise} style={styles.chip}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Me surpreenda
              </ThemedText>
            </Pressable>
          </View>
          <ChipBar
            options={CATALOG_SORT_OPTIONS}
            value={sort}
            onChange={setSort}
          />
          {visible.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Nenhum título neste filtro.
            </ThemedText>
          ) : (
            visible.map((movie) => {
              const watchedEps = episodeCounts[movie.imdb_id];
              const totalEps = movie.episode_count;
              return (
                <Pressable key={movie.imdb_id} onPress={() => openMovie(movie.imdb_id)}>
                  <Card style={styles.card}>
                    <CoverThumb uri={movie.poster} fallback={movie.title} />
                    <View style={styles.copy}>
                      <ThemedText type="smallBold" numberOfLines={2}>
                        {movie.title}
                        {movie.is_favorite ? " ♥" : ""}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {[
                          MOVIE_TYPE_LABELS[movie.type],
                          movie.year || null,
                          movie.rating != null ? `${movie.rating}` : null,
                          movie.type === "series" && totalEps
                            ? `${watchedEps ?? 0}/${totalEps} eps`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </ThemedText>
                      {movie.status !== MovieStatus.WATCHED &&
                      movie.status !== MovieStatus.ABANDONED ? (
                        <Pressable
                          disabled={busyId === movie.imdb_id}
                          onPress={() => void markWatched(movie)}
                          hitSlop={8}
                        >
                          <ThemedText type="small" style={{ color: theme.primary }}>
                            Marcar assistido
                          </ThemedText>
                        </Pressable>
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
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
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  card: {
    padding: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  copy: { flex: 1, gap: 4 },
});
