import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { searchAlbumCatalog, type AlbumSearchHit } from "@/api/music/catalog";
import {
  createAlbum,
  deleteAlbum,
  fetchAlbumById,
  updateAlbum,
} from "@/api/music/albums";
import { CatalogSearch } from "@/components/CatalogSearch";
import { DateField } from "@/components/DateField";
import { RecommendField } from "@/components/RecommendField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { Spacing } from "@/constants/theme";
import { appendActivityDate } from "@/domain/entertainment/insights";
import {
  ALBUM_STATUS_LABELS,
  ALBUM_TYPE_LABELS,
  formatArtists,
  newManualAlbumId,
} from "@/domain/music";
import { getTodayIso } from "@/domain/timeline";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Album, AlbumSource, AlbumStatus, AlbumType } from "@/types/music";

const STATUS_CHIPS = (Object.keys(ALBUM_STATUS_LABELS) as AlbumStatus[]).map(
  (id) => ({ id, label: ALBUM_STATUS_LABELS[id] })
);
const TYPE_CHIPS = (Object.keys(ALBUM_TYPE_LABELS) as AlbumType[]).map(
  (id) => ({ id, label: ALBUM_TYPE_LABELS[id] })
);

export default function AlbumFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [loading, setLoading] = useState(Boolean(editId));
  const [manual, setManual] = useState(Boolean(editId));
  const [title, setTitle] = useState("");
  const [artists, setArtists] = useState("");
  const [year, setYear] = useState("");
  const [albumType, setAlbumType] = useState<AlbumType>("album");
  const [status, setStatus] = useState<AlbumStatus>("to_listen");
  const [rating, setRating] = useState("");
  const [notes, setNotes] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [source, setSource] = useState<AlbumSource>("manual");
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [listenedDates, setListenedDates] = useState<string[]>([]);
  const [activityDate, setActivityDate] = useState(getTodayIso());
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar álbum" : "Novo álbum" });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void fetchAlbumById(editId)
      .then((album) => {
        if (cancelled) return;
        if (!album) {
          setError("Álbum não encontrado.");
          return;
        }
        applyAlbum(album);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir o álbum."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);

  function applyAlbum(album: Album) {
    setTitle(album.title);
    setArtists(album.artists.join(", "));
    setYear(album.release_year ? String(album.release_year) : "");
    setAlbumType(album.album_type);
    setStatus(album.status);
    setRating(album.rating != null ? String(album.rating) : "");
    setNotes(album.notes ?? "");
    setCover(album.cover_url ?? null);
    setSource(album.source);
    setCatalogId(album.musicbrainz_id);
    setListenedDates(
      (album.listened_dates ?? []).map((d) => String(d).slice(0, 10))
    );
    setActivityDate(
      (album.listened_dates ?? []).map((d) => String(d).slice(0, 10)).at(-1) ??
        getTodayIso()
    );
    setWouldRecommend(album.would_recommend !== false);
    setManual(true);
  }

  function onPickHit(hit: AlbumSearchHit) {
    setTitle(hit.title);
    setArtists(hit.artists.join(", "));
    setYear(hit.release_year ? String(hit.release_year) : "");
    setAlbumType(hit.album_type);
    setCover(hit.cover_url);
    setSource("spotify");
    setCatalogId(hit.musicbrainz_id);
    setManual(true);
  }

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

  async function onSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      fail("Informe o título.");
      return;
    }
    const parsedYear = Number.parseInt(year, 10);
    const parsedRating = Number.parseFloat(rating.replace(",", "."));
    const dates =
      status === "listened"
        ? appendActivityDate(listenedDates, activityDate)
        : listenedDates;
    setSaving(true);
    setError(null);
    const payload = {
      musicbrainz_id: editId ?? catalogId ?? newManualAlbumId(),
      title: trimmed,
      artists: artists
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      release_year: Number.isFinite(parsedYear) ? parsedYear : null,
      album_type: albumType,
      cover_url: cover,
      source: catalogId && !catalogId.startsWith("manual_") ? source : "manual",
      status,
      rating: Number.isFinite(parsedRating)
        ? Math.min(10, Math.max(0, parsedRating))
        : null,
      notes: notes.trim() || null,
      would_recommend: wouldRecommend,
      listened_dates: dates,
    };
    try {
      if (editId) {
        await updateAlbum(payload);
      } else {
        await createAlbum(payload);
      }
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar o álbum."));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert("Excluir álbum", title || "Esse álbum", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deleteAlbum(editId);
              router.back();
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir o álbum."));
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
                enabled
                unavailableHint="Catálogo indisponível. Cadastre na mão."
                search={searchAlbumCatalog}
                toView={(hit) => ({
                  key: hit.musicbrainz_id,
                  title: hit.title,
                  subtitle: [
                    formatArtists(hit.artists),
                    ALBUM_TYPE_LABELS[hit.album_type],
                    hit.release_year,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  cover: hit.cover_url,
                  square: true,
                })}
                onSelect={onPickHit}
              />
              {!manual ? (
                <FormButton
                  label="Cadastrar na mão"
                  onPress={() => setManual(true)}
                />
              ) : null}
            </>
          ) : null}
          {manual ? (
            <>
              <Field label="Título" required>
                <TextInput
                  autoFocus={!editId && !catalogId}
                  placeholder="Nome do álbum"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={title}
                  onChangeText={setTitle}
                />
              </Field>
              <Field label="Artistas">
                <TextInput
                  placeholder="Separados por vírgula"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={artists}
                  onChangeText={setArtists}
                />
              </Field>
              <Field label="Ano">
                <TextInput
                  keyboardType="number-pad"
                  placeholder="2024"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={year}
                  onChangeText={(value) => setYear(value.replace(/\D/g, "").slice(0, 4))}
                />
              </Field>
              <Field label="Tipo">
                <View style={styles.chips}>
                  {TYPE_CHIPS.map((chip) => (
                    <Pressable
                      key={chip.id}
                      onPress={() => setAlbumType(chip.id)}
                      style={[
                        styles.chip,
                        { backgroundColor: theme.backgroundElement },
                        albumType === chip.id && {
                          backgroundColor: theme.backgroundSelected,
                        },
                      ]}
                    >
                      <ThemedText type="smallBold">{chip.label}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </Field>
              <Field label="Status">
                <View style={styles.chips}>
                  {STATUS_CHIPS.map((chip) => (
                    <Pressable
                      key={chip.id}
                      onPress={() => setStatus(chip.id)}
                      style={[
                        styles.chip,
                        { backgroundColor: theme.backgroundElement },
                        status === chip.id && {
                          backgroundColor: theme.backgroundSelected,
                        },
                      ]}
                    >
                      <ThemedText type="smallBold">{chip.label}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </Field>
              <Field label="Nota (0–10)">
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Opcional"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={rating}
                  onChangeText={setRating}
                />
              </Field>
              {status === "listened" ? (
                <Field label="Data em que ouviu">
                  <DateField
                    value={activityDate}
                    onChange={setActivityDate}
                    style={inputStyle}
                  />
                </Field>
              ) : null}
              {status === "listened" ? (
                <RecommendField
                  value={wouldRecommend}
                  onChange={setWouldRecommend}
                />
              ) : null}
              <Field label="Notas">
                <TextInput
                  placeholder="Opcional"
                  placeholderTextColor={theme.textSecondary}
                  style={[inputStyle, styles.multiline]}
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                />
              </Field>
              <FormButton
                label={editId ? "Salvar alterações" : "Adicionar"}
                tone="primary"
                disabled={saving}
                busy={saving}
                onPress={() => void onSave()}
              />
          {editId ? (
            <FormButton
              label="Excluir álbum"
              tone="danger"
              disabled={saving}
              onPress={onDelete}
            />
          ) : null}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
        {required ? " *" : ""}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  field: { gap: 8 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: "center",
    fontSize: 16,
  },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
});
