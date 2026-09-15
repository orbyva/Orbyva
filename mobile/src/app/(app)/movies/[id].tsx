import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
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
  type TmdbAirEpisode,
  type TmdbEpisode,
  type TmdbSeasonSummary,
} from "@/api/movies/catalog";
import {
  fetchEpisodesForSeries,
  markEpisodeUnwatched,
  markEpisodeWatched,
  markSeasonWatched,
} from "@/api/movies/episodes";
import { fetchAppAlerts, invalidateAppAlertsCache } from "@/api/alerts";
import { deleteMovie, fetchMovieById, updateMovie } from "@/api/movies/movies";
import { CoverThumb } from "@/components/CoverThumb";
import { ReviewSheet } from "@/components/ReviewSheet";
import { OpinionShareSheet } from "@/components/share/OpinionShareSheet";
import { StoryShareCard } from "@/components/share/StoryShareCard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { ModuleSection } from "@/components/ui/ModuleSection";
import { Spacing } from "@/constants/theme";
import {
  formatMovieRating,
  getMovieRatingLabel,
  getSeriesWatchProgress,
  MOVIE_STATUS_LABELS,
  MOVIE_TYPE_LABELS,
  movieStatusUpdate,
  resolveRatedEpisodes,
} from "@/domain/movies";
import { buildMovieShareText, usableCoverUri } from "@/domain/share";
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [nextEpisode, setNextEpisode] = useState<TmdbAirEpisode | null>(null);

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
      setNextEpisode(meta?.next_episode_to_air ?? null);
      if (meta && row.episode_count !== meta.episodeCount) {
        void updateMovie({ imdb_id: row.imdb_id, episode_count: meta.episodeCount });
      }
    } else {
      setLocalEps([]);
      setSeasons([]);
      setNextEpisode(null);
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

  async function toggleNotify() {
    if (!movie) return;
    const next = !movie.notify_new_episodes;
    setBusy(true);
    try {
      await updateMovie({
        imdb_id: movie.imdb_id,
        notify_new_episodes: next,
      });
      setMovie({ ...movie, notify_new_episodes: next });
      invalidateAppAlertsCache();
      void fetchAppAlerts();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar o aviso."));
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
            <View style={styles.titleRow}>
              <ThemedText type="smallBold" style={styles.title}>
                {movie.title}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  movie.is_favorite ? "Remover dos favoritos" : "Favoritar"
                }
                disabled={busy}
                hitSlop={8}
                onPress={() => void patch({ is_favorite: !movie.is_favorite })}
              >
                <Ionicons
                  name={movie.is_favorite ? "heart" : "heart-outline"}
                  size={22}
                  color={movie.is_favorite ? theme.danger : theme.textSecondary}
                />
              </Pressable>
            </View>
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

        {movie.status === MovieStatus.WATCHING ? (
          <View style={styles.footerActions}>
            <FormButton
              label="Terminei"
              tone="primary"
              disabled={busy}
              onPress={() => setReviewOpen(true)}
            />
            <FormButton
              label="Abandonei"
              tone="danger"
              disabled={busy}
              onPress={() => void setStatus(MovieStatus.ABANDONED)}
            />
          </View>
        ) : null}

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
        {movie.status === MovieStatus.WATCHED ? (
          <ThemedText type="small" themeColor="textSecondary">
            {movie.would_recommend === false ? "Não recomendaria" : "Recomendaria"}
          </ThemedText>
        ) : null}

        {movie.type === "series" ? (
          <View style={styles.notify}>
            <FormButton
              label={movie.notify_new_episodes ? "Avisos ligados" : "Avisar novos"}
              disabled={busy}
              onPress={() => void toggleNotify()}
            />
            {nextEpisode?.air_date ? (
              <ThemedText type="small" themeColor="textSecondary">
                Próximo: T{nextEpisode.season_number}E{nextEpisode.episode_number}
                {nextEpisode.name ? ` · ${nextEpisode.name}` : ""} ·{" "}
                {formatDateBR(nextEpisode.air_date.slice(0, 10))}
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Sino avisa quando um episódio novo sair (TMDB).
              </ThemedText>
            )}
          </View>
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
                  <FormButton
                    label="Marcar temporada"
                    compact
                    onPress={() => void watchSeason(season)}
                  />
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

        <View style={styles.footerActions}>
          {movie.status === MovieStatus.TO_WATCH ? (
            <FormButton
              label="Começar"
              tone="primary"
              disabled={busy}
              onPress={() => void setStatus(MovieStatus.WATCHING)}
            />
          ) : null}
          {movie.status === MovieStatus.ABANDONED ? (
            <FormButton
              label="Retomar"
              tone="primary"
              disabled={busy}
              onPress={() => void setStatus(MovieStatus.WATCHING)}
            />
          ) : null}
          <FormButton
            label="Editar"
            tone={movie.status === MovieStatus.WATCHED ? "primary" : "neutral"}
            onPress={() =>
              router.push({
                pathname: "/movies/form",
                params: { id: movie.imdb_id },
              })
            }
          />
          {movie.status === MovieStatus.WATCHED ? (
            <FormButton
              label="Compartilhar"
              onPress={() => setShareOpen(true)}
            />
          ) : null}
          <FormButton label="Excluir" tone="danger" onPress={onDelete} />
        </View>
      </ScrollView>
      <ReviewSheet
        visible={reviewOpen}
        title="Avaliar título"
        itemTitle={movie.title}
        confirmLabel="Marcar assistido"
        busy={busy}
        onClose={() => setReviewOpen(false)}
        onConfirm={async (result) => {
          await patch({
            ...movieStatusUpdate(movie, MovieStatus.WATCHED, getTodayIso()),
            rating: result.rating,
            would_recommend: result.recommend,
          });
          setReviewOpen(false);
        }}
      />
      {movie.status === MovieStatus.WATCHED ? (
        <OpinionShareSheet
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          title={movie.title}
          hasNotes={Boolean(movie.notes?.trim())}
          message={(includeNotes) =>
            buildMovieShareText(movie, {
              includeNotes,
              ratedEpisodes: resolveRatedEpisodes(localEps),
            })
          }
          renderCard={({ includeNotes }) => {
            const rated = resolveRatedEpisodes(localEps);
            return (
              <StoryShareCard
                coverUri={usableCoverUri(movie.poster)}
                fallbackCaption={movie.type === "series" ? "SÉRIE" : "FILME"}
                kicker={`${movie.type === "series" ? "SÉRIE" : "FILME"}  ·  ${movie.year}`}
                title={movie.title}
                score={
                  movie.rating != null && movie.rating > 0
                    ? `${formatMovieRating(movie.rating)}/10`
                    : null
                }
                scoreLabel={
                  movie.rating != null && movie.rating > 0
                    ? getMovieRatingLabel(movie.rating)
                    : null
                }
                recommend={movie.would_recommend !== false}
                notes={includeNotes ? movie.notes?.trim() : null}
                itemsLabel="EPISÓDIOS"
                items={rated.map((episode) => ({
                  index: `S${episode.season}E${episode.episode}`,
                  title: episode.title,
                  score: formatMovieRating(episode.rating),
                }))}
              />
            );
          }}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three },
  hero: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  heroCopy: { flex: 1, gap: 6, paddingTop: 4 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  title: { flex: 1 },
  footerActions: { gap: 8 },
  notify: { gap: 6 },
  season: { gap: 8, paddingVertical: 8 },
  episode: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  done: { textDecorationLine: "line-through", opacity: 0.55 },
});
