import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { formatMovieRating } from "@/domain/movies";
import { hexAlpha } from "@/lib/color";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function scoreLabel(value: number): string {
  if (value >= 9) return "Obra-prima";
  if (value >= 8) return "Excelente";
  if (value >= 7) return "Muito bom";
  if (value >= 6) return "Bom";
  if (value >= 4) return "Regular";
  if (value >= 2) return "Fraco";
  return "Ruim";
}

export function ReviewSheet({
  visible,
  title,
  itemTitle,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  itemTitle: string;
  confirmLabel: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (result: {
    rating: number | null;
    recommend: boolean;
  }) => void | Promise<void>;
}) {
  const theme = useTheme();
  const [rating, setRating] = useState<number | null>(null);
  const [recommend, setRecommend] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setRating(null);
    setRecommend(true);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.flex}>
        <View style={styles.head}>
          <View style={styles.headCopy}>
            <ThemedText type="smallBold">{title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {itemTitle}
            </ThemedText>
          </View>
          <Pressable onPress={onClose} hitSlop={8} disabled={busy}>
            <ThemedText type="linkPrimary">Fechar</ThemedText>
          </Pressable>
        </View>

        <View style={styles.body}>
          <ThemedText type="smallBold">Sua nota</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {rating != null
              ? `${formatMovieRating(rating)}/10 · ${scoreLabel(rating)}`
              : "Opcional — toque à esquerda para .5, à direita para inteiro"}
          </ThemedText>
          <View style={styles.scores}>
            {SCORES.map((score) => {
              const fill =
                rating != null && rating >= score
                  ? "full"
                  : rating != null && rating >= score - 0.5
                    ? "half"
                    : "empty";
              return (
                <Pressable
                  key={score}
                  onPress={(event) => {
                    const x = event.nativeEvent.locationX;
                    const next = x < 22 ? score - 0.5 : score;
                    setRating((cur) => (cur === next ? null : next));
                  }}
                  style={[
                    styles.score,
                    {
                      backgroundColor:
                        fill === "full"
                          ? theme.primary
                          : fill === "half"
                            ? hexAlpha(theme.primary, 0.28)
                            : theme.backgroundElement,
                      borderColor:
                        fill === "empty" ? "transparent" : theme.primary,
                    },
                  ]}
                >
                  {fill === "half" ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.halfFill,
                        { backgroundColor: hexAlpha(theme.primary, 0.55) },
                      ]}
                    />
                  ) : null}
                  <ThemedText
                    type="smallBold"
                    style={{
                      color: fill === "full" ? "#FFFFFF" : theme.text,
                      zIndex: 1,
                    }}
                  >
                    {score}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="smallBold">Recomendaria?</ThemedText>
          <View style={styles.recommend}>
            <Pressable
              onPress={() => setRecommend(true)}
              style={[
                styles.recChip,
                recommend
                  ? {
                      backgroundColor: hexAlpha(theme.success, 0.16),
                      borderColor: theme.success,
                    }
                  : { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText
                type="smallBold"
                style={recommend ? { color: theme.success } : undefined}
              >
                Sim
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setRecommend(false)}
              style={[
                styles.recChip,
                !recommend
                  ? {
                      backgroundColor: hexAlpha(theme.danger, 0.14),
                      borderColor: theme.danger,
                    }
                  : { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText
                type="smallBold"
                style={!recommend ? { color: theme.danger } : undefined}
              >
                Não
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            disabled={busy}
            onPress={onClose}
            style={[styles.ghost, { borderColor: theme.backgroundSelected }]}
          >
            <ThemedText type="smallBold">Cancelar</ThemedText>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => void onConfirm({ rating, recommend })}
            style={[styles.submit, { backgroundColor: theme.primary }]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText type="smallBold" style={{ color: "#FFFFFF" }}>
                {confirmLabel}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  headCopy: { flex: 1, gap: 4 },
  body: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  scores: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  score: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  halfFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "50%",
  },
  recommend: { flexDirection: "row", gap: 8 },
  recChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  footer: {
    marginTop: "auto",
    flexDirection: "row",
    gap: 10,
    padding: Spacing.four,
    paddingBottom: Spacing.five,
  },
  ghost: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  submit: {
    flex: 1.4,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
