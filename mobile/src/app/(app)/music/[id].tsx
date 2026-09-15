import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
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
  ALBUM_STATUS_LABELS,
  ALBUM_TYPE_LABELS,
  albumStatusUpdate,
  formatAlbumRating,
  formatArtists,
  formatTrackLength,
  getAlbumRatingLabel,
  getLatestListenedDate,
  resolveRatedAlbumTracks,
  trackRatingKey,
} from "@/domain/music";
import { buildAlbumShareText, usableCoverUri } from "@/domain/share";
import { getTodayIso } from "@/domain/timeline";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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
            <View style={styles.titleRow}>
              <ThemedText type="smallBold" style={styles.title}>
                {album.title}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  album.is_favorite ? "Remover dos favoritos" : "Favoritar"
                }
                disabled={busy}
                hitSlop={8}
                onPress={() => void patch({ is_favorite: !album.is_favorite })}
              >
                <Ionicons
                  name={album.is_favorite ? "heart" : "heart-outline"}
                  size={22}
                  color={album.is_favorite ? theme.danger : theme.textSecondary}
                />
              </Pressable>
            </View>
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
        {album.status !== "listened" ? (
          <FormButton
            label="Marcar como Ouvido"
            tone="primary"
            disabled={busy}
            onPress={() => setReviewOpen(true)}
          />
        ) : null}
        {album.notes ? <ThemedText type="small">{album.notes}</ThemedText> : null}
        {album.status === "listened" ? (
          <ThemedText type="small" themeColor="textSecondary">
            {album.would_recommend === false ? "Não recomendaria" : "Recomendaria"}
          </ThemedText>
        ) : null}

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

        <View style={styles.footerActions}>
          {album.status === "listened" ? (
            <FormButton
              label="Voltar para a fila"
              disabled={busy}
              onPress={() => void setStatus("to_listen")}
            />
          ) : null}
          <FormButton
            label="Editar"
            tone={album.status === "listened" ? "primary" : "neutral"}
            onPress={() =>
              router.push({
                pathname: "/music/form",
                params: { id: album.musicbrainz_id },
              })
            }
          />
          {album.status === "listened" ? (
            <FormButton
              label="Compartilhar"
              onPress={() => setShareOpen(true)}
            />
          ) : null}
        </View>
      </ScrollView>
      <ReviewSheet
        visible={reviewOpen}
        title="Avaliar álbum"
        itemTitle={album.title}
        itemSubtitle={[
          formatArtists(album.artists),
          ALBUM_TYPE_LABELS[album.album_type],
          album.release_year,
        ]
          .filter(Boolean)
          .join(" · ")}
        coverUri={album.cover_url}
        coverVariant="square"
        confirmLabel="Marcar como Ouvido"
        busy={busy}
        onClose={() => setReviewOpen(false)}
        onConfirm={async (result) => {
          await patch({
            ...albumStatusUpdate(album, "listened", getTodayIso()),
            rating: result.rating,
            would_recommend: result.recommend,
          });
          setReviewOpen(false);
        }}
      />
      {album.status === "listened" ? (
        <OpinionShareSheet
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          title={album.title}
          hasNotes={Boolean(album.notes?.trim())}
          message={(includeNotes) =>
            buildAlbumShareText(album, {
              includeNotes,
              ratedTracks: resolveRatedAlbumTracks(album.track_ratings, tracks),
            })
          }
          renderCard={({ includeNotes }) => {
            const latest = getLatestListenedDate(album.listened_dates);
            const rated = resolveRatedAlbumTracks(
              album.track_ratings,
              tracks
            );
            return (
              <StoryShareCard
                coverUri={usableCoverUri(album.cover_url)}
                coverVariant="square"
                fallbackEmoji="💿"
                fallbackCaption="ÁLBUM"
                kicker={latest ? `OUVI  ·  ${formatDateBR(latest)}` : "OUVI"}
                title={album.title}
                subtitle={formatArtists(album.artists)}
                score={
                  album.rating != null && album.rating > 0
                    ? `${formatAlbumRating(album.rating)}/10`
                    : null
                }
                scoreLabel={
                  album.rating != null && album.rating > 0
                    ? getAlbumRatingLabel(album.rating)
                    : null
                }
                recommend={album.would_recommend !== false}
                notes={includeNotes ? album.notes?.trim() : null}
                itemsLabel="FAIXAS"
                items={rated.map((track) => ({
                  index:
                    track.disc > 1
                      ? `${track.disc}.${track.position}`
                      : String(track.position),
                  title: track.title,
                  score: formatAlbumRating(track.rating),
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
  track: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  trackTitle: { flex: 1 },
});
