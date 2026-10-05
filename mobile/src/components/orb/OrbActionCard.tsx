import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";

import { executeOrbProposal } from "@/api/orbActions";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { useOrbContext, type OrbProposalState } from "@/hooks/useOrb";
import { getErrorMessage } from "@/lib/errors";
import { useTheme } from "@/hooks/use-theme";
import type { OrbProposal } from "@/domain/orb/actionsContract";

export function OrbActionCard({
  callId,
  proposal,
  onCreated,
}: {
  callId: string;
  proposal: OrbProposal;
  onCreated?: (outcome: { message: string; link?: string }) => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const orb = useOrbContext();
  const [local, setLocal] = useState<OrbProposalState>({ status: "idle" });
  const estado = orb?.proposalStates[callId] ?? local;

  const setEstado = useCallback(
    (state: OrbProposalState) => {
      if (orb) orb.setProposalState(callId, state);
      else setLocal(state);
    },
    [callId, orb]
  );

  const confirmar = useCallback(async () => {
    if (estado.status === "saving" || estado.status === "done") return;
    setEstado({ status: "saving" });
    try {
      const out = await executeOrbProposal(proposal);
      setEstado({ status: "done", message: out.message, link: out.link });
      onCreated?.(out);
    } catch (error) {
      setEstado({
        status: "error",
        message: getErrorMessage(error, "Não deu para gravar."),
      });
    }
  }, [estado.status, onCreated, proposal, setEstado]);

  const descartar = useCallback(() => {
    setEstado({ status: "discarded" });
  }, [setEstado]);

  if (estado.status === "discarded") {
    return (
      <View style={[styles.card, { borderColor: theme.border }]}>
        <ThemedText type="small" themeColor="mutedForeground">
          Proposta descartada.
        </ThemedText>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: theme.border,
          backgroundColor: theme.muted,
        },
      ]}
    >
      <ThemedText type="smallBold">{proposal.label}</ThemedText>
      {proposal.fields.map((field) => (
        <ThemedText key={field.label} type="small" themeColor="mutedForeground">
          {field.label} · {field.value}
        </ThemedText>
      ))}

      {estado.status === "done" ? (
        <View style={styles.row}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>
            {estado.message}
          </ThemedText>
          {estado.link ? (
            <Pressable onPress={() => router.push(estado.link as Href)}>
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                Ver
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : estado.status === "error" ? (
        <View style={styles.col}>
          <ThemedText type="small" themeColor="destructive">
            {estado.message}
          </ThemedText>
          <Pressable onPress={() => void confirmar()} style={styles.retry}>
            <ThemedText type="smallBold">Tentar de novo</ThemedText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.row}>
          <Button
            label="Criar"
            disabled={estado.status === "saving"}
            loading={estado.status === "saving"}
            onPress={() => void confirmar()}
          />
          <Button
            label="Descartar"
            variant="outline"
            disabled={estado.status === "saving"}
            onPress={descartar}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
    padding: Spacing.three,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  row: { flexDirection: "row", gap: Spacing.two, alignItems: "center", marginTop: Spacing.two },
  col: { gap: Spacing.two, marginTop: Spacing.two },
  retry: { alignSelf: "flex-start" },
});
