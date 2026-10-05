import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  fetchCinemaDetails,
  isCinemaCatalogAvailable,
  searchCinemaCatalog,
  type CinemaSearchHit,
} from "@/api/movies/catalog";
import {
  createMovie,
  deleteMovie,
  fetchMovieById,
  updateMovie,
} from "@/api/movies/movies";
import { CatalogSearch } from "@/components/CatalogSearch";
import { ChoiceChip } from "@/components/ChoiceChip";
import { DateField } from "@/components/DateField";
import { RecommendField } from "@/components/RecommendField";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, Field, Input } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { appendActivityDate } from "@/domain/entertainment/insights";
import {
  MOVIE_STATUS_LABELS,
  MOVIE_TYPE_LABELS,
  newManualMovieId,
} from "@/domain/movies";
import { getTodayIso } from "@/domain/timeline";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import {
  MovieStatus,
  type Movie,
  type MovieListFilter,
  type MovieMediaType,
} from "@/types/movies";

const STATUS_CHIPS = (Object.keys(MOVIE_STATUS_LABELS) as MovieListFilter[]).map(
  (id) => ({ id, label: MOVIE_STATUS_LABELS[id] })
);
const TYPE_CHIPS = (Object.keys(MOVIE_TYPE_LABELS) as MovieMediaType[]).map(
  (id) => ({ id, label: MOVIE_TYPE_LABELS[id] })
);

export default function MovieFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;
  const catalogOk = isCinemaCatalogAvailable();

  const [loading, setLoading] = useState(Boolean(editId));
  const [picking, setPicking] = useState(false);
  const [manual, setManual] = useState(!catalogOk || Boolean(editId));
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [type, setType] = useState<MovieMediaType>("movie");
  const [status, setStatus] = useState<MovieListFilter>("to_watch");
  const [rating, setRating] = useState("");
  const [notes, setNotes] = useState("");
  const [poster, setPoster] = useState<string | null>(null);
  const [plot, setPlot] = useState<string | null>(null);
  const [director, setDirector] = useState<string | null>(null);
  const [genre, setGenre] = useState<string[]>([]);
  const [actors, setActors] = useState<string[]>([]);
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [tmdbTvId, setTmdbTvId] = useState<number | null>(null);
  const [scoreImdb, setScoreImdb] = useState<number | null>(null);
  const [watchedDates, setWatchedDates] = useState<string[]>([]);
  const [activityDate, setActivityDate] = useState(getTodayIso());
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar título" : "Novo título" });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void fetchMovieById(editId)
      .then((movie) => {
        if (cancelled) return;
        if (!movie) {
          setError("Título não encontrado.");
          return;
        }
        applyMovie(movie);
      })
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
  }, [editId]);

  function applyMovie(movie: Movie) {
    setTitle(movie.title);
    setYear(movie.year ? String(movie.year) : "");
    setType(movie.type);
    setStatus(movie.status);
    setRating(movie.rating != null ? String(movie.rating) : "");
    setNotes(movie.notes ?? "");
    setPoster(movie.poster ?? null);
    setPlot(movie.plot ?? null);
    setDirector(movie.director ?? null);
    setGenre(movie.genre ?? []);
    setActors(movie.actors ?? []);
    setCatalogId(movie.imdb_id);
    setTmdbTvId(movie.tmdb_tv_id ?? null);
    setScoreImdb(movie.score_imdb ?? null);
    setWatchedDates(
      (movie.watched_dates ?? []).map((d) => String(d).slice(0, 10))
    );
    const latest = (movie.watched_dates ?? []).map((d) => String(d).slice(0, 10)).at(-1);
    setActivityDate(latest ?? getTodayIso());
    setWouldRecommend(movie.would_recommend !== false);
    setManual(true);
  }

  async function onPickHit(hit: CinemaSearchHit) {
    setPicking(true);
    setError(null);
    try {
      const details = await fetchCinemaDetails(hit);
      if (details) {
        applyMovie(details);
        return;
      }
      setTitle(hit.title);
      setYear(hit.year ? String(hit.year) : "");
      setType(hit.media_type === "tv" ? "series" : "movie");
      setPoster(hit.poster);
      setPlot(hit.overview ?? null);
      setCatalogId(
        hit.media_type === "tv" ? `tmdb_tv_${hit.tmdb_id}` : `tmdb_m_${hit.tmdb_id}`
      );
      setTmdbTvId(hit.media_type === "tv" ? hit.tmdb_id : null);
      setManual(true);
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível abrir o título do catálogo."));
    } finally {
      setPicking(false);
    }
  }


  async function onSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      fail("Informe o título.");
      return;
    }
    const parsedYear = Number.parseInt(year, 10);
    const parsedRating = Number.parseFloat(rating.replace(",", "."));
    const nextStatus = status as MovieStatus;
    const dates =
      nextStatus === MovieStatus.WATCHED
        ? appendActivityDate(watchedDates, activityDate)
        : watchedDates;
    setSaving(true);
    setError(null);
    const payload = {
      imdb_id: editId ?? catalogId ?? newManualMovieId(),
      title: trimmed,
      year: Number.isFinite(parsedYear) ? parsedYear : 0,
      poster,
      genre,
      director,
      actors,
      plot,
      type,
      rating: Number.isFinite(parsedRating) ? Math.min(10, Math.max(0, parsedRating)) : null,
      status: nextStatus,
      score_imdb: scoreImdb,
      watched_dates: dates,
      notes: notes.trim() || null,
      would_recommend: wouldRecommend,
      tmdb_tv_id: tmdbTvId,
      following: true,
      notify_new_episodes: false,
    };
    try {
      if (editId) {
        await updateMovie(payload);
      } else {
        await createMovie(payload);
      }
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar o título."));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert("Excluir título", title || "Esse título", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deleteMovie(editId);
              router.back();
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir o título."));
              setSaving(false);
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

  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Banner message={error} />
          {!editId ? (
            <>
              <CatalogSearch
                placeholder="Buscar no catálogo"
                enabled={catalogOk}
                unavailableHint="Catálogo indisponível neste aparelho. Cadastre na mão."
                search={searchCinemaCatalog}
                toView={(hit) => ({
                  key: `${hit.media_type}-${hit.tmdb_id}`,
                  title: hit.title,
                  subtitle: [hit.media_type === "tv" ? "Série" : "Filme", hit.year || null]
                    .filter(Boolean)
                    .join(" · "),
                  cover: hit.poster,
                })}
                onSelect={(hit) => void onPickHit(hit)}
              />
              {!manual ? (
                <Button
                  label="Cadastrar na mão"
                  onPress={() => setManual(true)}
                  variant="outline"
                />
              ) : null}
            </>
          ) : null}
          {picking ? <ActivityIndicator color={theme.primary} /> : null}
          {manual ? (
            <>
              <Field label="Título" required>
                <Input
                  autoFocus={!editId && !catalogId}
                  placeholder="Nome do filme ou série"
                  value={title}
                  onChangeText={setTitle}
                />
              </Field>
              <Field label="Ano">
                <Input
                  keyboardType="number-pad"
                  placeholder="2024"
                  value={year}
                  onChangeText={(value) => setYear(value.replace(/\D/g, "").slice(0, 4))}
                />
              </Field>
              <Field label="Tipo">
                <View style={styles.chips}>
                  {TYPE_CHIPS.map((chip) => (
                    <ChoiceChip
                      key={chip.id}
                      label={chip.label}
                      active={type === chip.id}
                      onPress={() => setType(chip.id)}
                    />
                  ))}
                </View>
              </Field>
              <Field label="Status">
                <View style={styles.chips}>
                  {STATUS_CHIPS.map((chip) => (
                    <ChoiceChip
                      key={chip.id}
                      label={chip.label}
                      active={status === chip.id}
                      onPress={() => setStatus(chip.id)}
                    />
                  ))}
                </View>
              </Field>
              <Field label="Nota (0–10)">
                <Input
                  keyboardType="decimal-pad"
                  placeholder="Opcional"
                  value={rating}
                  onChangeText={setRating}
                />
              </Field>
              {status === "watched" ? (
                <Field label="Data em que assistiu">
                  <DateField
                    value={activityDate}
                    onChange={setActivityDate}
                  />
                </Field>
              ) : null}
              {status === "watched" || status === "abandoned" ? (
                <RecommendField
                  value={wouldRecommend}
                  onChange={setWouldRecommend}
                />
              ) : null}
              <Field label="Notas">
                <Input
                  placeholder="Opcional"
                  style={styles.multiline}
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                />
              </Field>
              <Button
                label={editId ? "Salvar alterações" : "Adicionar"}
                disabled={saving}
                loading={saving}
                onPress={() => void onSave()}
                size="lg"
              />
          {editId ? (
            <Button
              label="Excluir título"
              disabled={saving}
              onPress={onDelete}
              variant="destructive"
            />
          ) : null}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}


const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
