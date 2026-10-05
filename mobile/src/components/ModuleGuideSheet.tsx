import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchTransactionsQuery } from "@/api/finance/transactions";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { SCRIM } from "@/domain/ui/color";
import { useTheme } from "@/hooks/use-theme";
import { getModuleGuide, type ModuleGuideId } from "@/lib/moduleGuides";

export function ModuleGuideSheet({
  moduleId,
  open,
  onClose,
}: {
  moduleId: ModuleGuideId | null;
  open: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  if (!moduleId) return null;
  const guide = getModuleGuide(moduleId);

  return (
    <Modal visible={open} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.background }]}
          onPress={() => undefined}
        >
          <View style={styles.head}>
            <ThemedText type="smallBold">{guide.title}</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <ThemedText type="linkPrimary">Fechar</ThemedText>
            </Pressable>
          </View>
          <ThemedText themeColor="mutedForeground">{guide.hook}</ThemedText>
          <ScrollView style={styles.body}>
            {guide.steps.map((step, i) => (
              <View key={step.title} style={styles.step}>
                <ThemedText type="smallBold">
                  {i + 1}. {step.title}
                </ThemedText>
                <ThemedText type="small" themeColor="mutedForeground">
                  {step.body}
                </ThemedText>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function useFirstVisitGuide(
  userId: string | undefined,
  moduleId: ModuleGuideId | null
) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId || !moduleId) return;
    let cancelled = false;
    void import("@/lib/onboarding").then(async ({ isModuleGuideSeen, markModuleGuideSeen }) => {
      const seen = await isModuleGuideSeen(userId, moduleId);
      if (cancelled || seen) return;
      const tx = await fetchTransactionsQuery({ page: 1, pageSize: 1 }).catch(() => null);
      if (cancelled) return;
      if ((tx?.total ?? 0) > 0) return;
      setOpen(true);
      await markModuleGuideSeen(userId, moduleId);
    });
    return () => {
      cancelled = true;
    };
  }, [moduleId, userId]);

  return { open, setOpen };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: SCRIM,
  },
  sheet: {
    maxHeight: "80%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  body: { maxHeight: 420 },
  step: { gap: 4, marginBottom: 12 },
});