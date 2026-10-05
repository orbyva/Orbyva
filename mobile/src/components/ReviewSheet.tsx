import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { CoverThumb } from "@/components/CoverThumb";
import { DateField } from "@/components/DateField";
import { ScorePicker } from "@/components/ScorePicker";
import { ThemedText } from "@/components/themed-text";
import { Button, Input, Sheet } from "@/components/ui";
import { Radius } from "@/constants/theme";
import { getTodayIso } from "@/domain/timeline";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

export type ReviewResult = {
  rating: number | null;
  recommend: boolean;
  watchedDate: string;
  notes: string;
};

export function ReviewSheet({
  visible,
  title,
  itemTitle,
  itemSubtitle,
  coverUri,
  coverVariant = "poster",
  confirmLabel,
  busy,
  dateLabel,
  notesLabel,
  notesPlaceholder = "Opcional",
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  itemTitle: string;
  itemSubtitle?: string;
  coverUri?: string | null;
  coverVariant?: "poster" | "square";
  confirmLabel: string;
  busy?: boolean;
  dateLabel?: string;
  notesLabel?: string;
  notesPlaceholder?: string;
  onClose: () => void;
  onConfirm: (result: ReviewResult) => void | Promise<void>;
}) {
  const theme = useTheme();
  const [rating, setRating] = useState<number | null>(null);
  const [recommend, setRecommend] = useState(true);
  const [watchedDate, setWatchedDate] = useState(getTodayIso());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!visible) return;
    setRating(null);
    setRecommend(true);
    setWatchedDate(getTodayIso());
    setNotes("");
  }, [visible]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      closeDisabled={busy}
      footer={
        <>
          <Button
            label="Cancelar"
            variant="outline"
            size="lg"
            disabled={busy}
            onPress={onClose}
            style={styles.cancel}
          />
          <Button
            label={confirmLabel}
            size="lg"
            disabled={busy}
            loading={busy}
            onPress={() => void onConfirm({ rating, recommend, watchedDate, notes })}
            style={styles.confirm}
          />
        </>
      }
    >
      <View style={styles.hero}>
        <CoverThumb
          uri={coverUri}
          fallback={itemTitle}
          variant={coverVariant === "square" ? "square" : "poster"}
        />
        <View style={styles.heroCopy}>
          <ThemedText type="smallBold" numberOfLines={3}>
            {itemTitle}
          </ThemedText>
          {itemSubtitle ? (
            <ThemedText type="small" themeColor="mutedForeground" numberOfLines={2}>
              {itemSubtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <ThemedText type="smallBold">Sua nota</ThemedText>
      <ScorePicker value={rating} onChange={setRating} />

      {dateLabel ? (
        <View style={styles.field}>
          <ThemedText type="small" themeColor="mutedForeground">
            {dateLabel}
          </ThemedText>
          <DateField
            value={watchedDate}
            onChange={setWatchedDate}
          />
        </View>
      ) : null}

      {notesLabel ? (
        <View style={styles.field}>
          <ThemedText type="small" themeColor="mutedForeground">
            {notesLabel}
          </ThemedText>
          <Input
            placeholder={notesPlaceholder}
            style={styles.multiline}
            multiline
            value={notes}
            onChangeText={setNotes}
          />
        </View>
      ) : null}

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
              : { backgroundColor: theme.muted },
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
                  backgroundColor: hexAlpha(theme.destructive, 0.14),
                  borderColor: theme.destructive,
                }
              : { backgroundColor: theme.muted },
          ]}
        >
          <ThemedText
            type="smallBold"
            style={!recommend ? { color: theme.destructive } : undefined}
          >
            Não
          </ThemedText>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  heroCopy: { flex: 1, gap: 4, paddingTop: 2 },
  field: { gap: 8 },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
  recommend: { flexDirection: "row", gap: 8 },
  recChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: "transparent",
  },
  cancel: { flex: 1 },
  confirm: { flex: 1.4 },
});
