import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutUp, LinearTransition } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { narrarPassos, type OrbPassoNarrado } from "@/domain/orb/narrative";
import { orbToolLabel } from "@/domain/orb/toolLabel";
import { linhasCompactasVisiveis, resumoDeToolParaTabela } from "@/domain/orb/toolSummary";
import { useTheme } from "@/hooks/use-theme";
import type { OrbToolCall } from "@/types/orb";

/** Um passo da linha de raciocínio: frase em português e, ao tocar, as linhas do resultado. */
function OrbPasso({ tool, passo }: { tool: OrbToolCall; passo: OrbPassoNarrado }) {
  const theme = useTheme();
  const [aberto, setAberto] = useState(false);
  const tabela =
    tool.status === "ok" && tool.summary != null ? resumoDeToolParaTabela(tool.summary) : null;
  const detalhe = tabela ? linhasCompactasVisiveis(tabela) : null;
  const expansivel = Boolean(detalhe && detalhe.linhas.length > 0);
  const falhou = tool.status === "error" && !passo.corrigido;

  return (
    <View style={styles.step}>
      <View
        style={[
          styles.dot,
          {
            borderColor: falhou ? theme.warning : theme.border,
            backgroundColor: theme.background,
          },
        ]}
      >
        {tool.status === "running" ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <ThemedText type="smallBold" style={{ color: falhou ? theme.warning : theme.success }}>
            {falhou ? "!" : "✓"}
          </ThemedText>
        )}
      </View>

      <View style={styles.stepBody}>
        <Pressable
          onPress={expansivel ? () => setAberto((v) => !v) : undefined}
          disabled={!expansivel}
          accessibilityRole={expansivel ? "button" : undefined}
          accessibilityLabel={
            expansivel ? `${passo.titulo}. ${aberto ? "Ocultar detalhes" : "Ver detalhes"}` : undefined
          }
          style={styles.stepHead}
        >
          <ThemedText type="smallBold">{passo.titulo}</ThemedText>
          {passo.detalhe || expansivel ? (
            <ThemedText type="small" themeColor="mutedForeground">
              {passo.detalhe ?? ""}
              {expansivel ? `${passo.detalhe ? " · " : ""}${aberto ? "ocultar" : "ver detalhes"}` : ""}
            </ThemedText>
          ) : null}
        </Pressable>

        {aberto && detalhe ? (
          <Animated.View
            entering={FadeInDown.duration(200)}
            exiting={FadeOutUp.duration(150)}
            style={[styles.list, { borderColor: theme.border }]}
          >
            {detalhe.linhas.map((linha, index) => (
              <View key={`${linha.titulo}-${index}`} style={styles.row}>
                <ThemedText type="small" style={styles.rowTitle} numberOfLines={1}>
                  {linha.titulo}
                </ThemedText>
                {linha.meta ? (
                  <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1}>
                    {linha.meta}
                  </ThemedText>
                ) : null}
              </View>
            ))}
            {detalhe.restantes > 0 ? (
              <ThemedText type="small" themeColor="mutedForeground">
                +{detalhe.restantes} {detalhe.restantes === 1 ? "item" : "itens"}
              </ThemedText>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Os passos do turno como linha do tempo ("Consultei suas categorias" → "Simulei o parcelamento"),
 * no mesmo texto do web — a narração sai de `domain/orb/narrative.ts`, cópia da do web.
 */
export function OrbReasoning({ tools }: { tools: OrbToolCall[] }) {
  const theme = useTheme();
  const [aberto, setAberto] = useState(true);
  const passos = useMemo(() => narrarPassos(tools, orbToolLabel), [tools]);
  const emCurso = tools.some((tool) => tool.status === "running");
  const quantos = tools.length === 1 ? "1 passo" : `${tools.length} passos`;

  return (
    <Animated.View layout={LinearTransition.duration(200)} style={styles.wrap}>
      <Pressable
        onPress={() => setAberto((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        style={styles.header}
      >
        <ThemedText type="small" themeColor="mutedForeground">
          {emCurso ? "Pensando" : "Linha de raciocínio"} · {quantos} {aberto ? "▾" : "▸"}
        </ThemedText>
      </Pressable>

      {aberto ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.timeline}
        >
          <View style={[styles.line, { backgroundColor: theme.border }]} />
          {tools.map((tool, index) => (
            <Animated.View key={tool.id} entering={FadeInDown.duration(250)}>
              <OrbPasso tool={tool} passo={passos[index]} />
            </Animated.View>
          ))}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const DOT = 20;

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one, marginTop: Spacing.one },
  header: { alignSelf: "flex-start", paddingVertical: 2 },
  timeline: { gap: Spacing.two, position: "relative" },
  line: {
    position: "absolute",
    left: DOT / 2,
    top: DOT / 2,
    bottom: DOT / 2,
    width: StyleSheet.hairlineWidth,
  },
  step: { flexDirection: "row", gap: Spacing.two, alignItems: "flex-start" },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBody: { flex: 1, gap: Spacing.one },
  stepHead: { gap: 2 },
  list: {
    gap: 6,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: Spacing.two,
  },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  rowTitle: { flex: 1 },
});
