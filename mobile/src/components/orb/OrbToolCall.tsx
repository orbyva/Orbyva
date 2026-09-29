import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { orbToolLabel } from "@/domain/orb/toolLabel";
import {
  linhasCompactasVisiveis,
  resumoCurtoDeTool,
  resumoDeToolParaTabela,
} from "@/domain/orb/toolSummary";
import { useTheme } from "@/hooks/use-theme";
import type { OrbToolCall } from "@/types/orb";

export function OrbToolCallCard({ tool }: { tool: OrbToolCall }) {
  const theme = useTheme();
  const [aberto, setAberto] = useState(false);
  const label = orbToolLabel(tool.name);
  const curto = resumoCurtoDeTool(tool.summary);
  const tabela =
    tool.status === "ok" && tool.summary != null
      ? resumoDeToolParaTabela(tool.summary)
      : null;
  const detalhe = tabela ? linhasCompactasVisiveis(tabela) : null;
  const expansivel = Boolean(detalhe && detalhe.linhas.length > 0);

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
      <Pressable
        onPress={expansivel ? () => setAberto((v) => !v) : undefined}
        disabled={!expansivel}
        style={styles.head}
        accessibilityRole={expansivel ? "button" : undefined}
        accessibilityLabel={
          expansivel ? (aberto ? "Recolher resultado" : "Ver resultado") : undefined
        }
      >
        {tool.status === "running" ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <ThemedText type="smallBold" style={{ color: theme.primary }}>
            {tool.status === "ok" ? "✓" : "!"}
          </ThemedText>
        )}
        <View style={styles.headText}>
          <ThemedText type="smallBold">
            {tool.status === "running" ? `Consultando ${label}…` : label}
          </ThemedText>
          {tool.status !== "running" && curto ? (
            <ThemedText type="small" themeColor="textSecondary">
              {curto}
              {expansivel ? (aberto ? " · ocultar" : " · ver") : ""}
            </ThemedText>
          ) : null}
        </View>
      </Pressable>

      {aberto && detalhe ? (
        <View style={styles.list}>
          {detalhe.linhas.map((linha, index) => (
            <View key={`${linha.titulo}-${index}`} style={styles.row}>
              <ThemedText type="small" style={{ flex: 1 }} numberOfLines={1}>
                {linha.titulo}
              </ThemedText>
              {linha.meta ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {linha.meta}
                </ThemedText>
              ) : null}
            </View>
          ))}
          {detalhe.restantes > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              +{detalhe.restantes} {detalhe.restantes === 1 ? "item" : "itens"}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: Spacing.two,
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  head: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  headText: { flex: 1, gap: 2 },
  list: { gap: 6, marginTop: Spacing.one, paddingLeft: 22 },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
});
