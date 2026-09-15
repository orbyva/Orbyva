import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FormCloseButton } from "@/components/chrome/FormCloseButton";
import { CoverThumb } from "@/components/CoverThumb";
import { DateField } from "@/components/DateField";
import { ScorePicker } from "@/components/ScorePicker";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
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
  const insets = useSafeAreaInsets();
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

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.head}>
            <FormCloseButton onPress={onClose} disabled={busy} />
            <ThemedText type="smallBold" style={styles.headTitle}>
              {title}
            </ThemedText>
            <View style={styles.headSpacer} />
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
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
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                    {itemSubtitle}
                  </ThemedText>
                ) : null}
              </View>
            </View>

            <ThemedText type="smallBold">Sua nota</ThemedText>
            <ScorePicker value={rating} onChange={setRating} />

            {dateLabel ? (
              <View style={styles.field}>
                <ThemedText type="small" themeColor="textSecondary">
                  {dateLabel}
                </ThemedText>
                <DateField
                  value={watchedDate}
                  onChange={setWatchedDate}
                  style={inputStyle}
                />
              </View>
            ) : null}

            {notesLabel ? (
              <View style={styles.field}>
                <ThemedText type="small" themeColor="textSecondary">
                  {notesLabel}
                </ThemedText>
                <TextInput
                  placeholder={notesPlaceholder}
                  placeholderTextColor={theme.textSecondary}
                  style={[inputStyle, styles.multiline]}
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
          </ScrollView>

          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, Spacing.four) },
            ]}
          >
            <Pressable
              disabled={busy}
              onPress={onClose}
              style={[styles.ghost, { borderColor: theme.backgroundSelected }]}
            >
              <ThemedText type="smallBold">Cancelar</ThemedText>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() =>
                void onConfirm({ rating, recommend, watchedDate, notes })
              }
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
        </KeyboardAvoidingView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headTitle: { flex: 1, textAlign: "center" },
  headSpacer: { minWidth: 48 },
  body: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  hero: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  heroCopy: { flex: 1, gap: 4, paddingTop: 2 },
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
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
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
