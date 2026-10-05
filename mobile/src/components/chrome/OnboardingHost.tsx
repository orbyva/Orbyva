import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

import { fetchTransactionsQuery } from "@/api/finance/transactions";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { ensureDefaultDimensions } from "@/domain/onboarding/defaults";
import { SCRIM } from "@/domain/ui/color";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import {
  isTourDone,
  markTourDone,
  ONBOARDING_STEPS,
} from "@/lib/onboarding";

export function OnboardingHost() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { fail, ok } = useFeedback();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const done = await isTourDone(user.id);
        if (cancelled || done) return;
        const tx = await fetchTransactionsQuery({ page: 1, pageSize: 1 }).catch(
          () => null
        );
        if (cancelled) return;
        if ((tx?.total ?? 0) > 0) {
          await markTourDone(user.id);
          return;
        }
        setOpen(true);
      } catch {
        /* store indisponível não pode derrubar o app */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user?.id || !open) return null;

  const userId = user.id;
  const current = ONBOARDING_STEPS[step];
  const isLast = step === ONBOARDING_STEPS.length - 1;

  async function finish(goTo?: string) {
    await markTourDone(userId);
    setOpen(false);
    if (goTo) router.push(goTo as never);
  }

  async function handleNext() {
    if (current.id === "dimensions") {
      setBusy(true);
      try {
        const result = await ensureDefaultDimensions();
        if (result.createdTypes || result.createdClasses) {
          ok("Categorias prontas");
        }
      } catch (err) {
        fail(getErrorMessage(err, "Não foi possível criar as categorias."));
      } finally {
        setBusy(false);
      }
    }
    if (isLast) {
      await finish("/finance/form");
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <Modal visible={open} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <ThemedText type="small" themeColor="mutedForeground">
            Passo {step + 1} de {ONBOARDING_STEPS.length}
          </ThemedText>
          <ThemedText type="smallBold">{current.title}</ThemedText>
          <ThemedText themeColor="mutedForeground">{current.body}</ThemedText>
          <Button
            label={isLast ? "Registrar primeira transação" : "Continuar"}
            size="lg"
            disabled={busy}
            loading={busy}
            onPress={() => void handleNext()}
          />
          <Pressable
            onPress={() => void finish("/home")}
            style={styles.skip}
          >
            <ThemedText type="small" themeColor="mutedForeground">
              Pular
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: Spacing.four,
    backgroundColor: SCRIM,
  },
  sheet: {
    borderRadius: Radius.xl,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  skip: { alignItems: "center", paddingVertical: 8 },
});
