import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { FavoriteToggle } from "@/components/catalog/FavoriteToggle";
import { CoverThumb } from "@/components/CoverThumb";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui";
import { Radius } from "@/constants/theme";
import type { CatalogReview } from "@/domain/catalog/review";
import { ON_MEDIA, scrim } from "@/domain/ui/color";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

export function CatalogMediaCard({
  coverUri,
  fallback,
  coverVariant = "poster",
  title,
  favorite,
  rating,
  meta,
  progress,
  progressLabel,
  actionLabel,
  onAction,
  onDelete,
  onPress,
  review,
  onToggleFavorite,
}: {
  review?: CatalogReview;
  onToggleFavorite?: () => void;
  coverUri?: string | null;
  fallback: string;
  coverVariant?: "poster" | "square";
  title: string;
  favorite?: boolean;
  rating?: string | null;
  meta: string;
  progress?: number | null;
  progressLabel?: string | null;
  actionLabel?: string | null;
  onAction?: () => void;
  onDelete?: () => void;
  onPress: () => void;
}) {
  const theme = useTheme();
  const showProgress = progress != null;

  return (
    <Card style={styles.card}>
      <Pressable onPress={onPress} style={styles.main}>
        <View style={styles.coverWrap}>
          <CoverThumb
            uri={coverUri}
            fallback={fallback}
            variant={coverVariant === "square" ? "square" : "list"}
          />
          {rating ? (
            <View style={styles.rating}>
              <Ionicons name="star" size={12} color={theme.warning} />
              <ThemedText style={styles.ratingText}>{rating}</ThemedText>
            </View>
          ) : showProgress ? (
            <View style={styles.rating}>
              <Ionicons name="film-outline" size={11} color={ON_MEDIA} />
              <ThemedText style={styles.ratingText}>{progress}%</ThemedText>
            </View>
          ) : null}
          {favorite ? (
            <View style={styles.heart}>
              <Ionicons name="heart" size={13} color={theme.destructive} />
            </View>
          ) : null}
          {showProgress ? (
            <>
              {progressLabel ? (
                <View style={styles.progressCaption}>
                  <Ionicons name="film-outline" size={11} color={ON_MEDIA} />
                  <ThemedText style={styles.progressCaptionText} numberOfLines={2}>
                    {progressLabel}
                  </ThemedText>
                </View>
              ) : null}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(100, progress)}%`,
                      backgroundColor: theme.primary,
                    },
                  ]}
                />
              </View>
            </>
          ) : null}
        </View>
        <View style={styles.copy}>
          <ThemedText type="smallBold" numberOfLines={2}>
            {title}
          </ThemedText>
          {meta ? (
            <ThemedText type="small" themeColor="mutedForeground" numberOfLines={2}>
              {meta}
            </ThemedText>
          ) : null}
          {review?.recommend != null ? (
            <View style={styles.progressRow}>
              <Ionicons
                name={review.recommend ? "thumbs-up" : "thumbs-down"}
                size={13}
                color={review.recommend ? theme.success : theme.destructive}
              />
              <ThemedText
                type="smallBold"
                style={{ color: review.recommend ? theme.success : theme.destructive }}
              >
                {review.recommend ? "Indicaria" : "Não indicaria"}
              </ThemedText>
            </View>
          ) : null}
          {review?.notes ? (
            <View style={[styles.note, { borderLeftColor: theme.border }]}>
              <ThemedText
                type="small"
                themeColor="mutedForeground"
                numberOfLines={2}
                style={styles.noteText}
              >
                {review.notes}
              </ThemedText>
            </View>
          ) : null}
          {showProgress && progressLabel ? (
            <View style={styles.progressRow}>
              <Ionicons name="film-outline" size={13} color={theme.primary} />
              <ThemedText type="smallBold" style={{ color: theme.primary, flex: 1 }}>
                {progressLabel}
              </ThemedText>
            </View>
          ) : null}
          {actionLabel && onAction ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation?.();
                onAction();
              }}
              hitSlop={8}
              style={[
                styles.action,
                { backgroundColor: hexAlpha(theme.primary, 0.1) },
              ]}
            >
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                {actionLabel}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
      {onToggleFavorite || onDelete ? (
        <View style={styles.side}>
          {onToggleFavorite ? (
            <FavoriteToggle
              variant="icon"
              favorite={favorite === true}
              onToggle={onToggleFavorite}
              subject={title}
            />
          ) : null}
          {onDelete ? (
            <Pressable
              accessibilityLabel={`Excluir ${title}`}
              hitSlop={8}
              onPress={onDelete}
              style={styles.deleteBtn}
            >
              <Ionicons name="trash-outline" size={18} color={theme.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  coverWrap: {
    position: "relative",
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  rating: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: scrim(0.82),
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  ratingText: { ...TypeScale.micro, color: ON_MEDIA },
  heart: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: scrim(0.72),
    borderRadius: Radius.full,
    padding: 4,
  },
  progressCaption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 5,
    paddingVertical: 5,
    backgroundColor: scrim(0.78),
  },
  progressCaptionText: {
    flex: 1,
    ...TypeScale.nano,
    color: ON_MEDIA,
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: scrim(0.35),
  },
  progressFill: { height: 3 },
  copy: { flex: 1, gap: 6, justifyContent: "center", paddingVertical: 2 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  note: { borderLeftWidth: 2, paddingLeft: 8 },
  noteText: { fontStyle: "italic" },
  side: { alignSelf: "stretch", justifyContent: "space-between", alignItems: "center", gap: 8 },
  action: {
    alignSelf: "flex-start",
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 2,
  },
});
