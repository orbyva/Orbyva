import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchWatchedEpisodeCounts } from "@/api/movies/episodes";
import { deleteMovie, fetchAllMovies, updateMovie } from "@/api/movies/movies";
import { ChipBar } from "@/components/ChipBar";
import { ChoiceChip } from "@/components/ChoiceChip";
import { CatalogMediaCard } from "@/components/CatalogMediaCard";
import { FilterSelect } from "@/components/FilterSelect";
import { InsightsStrip } from "@/components/InsightsStrip";
import { ReviewSheet } from "@/components/ReviewSheet";
import { SearchField } from "@/components/SearchField";
import { SurpriseChip } from "@/components/SurpriseChip";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { CATALOG_SORT_OPTIONS, sortMovies } from "@/domain/entertainment/sort";
import {
  collectMovieGenres,
  filterMoviesByGenreAndRating,
  filterMoviesByType,
  getCinemaLibraryStats,
  getMovieCardRating,
  getSeriesWatchProgress,
  MOVIE_STATUS_LABELS,
  MOVIE_TYPE_LABELS,
  movieStatusUpdate,
  pickRandomToWatchMovie,
} from "@/domain/movies";
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
  const [reviewMovie, setReviewMovie] = useState<Movie | null>(null);
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

  async function markWatched(
    movie: Movie,
    extras: {
      rating: number | null;
      recommend: boolean;
      watchedDate: string;
      notes: string;
    }
  ) {
    setBusyId(movie.imdb_id);
    try {
      const statusPatch = movieStatusUpdate(
        movie,
        MovieStatus.WATCHED,
        extras.watchedDate
      );
      const notes = extras.notes.trim() || null;
      await updateMovie({
        ...statusPatch,
        rating: extras.rating,
        would_recommend: extras.recommend,
        notes,
      });
      setMovies((cur) =>
        cur.map((row) =>
          row.imdb_id === movie.imdb_id
            ? {
                ...row,
                ...statusPatch,
                rating: extras.rating,
                would_recommend: extras.recommend,
                notes,
              }
            : row
        )
      );
      setReviewMovie(null);
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar o status."));
    } finally {
      setBusyId(null);
    }
  }

  function openMovie(id: string) {
    router.push({ pathname: "/movies/[id]", params: { id } });
  }

  function confirmDelete(movie: Movie) {
    Alert.alert("Excluir título", movie.title, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void deleteMovie(movie.imdb_id)
            .then(() =>
              setMovies((cur) =>
                cur.filter((row) => row.imdb_id !== movie.imdb_id)
              )
            )
            .catch((err) =>
              fail(getErrorMessage(err, "Não foi possível excluir."))
            );
        },
      },
    ]);
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
          <View style={styles.filters}>
            <FilterSelect
              label="Tipo"
              value={typeFilter}
              options={TYPE_CHIPS}
              onChange={(id) => setTypeFilter(id as MovieTypeFilter)}
            />
            {genres.length > 0 ? (
              <FilterSelect
                label="Gênero"
                value={genre}
                options={[
                  { id: "all", label: "Todos os gêneros" },
                  ...genres.map((id) => ({ id, label: id })),
                ]}
                onChange={setGenre}
              />
            ) : null}
            {status === "watched" ? (
              <FilterSelect
                label="Nota"
                value={ratingFloor}
                options={RATING_CHIPS}
                onChange={(id) => setRatingFloor(id as MovieRatingFloor)}
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
            <ChoiceChip
              label={favoritesOnly ? "♥ Favoritos" : "Favoritos"}
              active={favoritesOnly}
              onPress={() => setFavoritesOnly((cur) => !cur)}
            />
            <SurpriseChip onPress={surprise} />
          </View>
          {visible.length === 0 ? (
            <ThemedText themeColor="mutedForeground">
              Nenhum título neste filtro.
            </ThemedText>
          ) : (
            visible.map((movie) => {
              const watchedEps = episodeCounts[movie.imdb_id];
              const totalEps = movie.episode_count;
              const rating = getMovieCardRating(movie);
              const seriesProgress =
                movie.type === "series" && totalEps
                  ? getSeriesWatchProgress({
                      watched: watchedEps ?? 0,
                      total: totalEps,
                    })
                  : null;
              const showWatchProgress =
                movie.status === MovieStatus.WATCHING && seriesProgress != null;
              const progressLabel = showWatchProgress
                ? `${seriesProgress.watched}/${seriesProgress.total} eps · ${seriesProgress.percent}%`
                : null;
              return (
                <CatalogMediaCard
                  key={movie.imdb_id}
                  coverUri={movie.poster}
                  fallback={movie.title}
                  title={movie.title}
                  favorite={movie.is_favorite === true}
                  rating={rating?.value}
                  progress={showWatchProgress ? seriesProgress.percent : null}
                  progressLabel={progressLabel}
                  meta={[
                    MOVIE_TYPE_LABELS[movie.type],
                    movie.year || null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  actionLabel={
                    movie.status !== MovieStatus.WATCHED &&
                    movie.status !== MovieStatus.ABANDONED
                      ? "Marcar como Assistido"
                      : null
                  }
                  onAction={
                    busyId === movie.imdb_id
                      ? undefined
                      : () => setReviewMovie(movie)
                  }
                  onDelete={() => confirmDelete(movie)}
                  onPress={() => openMovie(movie.imdb_id)}
                />
              );
            })
          )}
        </ScrollView>
      )}
      <ReviewSheet
        visible={reviewMovie != null}
        title="Avaliar título"
        itemTitle={reviewMovie?.title ?? ""}
        itemSubtitle={
          reviewMovie
            ? [MOVIE_TYPE_LABELS[reviewMovie.type], reviewMovie.year || null]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        coverUri={reviewMovie?.poster}
        confirmLabel="Salvar"
        dateLabel="Data assistida"
        notesLabel="O que achou?"
        notesPlaceholder="Final, atuação, vibe, spoilers livres..."
        busy={reviewMovie != null && busyId === reviewMovie.imdb_id}
        onClose={() => setReviewMovie(null)}
        onConfirm={(result) => {
          if (!reviewMovie) return;
          return markWatched(reviewMovie, result);
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
});
