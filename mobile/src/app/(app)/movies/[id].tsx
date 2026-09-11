import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  fetchTvMetaTmdb,
  fetchTvSeasonEpisodesTmdb,
  isCinemaCatalogAvailable,
  parseTmdbTvId,
  type TmdbEpisode,
  type TmdbSeasonSummary,
} from "@/api/movies/catalog";
import {
  fetchEpisodesForSeries,
  markEpisodeUnwatched,
  markEpisodeWatched,
  markSeasonWatched,
} from "@/api/movies/episodes";
import { deleteMovie, fetchMovieById, updateMovie } from "@/api/movies/movies";
import { CoverThumb } from "@/components/CoverThumb";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { ModuleSection } from "@/components/ui/ModuleSection";
import { Spacing } from "@/constants/theme";
import {
  getSeriesWatchProgress,
  MOVIE_STATUS_LABELS,
  MOVIE_TYPE_LABELS,
  movieStatusUpdate,
} from "@/domain/movies";
import { getTodayIso } from "@/domain/timeline";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { MovieStatus, type Movie, type MovieEpisode } from "@/types/movies";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function airedEpisodes(episodes: TmdbEpisode[]): TmdbEpisode[] {
  const today = todayIso();
  return episodes.filter((episode) => {
    if (!episode.air_date) return true;
    return episode.air_date.slice(0, 10) <= today;
  });
}

export default function MovieDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const { bottomInset } = useAppShell();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const [movie, setMovie] = useState<Movie | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [seasons, setSeasons] = useState<TmdbSeasonSummary[]>([]);
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [seasonEps, setSeasonEps] = useState<TmdbEpisode[]>([]);
  const [localEps, setLocalEps] = useState<MovieEpisode[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(false);

  const load = useCallback(async () => {
    const row = await fetchMovieById(id);
    setMovie(row);
    navigation.setOptions({ title: row?.title ?? "Título" });
    if (!row) {
      setError("Título não encontrado.");
      return;
    }
    if (row.type === "series") {
      const tmdbId = parseTmdbTvId(row.imdb_id, row.tmdb_tv_id);
      const [eps, meta] = await Promise.all([
        fetchEpisodesForSeries(row.imdb_id).catch(() => []),
        tmdbId && isCinemaCatalogAvailable()
          ? fetchTvMetaTmdb(tmdbId)
          : Promise.resolve(null),
      ]);
      setLocalEps(eps);
      setSeasons(meta?.seasons ?? []);
      if (meta && row.episode_count !== meta.episodeCount) {
        void updateMovie({ imdb_id: row.imdb_id, episode_count: meta.episodeCount });
      }
    }
  }, [id, navigation]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível abrir o título."));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const watchedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const episode of localEps) {
      if (episode.status === "watched") {
        set.add(`${episode.season_number}-${episode.episode_number}`);
      }
    }
    return set;
  }, [localEps]);

  const progress = useMemo(() => {
    if (!movie || movie.type !== "series") return null;
    return getSeriesWatchProgress({
      watched: localEps.filter((episode) => episode.status === "watched").length,
      total: movie.episode_count ?? seasons.reduce((sum, s) => sum + s.episode_count, 0),
    });
  }, [localEps, movie, seasons]);

  async function patch(next: Partial<Movie>) {
    if (!movie) return;
    setBusy(true);
    try {
      await updateMovie({ imdb_id: movie.imdb_id, ...next });
      setMovie({ ...movie, ...next });
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: MovieStatus) {
    if (!movie) return;
    await patch(movieStatusUpdate(movie, status, getTodayIso()));
  }

  async function toggleSeason(season: number) {
    if (!movie) return;
    if (openSeason === season) {
      setOpenSeason(null);
      return;
    }
    setOpenSeason(season);
    const tmdbId = parseTmdbTvId(movie.imdb_id, movie.tmdb_tv_id);
    if (!tmdbId) return;
    setSeasonLoading(true);
    try {
      setSeasonEps(await fetchTvSeasonEpisodesTmdb(tmdbId, season));
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível carregar a temporada."));
    } finally {
      setSeasonLoading(false);
    }
  }

  async function toggleEpisode(episode: TmdbEpisode) {
    if (!movie) return;
    const key = `${episode.season_number}-${episode.episode_number}`;
    const watched = watchedKeys.has(key);
    try {
      if (watched) {
        await markEpisodeUnwatched({
          imdbId: movie.imdb_id,
          season: episode.season_number,
          episode: episode.episode_number,
        });
      } else {
        await markEpisodeWatched({
          imdbId: movie.imdb_id,
          season: episode.season_number,
          episode: episode.episode_number,
          tmdbEpisodeId: episode.id,
          episodeName: episode.name,
          airDate: episode.air_date,
        });
      }
      setLocalEps(await fetchEpisodesForSeries(movie.imdb_id));
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar o episódio."));
    }
  }

  async function watchSeason(season: TmdbSeasonSummary) {
    if (!movie) return;
    const tmdbId = parseTmdbTvId(movie.imdb_id, movie.tmdb_tv_id);
    if (!tmdbId) return;
    try {
      const episodes = airedEpisodes(
        await fetchTvSeasonEpisodesTmdb(tmdbId, season.season_number)
      );
      await markSeasonWatched({
        imdbId: movie.imdb_id,
        episodes: episodes.map((episode) => ({
          season: episode.season_number,
          episode: episode.episode_number,
          tmdbEpisodeId: episode.id,
          episodeName: episode.name,
          airDate: episode.air_date,
        })),
      });
      setLocalEps(await fetchEpisodesForSeries(movie.imdb_id));
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível marcar a temporada."));
    }
  }

  function onDelete() {
    if (!movie) return;
    Alert.alert("Excluir título", movie.title, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteMovie(movie.imdb_id);
              router.back();
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir."));
            }
          })();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  if (!movie) {
    return (
      <ThemedView style={styles.body}>
        <Banner message={error} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 24 }]}
      >
        <Banner message={error} />
        <View style={styles.hero}>
          <CoverThumb uri={movie.poster} fallback={movie.title} variant="hero" />
          <View style={styles.heroCopy}>
            <ThemedText type="smallBold">{movie.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[
                MOVIE_TYPE_LABELS[movie.type],
                movie.year || null,
                MOVIE_STATUS_LABELS[movie.status],
                movie.rating != null ? `Nota ${movie.rating}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </ThemedText>
            {progress ? (
              <ThemedText type="small" themeColor="textSecondary">
                {progress.watched}/{progress.total} episódios · {progress.percent}%
              </ThemedText>
            ) : null}
          </View>
        </View>

        <View style={styles.actions}>
          {movie.status === MovieStatus.TO_WATCH ? (
            <Pressable disabled={busy} onPress={() => void setStatus(MovieStatus.WATCHING)}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Começar a assistir
              </ThemedText>
            </Pressable>
          ) : null}
          {movie.status !== MovieStatus.WATCHED ? (
            <Pressable disabled={busy} onPress={() => void setStatus(MovieStatus.WATCHED)}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Marcar assistido
              </ThemedText>
            </Pressable>
          ) : null}
          {movie.status !== MovieStatus.ABANDONED ? (
            <Pressable disabled={busy} onPress={() => void setStatus(MovieStatus.ABANDONED)}>
              <ThemedText type="small" themeColor="textSecondary">
                Abandonar
              </ThemedText>
            </Pressable>
          ) : (
            <Pressable disabled={busy} onPress={() => void setStatus(MovieStatus.WATCHING)}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Retomar
              </ThemedText>
            </Pressable>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            disabled={busy}
            onPress={() => void patch({ is_favorite: !movie.is_favorite })}
          >
            <ThemedText type="smallBold">
              {movie.is_favorite ? "♥ Favorito" : "Marcar favorito"}
            </ThemedText>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => void patch({ would_recommend: movie.would_recommend === false })}
          >
            <ThemedText type="small" themeColor="textSecondary">
              {movie.would_recommend === false ? "Não recomendaria" : "Recomendaria"}
            </ThemedText>
          </Pressable>
        </View>

        {movie.plot ? (
          <ThemedText type="small" themeColor="textSecondary">
            {movie.plot}
          </ThemedText>
        ) : null}
        {movie.director ? (
          <ThemedText type="small">Direção · {movie.director}</ThemedText>
        ) : null}
        {movie.actors.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {movie.actors.join(", ")}
          </ThemedText>
        ) : null}
        {movie.notes ? (
          <ThemedText type="small">{movie.notes}</ThemedText>
        ) : null}

        {movie.type === "series" && seasons.length > 0 ? (
          <ModuleSection title="Episódios" icon="tv-outline" tint="#D46BE8">
            {seasons.map((season) => {
              const open = openSeason === season.season_number;
              return (
                <View key={season.season_number} style={styles.season}>
                  <Pressable onPress={() => void toggleSeason(season.season_number)}>
                    <ThemedText type="smallBold">{season.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {season.episode_count} episódios
                    </ThemedText>
                  </Pressable>
                  <Pressable onPress={() => void watchSeason(season)} hitSlop={8}>
                    <ThemedText type="small" style={{ color: theme.primary }}>
                      Marcar temporada
                    </ThemedText>
                  </Pressable>
                  {open ? (
                    seasonLoading ? (
                      <ActivityIndicator color={theme.primary} />
                    ) : (
                      airedEpisodes(seasonEps).map((episode) => {
                        const watched = watchedKeys.has(
                          `${episode.season_number}-${episode.episode_number}`
                        );
                        return (
                          <Pressable
                            key={`${episode.season_number}-${episode.episode_number}`}
                            onPress={() => void toggleEpisode(episode)}
                            style={styles.episode}
                          >
                            <ThemedText
                              type="small"
                              style={watched ? styles.done : undefined}
                            >
                              {episode.episode_number}. {episode.name}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {watched
                                ? "Assistido"
                                : episode.air_date
                                  ? formatDateBR(episode.air_date)
                                  : "Marcar"}
                            </ThemedText>
                          </Pressable>
                        );
                      })
                    )
                  ) : null}
                </View>
              );
            })}
          </ModuleSection>
        ) : null}

        <Pressable
          onPress={() =>
            router.push({ pathname: "/movies/form", params: { id: movie.imdb_id } })
          }
        >
          <ThemedText type="small" style={{ color: theme.primary }}>
            Editar
          </ThemedText>
        </Pressable>
        <Pressable onPress={onDelete}>
          <ThemedText themeColor="danger">Excluir título</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three },
  hero: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  heroCopy: { flex: 1, gap: 6, paddingTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  season: { gap: 8, paddingVertical: 8 },
  episode: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  done: { textDecorationLine: "line-through", opacity: 0.55 },
});
