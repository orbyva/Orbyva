import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreRating } from "@/components/ScoreRating";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { formatDateBR } from "@/lib/currency";
import { invalidateAppAlertsCache } from "@/api/alerts";
import { updateMovie } from "@/api/movies";
import {
  fetchEpisodesForSeries,
  markEpisodeUnwatched,
  markEpisodeWatched,
  markSeasonUnwatched,
  markSeasonWatched,
  upsertEpisode,
} from "@/api/movieEpisodes";
import {
  requestBrowserNotifyPermission,
  setBrowserNotifyEnabled,
} from "@/lib/browserNotify";
import {
  fetchTvMetaTmdb,
  fetchTvSeasonEpisodesTmdb,
  isTmdbConfigured,
  parseTmdbTvId,
  type TmdbEpisode,
  type TmdbSeasonSummary,
  type TmdbTvMeta,
} from "@/lib/tmdb";
import type { Movie, MovieEpisode } from "@/types/movies";
import { MovieStatus } from "@/types/movies";
import { cn } from "@/lib/utils";
import {
  getSeriesWatchProgress,
  sumSeasonEpisodeCounts,
} from "@/domain/movies";

type SeriesEpisodesPanelProps = {
  movie: Movie;
  onMoviePatch?: (patch: Partial<Movie>) => void;
  /** Contagem de episódios assistidos — para atualizar o card sem F5. */
  onWatchedEpisodesChange?: (count: number) => void;
};

function epKey(season: number, episode: number) {
  return `${season}-${episode}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Episódios já exibidos / disponíveis (não futuros). */
function airedEpisodes(episodes: TmdbEpisode[]): TmdbEpisode[] {
  const today = todayIso();
  return episodes.filter((ep) => {
    if (!ep.air_date) return true;
    return ep.air_date.slice(0, 10) <= today;
  });
}

export function SeriesEpisodesPanel({
  movie,
  onMoviePatch,
  onWatchedEpisodesChange,
}: SeriesEpisodesPanelProps) {
  const { toast } = useToast();
  const tmdbId = parseTmdbTvId(movie.imdb_id, movie.tmdb_tv_id);
  const [meta, setMeta] = useState<TmdbTvMeta | null>(null);
  const [progress, setProgress] = useState<MovieEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<TmdbEpisode[]>([]);
  const [loadingSeason, setLoadingSeason] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draftRating, setDraftRating] = useState<number | null>(null);
  const [draftNotes, setDraftNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [notify, setNotify] = useState(Boolean(movie.notify_new_episodes));

  const onMoviePatchRef = useRef(onMoviePatch);
  onMoviePatchRef.current = onMoviePatch;
  const onWatchedEpisodesChangeRef = useRef(onWatchedEpisodesChange);
  onWatchedEpisodesChangeRef.current = onWatchedEpisodesChange;
  const movieStatusRef = useRef(movie.status);
  const episodeCountRef = useRef(movie.episode_count);
  episodeCountRef.current = movie.episode_count;
  const tmdbTvIdRef = useRef(movie.tmdb_tv_id);
  tmdbTvIdRef.current = movie.tmdb_tv_id;

  // Só sincroniza status vindo de fora (ex.: modal Editar) — nunca no meio de um toggle.
  useEffect(() => {
    movieStatusRef.current = movie.status;
  }, [movie.status, movie.imdb_id]);

  const applyProgress = useCallback((rows: MovieEpisode[]) => {
    setProgress(rows);
    const count = rows.filter((p) => p.status === "watched").length;
    onWatchedEpisodesChangeRef.current?.(count);
  }, []);

  const progressMap = useMemo(() => {
    const map = new Map<string, MovieEpisode>();
    for (const row of progress) {
      map.set(epKey(row.season_number, row.episode_number), row);
    }
    return map;
  }, [progress]);

  const watchedCount = useMemo(
    () => progress.filter((p) => p.status === "watched").length,
    [progress]
  );

  const seasonAired = useMemo(() => airedEpisodes(episodes), [episodes]);

  const seasonAllWatched = useMemo(() => {
    if (seasonAired.length === 0) return false;
    return seasonAired.every(
      (ep) =>
        progressMap.get(epKey(ep.season_number, ep.episode_number))
          ?.status === "watched"
    );
  }, [seasonAired, progressMap]);

  const loadBase = useCallback(async () => {
    if (!tmdbId || !isTmdbConfigured()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tvMeta, rows] = await Promise.all([
        fetchTvMetaTmdb(tmdbId),
        fetchEpisodesForSeries(movie.imdb_id),
      ]);
      setMeta(tvMeta);
      applyProgress(rows);
      if (tvMeta?.seasons.length) {
        setSeason((prev) => prev ?? tvMeta.seasons[0].season_number);
        const total = sumSeasonEpisodeCounts(tvMeta.seasons);
        if (total > 0 && episodeCountRef.current !== total) {
          await updateMovie({ imdb_id: movie.imdb_id, episode_count: total });
          episodeCountRef.current = total;
          onMoviePatchRef.current?.({ episode_count: total });
        }
      }
      if (!tmdbTvIdRef.current && tmdbId) {
        await updateMovie({ imdb_id: movie.imdb_id, tmdb_tv_id: tmdbId });
        tmdbTvIdRef.current = tmdbId;
        onMoviePatchRef.current?.({ tmdb_tv_id: tmdbId });
      }
    } catch (error) {
      toast({
        title: "Episódios",
        description: getErrorMessage(error, "Não foi possível carregar a série."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [tmdbId, movie.imdb_id, applyProgress, toast]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!tmdbId || season == null) return;
    let cancelled = false;
    setLoadingSeason(true);
    void fetchTvSeasonEpisodesTmdb(tmdbId, season)
      .then((eps) => {
        if (!cancelled) setEpisodes(eps);
      })
      .finally(() => {
        if (!cancelled) setLoadingSeason(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tmdbId, season]);

  function openEpisode(ep: TmdbEpisode) {
    const key = epKey(ep.season_number, ep.episode_number);
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    const saved = progressMap.get(key);
    setDraftRating(saved?.rating ?? null);
    setDraftNotes(saved?.notes ?? "");
    setExpanded(key);
  }

  /** Espelha o progresso: ≥1 episódio → Assistindo; zero → Para assistir. */
  async function syncStatusFromProgress(rows: MovieEpisode[]) {
    const watched = rows.filter((p) => p.status === "watched").length;
    const status = movieStatusRef.current;

    let next: MovieStatus | null = null;
    if (
      watched > 0 &&
      (status === MovieStatus.TO_WATCH || status === "to_watch")
    ) {
      next = MovieStatus.WATCHING;
    } else if (
      watched === 0 &&
      (status === MovieStatus.WATCHING || status === "watching")
    ) {
      next = MovieStatus.TO_WATCH;
    }

    if (!next || next === status) return;

    // Atualiza ref antes do await para não perder o estado no meio do toggle.
    movieStatusRef.current = next;
    await updateMovie({
      imdb_id: movie.imdb_id,
      status: next,
    });
    onMoviePatchRef.current?.({ status: next });
  }

  async function reloadProgress() {
    const rows = await fetchEpisodesForSeries(movie.imdb_id);
    applyProgress(rows);
    return rows;
  }

  async function toggleWatched(ep: TmdbEpisode) {
    const key = epKey(ep.season_number, ep.episode_number);
    const saved = progressMap.get(key);
    setSaving(true);
    try {
      if (saved?.status === "watched") {
        await markEpisodeUnwatched({
          imdbId: movie.imdb_id,
          season: ep.season_number,
          episode: ep.episode_number,
        });
      } else {
        await markEpisodeWatched({
          imdbId: movie.imdb_id,
          season: ep.season_number,
          episode: ep.episode_number,
          tmdbEpisodeId: ep.id,
          episodeName: ep.name,
          airDate: ep.air_date,
          rating: draftRating,
          notes: draftNotes,
        });
      }
      const rows = await reloadProgress();
      await syncStatusFromProgress(rows);
      invalidateAppAlertsCache();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao atualizar episódio."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleSeasonWatched() {
    if (season == null || seasonAired.length === 0) return;
    setSaving(true);
    try {
      if (seasonAllWatched) {
        await markSeasonUnwatched({
          imdbId: movie.imdb_id,
          episodes: seasonAired.map((ep) => ({
            season: ep.season_number,
            episode: ep.episode_number,
          })),
        });
        toast({
          title: "Temporada",
          description: `T${season} desmarcada.`,
        });
      } else {
        await markSeasonWatched({
          imdbId: movie.imdb_id,
          episodes: seasonAired.map((ep) => ({
            season: ep.season_number,
            episode: ep.episode_number,
            tmdbEpisodeId: ep.id,
            episodeName: ep.name,
            airDate: ep.air_date,
          })),
        });
        toast({
          title: "Temporada",
          description: `T${season}: ${seasonAired.length} episódio${seasonAired.length === 1 ? "" : "s"} marcado${seasonAired.length === 1 ? "" : "s"} como assistido${seasonAired.length === 1 ? "" : "s"}.`,
        });
      }
      const rows = await reloadProgress();
      await syncStatusFromProgress(rows);
      invalidateAppAlertsCache();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao atualizar a temporada."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveOpinion(ep: TmdbEpisode) {
    setSaving(true);
    try {
      const key = epKey(ep.season_number, ep.episode_number);
      const saved = progressMap.get(key);
      await upsertEpisode({
        imdb_id: movie.imdb_id,
        season_number: ep.season_number,
        episode_number: ep.episode_number,
        tmdb_episode_id: ep.id,
        episode_name: ep.name,
        air_date: ep.air_date,
        status: saved?.status === "watched" ? "watched" : "watched",
        watched_at:
          saved?.watched_at ?? new Date().toISOString().slice(0, 10),
        rating: draftRating,
        notes: draftNotes.trim() || null,
      });
      const rows = await reloadProgress();
      await syncStatusFromProgress(rows);
      toast({ title: "Salvo", description: "Nota do episódio atualizada." });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao salvar."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleNotify() {
    const next = !notify;
    setNotify(next);
    try {
      await updateMovie({
        imdb_id: movie.imdb_id,
        notify_new_episodes: next,
      });
      onMoviePatchRef.current?.({ notify_new_episodes: next });
      invalidateAppAlertsCache();
      if (next) {
        const permission = await requestBrowserNotifyPermission();
        if (permission === "granted") setBrowserNotifyEnabled(true);
      }
    } catch (error) {
      setNotify(!next);
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar o aviso."),
        variant: "destructive",
      });
    }
  }

  if (!isTmdbConfigured()) {
    return (
      <p className="text-sm text-muted-foreground">
        Configure VITE_TMDB_API_KEY para rastrear episódios.
      </p>
    );
  }

  if (!tmdbId) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta série não tem vínculo TMDB. Adicione de novo pela busca para
        liberar episódios.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando temporadas…
      </div>
    );
  }

  const seasons: TmdbSeasonSummary[] = meta?.seasons ?? [];
  const next = meta?.next_episode_to_air;
  const episodeTotal = sumSeasonEpisodeCounts(seasons);
  const watchProgress = getSeriesWatchProgress({
    watched: watchedCount,
    total: episodeTotal,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Episódios</p>
          <p className="text-sm">
            {watchedCount} assistido{watchedCount === 1 ? "" : "s"}
            {meta ? ` · ${meta.number_of_seasons} temp.` : ""}
          </p>
          {watchProgress && (
            <div className="mt-2 h-1 max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${watchProgress.percent}%` }}
              />
            </div>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant={notify ? "default" : "outline"}
          className="gap-1.5"
          onClick={() => void toggleNotify()}
        >
          {notify ? (
            <Bell className="h-3.5 w-3.5" />
          ) : (
            <BellOff className="h-3.5 w-3.5" />
          )}
          {notify ? "Avisos ligados" : "Avisar novos"}
        </Button>
      </div>

      {next?.air_date && (
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
          Próximo: T{next.season_number}E{next.episode_number}
          {next.name ? ` · ${next.name}` : ""} ·{" "}
          {formatDateBR(next.air_date.slice(0, 10))}
        </p>
      )}

      {seasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {seasons.map((s) => (
            <Button
              key={s.season_number}
              type="button"
              size="sm"
              variant={season === s.season_number ? "default" : "outline"}
              className="h-8 px-2.5 text-xs"
              onClick={() => setSeason(s.season_number)}
            >
              T{s.season_number}
            </Button>
          ))}
        </div>
      )}

      {season != null && !loadingSeason && seasonAired.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={saving}
          onClick={() => void toggleSeasonWatched()}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          {seasonAllWatched
            ? `Desmarcar T${season}`
            : `Marcar T${season} como assistida`}
        </Button>
      )}

      {loadingSeason ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando episódios…
        </div>
      ) : (
        <ul className="space-y-1.5">
          {episodes.map((ep) => {
            const key = epKey(ep.season_number, ep.episode_number);
            const saved = progressMap.get(key);
            const watched = saved?.status === "watched";
            const isOpen = expanded === key;
            return (
              <li
                key={key}
                className={cn(
                  "rounded-lg border",
                  watched && "border-sky-500/30 bg-sky-500/5"
                )}
              >
                <div className="flex items-start gap-2 p-2.5">
                  <Button
                    type="button"
                    size="icon"
                    variant={watched ? "default" : "outline"}
                    className="mt-0.5 h-8 w-8 shrink-0"
                    disabled={saving}
                    onClick={() => void toggleWatched(ep)}
                    aria-label={
                      watched ? "Marcar como não assistido" : "Marcar assistido"
                    }
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => openEpisode(ep)}
                  >
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        E{ep.episode_number}
                      </Badge>
                      <span className="truncate text-sm font-medium">
                        {ep.name}
                      </span>
                      {isOpen ? (
                        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {ep.air_date
                        ? formatDateBR(ep.air_date.slice(0, 10))
                        : "Sem data"}
                      {saved?.rating != null
                        ? ` · nota ${saved.rating}`
                        : ""}
                    </p>
                  </button>
                </div>
                {isOpen && (
                  <div className="space-y-3 border-t px-3 py-3">
                    {ep.overview && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {ep.overview}
                      </p>
                    )}
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Sua nota
                      </p>
                      <ScoreRating
                        value={draftRating}
                        onChange={setDraftRating}
                        size="sm"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Comentário
                      </p>
                      <textarea
                        className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="O que achou deste episódio?"
                        value={draftNotes}
                        onChange={(e) => setDraftNotes(e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={saving}
                      onClick={() => void saveOpinion(ep)}
                    >
                      Salvar nota do episódio
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
