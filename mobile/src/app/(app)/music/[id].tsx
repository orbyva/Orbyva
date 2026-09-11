import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchAlbumById, updateAlbum } from "@/api/music/albums";
import { fetchAlbumTracks, type AlbumTrack } from "@/api/music/catalog";
import { CoverThumb } from "@/components/CoverThumb";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { ModuleSection } from "@/components/ui/ModuleSection";
import { Spacing } from "@/constants/theme";
import {
  ALBUM_STATUS_LABELS,
  ALBUM_TYPE_LABELS,
  albumStatusUpdate,
  formatArtists,
  formatTrackLength,
  trackRatingKey,
} from "@/domain/music";
import { getTodayIso } from "@/domain/timeline";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Album, AlbumStatus } from "@/types/music";

const RATING_CYCLE = [null, 7, 8, 9, 10] as const;

export default function AlbumDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const { bottomInset } = useAppShell();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const [album, setAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<AlbumTrack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const row = await fetchAlbumById(id);
    setAlbum(row);
    navigation.setOptions({ title: row?.title ?? "Álbum" });
    if (!row) {
      setError("Álbum não encontrado.");
      return;
    }
    if (row.source === "spotify") {
      setTracks(await fetchAlbumTracks(row.musicbrainz_id).catch(() => []));
    }
  }, [id, navigation]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void load()
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
    }, [load])
  );

  async function patch(next: Partial<Album>) {
    if (!album) return;
    setBusy(true);
    try {
      await updateAlbum({ musicbrainz_id: album.musicbrainz_id, ...next });
      setAlbum({ ...album, ...next });
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: AlbumStatus) {
    if (!album) return;
    await patch(albumStatusUpdate(album, status, getTodayIso()));
  }

  async function cycleTrackRating(track: AlbumTrack) {
    if (!album) return;
    const key = trackRatingKey(track.disc, track.position);
    const current = album.track_ratings?.[key] ?? null;
    const idx = RATING_CYCLE.findIndex((value) => value === current);
    const nextValue = RATING_CYCLE[(idx + 1) % RATING_CYCLE.length];
    const nextRatings = { ...(album.track_ratings ?? {}) };
    if (nextValue == null) delete nextRatings[key];
    else nextRatings[key] = nextValue;
    await patch({ track_ratings: nextRatings });
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  if (!album) {
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
          <CoverThumb
            uri={album.cover_url}
            fallback={album.title}
            variant="square"
          />
          <View style={styles.heroCopy}>
            <ThemedText type="smallBold">{album.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[
                formatArtists(album.artists),
                ALBUM_TYPE_LABELS[album.album_type],
                album.release_year,
                ALBUM_STATUS_LABELS[album.status],
                album.rating != null ? `Nota ${album.rating}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </ThemedText>
          </View>
        </View>
        <View style={styles.actions}>
          {album.status !== "listened" ? (
            <Pressable disabled={busy} onPress={() => void setStatus("listened")}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Marcar ouvido
              </ThemedText>
            </Pressable>
          ) : (
            <Pressable disabled={busy} onPress={() => void setStatus("to_listen")}>
              <ThemedText type="small" themeColor="textSecondary">
                Voltar para a fila
              </ThemedText>
            </Pressable>
          )}
          <Pressable
            disabled={busy}
            onPress={() => void patch({ is_favorite: !album.is_favorite })}
          >
            <ThemedText type="smallBold">
              {album.is_favorite ? "♥ Favorito" : "Marcar favorito"}
            </ThemedText>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => void patch({ would_recommend: album.would_recommend === false })}
          >
            <ThemedText type="small" themeColor="textSecondary">
              {album.would_recommend === false ? "Não recomendaria" : "Recomendaria"}
            </ThemedText>
          </Pressable>
        </View>
        {album.notes ? <ThemedText type="small">{album.notes}</ThemedText> : null}

        {tracks.length > 0 ? (
          <ModuleSection title="Faixas" icon="musical-notes-outline" tint="#F43F5E">
            {tracks.map((track) => {
              const key = trackRatingKey(track.disc, track.position);
              const rating = album.track_ratings?.[key];
              return (
                <Pressable
                  key={key}
                  onPress={() => void cycleTrackRating(track)}
                  style={styles.track}
                >
                  <ThemedText type="small" style={styles.trackTitle} numberOfLines={1}>
                    {track.position}. {track.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {rating != null ? rating : formatTrackLength(track.lengthMs)}
                  </ThemedText>
                </Pressable>
              );
            })}
            <ThemedText type="small" themeColor="textSecondary">
              Toque na faixa para ciclar a nota (7–10).
            </ThemedText>
          </ModuleSection>
        ) : null}

        <Pressable
          onPress={() =>
            router.push({
              pathname: "/music/form",
              params: { id: album.musicbrainz_id },
            })
          }
        >
          <ThemedText type="small" style={{ color: theme.primary }}>
            Editar
          </ThemedText>
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
  track: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  trackTitle: { flex: 1 },
});
