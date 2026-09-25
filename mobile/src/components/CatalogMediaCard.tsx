import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { CoverThumb } from "@/components/CoverThumb";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/Card";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

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
}: {
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
              <ThemedText style={styles.ratingText}>★ {rating}</ThemedText>
            </View>
          ) : showProgress ? (
            <View style={styles.rating}>
              <Ionicons name="film-outline" size={11} color="#FFFFFF" />
              <ThemedText style={styles.ratingText}>{progress}%</ThemedText>
            </View>
          ) : null}
          {favorite ? (
            <View style={styles.heart}>
              <ThemedText style={styles.heartText}>♥</ThemedText>
            </View>
          ) : null}
          {showProgress ? (
            <>
              {progressLabel ? (
                <View style={styles.progressCaption}>
                  <Ionicons name="film-outline" size={11} color="#FFFFFF" />
                  <ThemedText style={styles.progressCaptionText} numberOfLines={2}>
                    {progressLabel}
                  </ThemedText>
                </View>
              ) : null}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, progress)}%` },
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
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {meta}
            </ThemedText>
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
                { backgroundColor: `${theme.primary}18` },
              ]}
            >
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                {actionLabel}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
      {onDelete ? (
        <Pressable
          accessibilityLabel={`Excluir ${title}`}
          hitSlop={8}
          onPress={onDelete}
          style={styles.deleteBtn}
        >
          <Ionicons name="trash-outline" size={18} color={theme.danger} />
        </Pressable>
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
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  coverWrap: {
    position: "relative",
    borderRadius: Radius.control,
    overflow: "hidden",
  },
  rating: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(11,15,26,0.82)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  ratingText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  heart: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(11,15,26,0.72)",
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  heartText: { color: "#FB7185", fontSize: 12 },
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
    backgroundColor: "rgba(11,15,26,0.78)",
  },
  progressCaptionText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(11,15,26,0.35)",
  },
  progressFill: { height: 3, backgroundColor: "#0EA5E9" },
  copy: { flex: 1, gap: 6, justifyContent: "center", paddingVertical: 2 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  action: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 2,
  },
});
