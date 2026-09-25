import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";

import { executeOrbProposal } from "@/api/orbActions";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
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
      <View style={[styles.card, { borderColor: theme.backgroundSelected }]}>
        <ThemedText type="small" themeColor="textSecondary">
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
          borderColor: theme.backgroundSelected,
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      <ThemedText type="smallBold">{proposal.label}</ThemedText>
      {proposal.fields.map((field) => (
        <ThemedText key={field.label} type="small" themeColor="textSecondary">
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
          <ThemedText type="small" style={{ color: "#dc2626" }}>
            {estado.message}
          </ThemedText>
          <Pressable onPress={() => void confirmar()} style={styles.retry}>
            <ThemedText type="smallBold">Tentar de novo</ThemedText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.row}>
          <Pressable
            onPress={() => void confirmar()}
            disabled={estado.status === "saving"}
            style={[styles.btn, { backgroundColor: theme.primary }]}
          >
            {estado.status === "saving" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText type="smallBold" style={{ color: "#fff" }}>
                Criar
              </ThemedText>
            )}
          </Pressable>
          <Pressable
            onPress={descartar}
            disabled={estado.status === "saving"}
            style={[styles.btn, { borderColor: theme.backgroundSelected, borderWidth: 1 }]}
          >
            <ThemedText type="smallBold">Descartar</ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  row: { flexDirection: "row", gap: Spacing.two, alignItems: "center", marginTop: Spacing.two },
  col: { gap: Spacing.two, marginTop: Spacing.two },
  btn: {
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minWidth: 88,
    alignItems: "center",
  },
  retry: { alignSelf: "flex-start" },
});
