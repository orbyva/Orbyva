import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";

import { MarkdownPreview } from "@/components/MarkdownPreview";
import { OrbActionCard } from "@/components/orb/OrbActionCard";
import { OrbClarifyCard } from "@/components/orb/OrbClarifyCard";
import { OrbResultView } from "@/components/orb/OrbResultView";
import { OrbToolCallCard } from "@/components/orb/OrbToolCall";
import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import {
  isOrbAskUser,
  ORB_ASK_USER_TOOL_NAME,
} from "@/domain/orb/clarify";
import {
  isOrbProposal,
  ORB_CREATE_TOOL_NAME,
} from "@/domain/orb/actionsContract";
import { orbBubbleWidth } from "@/domain/orb/bubbleLayout";
import { orbResultView } from "@/domain/orb/results";
import { formatarTokens } from "@/domain/orb/stream";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import type { OrbMessage } from "@/types/orb";

function partesDeUso(message: OrbMessage): string[] {
  const usage = message.usage;
  if (!usage) return [];
  const partes: string[] = [];
  const contexto = formatarTokens(usage.input_tokens);
  const saida = formatarTokens(usage.output_tokens);
  if (contexto) partes.push(`${contexto} in`);
  if (saida) partes.push(`${saida} out`);
  const cache = usage.cache_read_input_tokens;
  if (cache) {
    const formatado = formatarTokens(cache);
    if (formatado) partes.push(`${formatado} cache`);
  }
  if (usage.rounds && usage.rounds > 1) partes.push(`${usage.rounds} rodadas`);
  return partes;
}

export function OrbMessageBubble({
  message,
  onRetry,
  onAskReply,
  isStreaming = false,
}: {
  message: OrbMessage;
  onRetry?: (id: string) => void;
  onAskReply?: (texto: string) => void;
  isStreaming?: boolean;
}) {
  const theme = useTheme();
  const isUser = message.role === "user";
  const [copiado, setCopiado] = useState(false);

  const copiar = useCallback(async () => {
    const texto = message.content.trim();
    if (!texto) return;
    await Clipboard.setStringAsync(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }, [message.content]);

  const visoes = (message.tools ?? [])
    .filter((tool) => tool.status === "ok")
    .map((tool) => ({ id: tool.id, view: orbResultView(tool.name, tool.summary) }))
    .filter(
      (item): item is { id: string; view: NonNullable<ReturnType<typeof orbResultView>> } =>
        item.view !== null
    );

  const propostas = (message.tools ?? [])
    .filter((tool) => tool.name === ORB_CREATE_TOOL_NAME && tool.status === "ok")
    .map((tool) =>
      isOrbProposal(tool.summary) ? { id: tool.id, proposal: tool.summary } : null
    )
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const perguntas = (message.tools ?? [])
    .filter((tool) => tool.name === ORB_ASK_USER_TOOL_NAME && tool.status === "ok")
    .map((tool) =>
      isOrbAskUser(tool.summary) ? { id: tool.id, ask: tool.summary } : null
    )
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const falhasDeCriacao = (message.tools ?? [])
    .filter((tool) => tool.name === ORB_CREATE_TOOL_NAME && tool.status === "error")
    .map((tool) => {
      const summary = tool.summary;
      const mensagem =
        summary &&
        typeof summary === "object" &&
        !Array.isArray(summary) &&
        typeof (summary as { error?: unknown }).error === "string"
          ? (summary as { error: string }).error
          : "Não consegui preparar essa criação.";
      return { id: tool.id, mensagem };
    });

  const toolsNormais = (message.tools ?? []).filter((tool) => {
    if (tool.name === ORB_CREATE_TOOL_NAME) return false;
    if (tool.name === ORB_ASK_USER_TOOL_NAME) return false;
    return true;
  });

  const uso = message.pending ? [] : partesDeUso(message);
  const mostrarBarra = !message.pending && message.content.trim() !== "";

  return (
    <View
      style={[
        styles.wrap,
        isUser ? styles.userAlign : styles.assistantAlign,
      ]}
    >
      <View
        style={[
          styles.bubble,
          orbBubbleWidth(message.role),
          {
            backgroundColor: isUser ? theme.primary : theme.muted,
            borderColor: theme.border,
          },
        ]}
      >
        {isUser ? (
          <ThemedText themeColor="primaryForeground">{message.content}</ThemedText>
        ) : message.content.trim() ? (
          <MarkdownPreview text={message.content} />
        ) : message.pending ? (
          <ThemedText type="small" themeColor="mutedForeground">
            Pensando…
          </ThemedText>
        ) : null}

        {toolsNormais.map((tool) => (
          <OrbToolCallCard key={tool.id} tool={tool} />
        ))}

        {perguntas.map((item) => (
          <OrbClarifyCard
            key={item.id}
            ask={item.ask}
            onReply={onAskReply}
            disabled={isStreaming}
          />
        ))}

        {propostas.map((item) => (
          <OrbActionCard key={item.id} callId={item.id} proposal={item.proposal} />
        ))}

        {falhasDeCriacao.map((item) => (
          <View
            key={item.id}
            style={[styles.fail, { borderColor: `${theme.destructive}66` }]}
          >
            <ThemedText type="small">{item.mensagem}</ThemedText>
          </View>
        ))}

        {visoes.map((item) => (
          <OrbResultView key={item.id} view={item.view} />
        ))}

        {uso.length > 0 ? (
          <ThemedText type="small" themeColor="mutedForeground" style={styles.uso}>
            {uso.join(" · ")}
          </ThemedText>
        ) : null}

        {(message.failed || message.interrupted) && onRetry ? (
          <Pressable onPress={() => onRetry(message.id)} style={styles.retry}>
            <ThemedText
              type="smallBold"
              themeColor={isUser ? "primaryForeground" : "primary"}
            >
              {message.errorKind === "session" ? "Entrar de novo" : "Tentar de novo"}
            </ThemedText>
          </Pressable>
        ) : null}

        {mostrarBarra && !isUser ? (
          <Pressable onPress={() => void copiar()} style={styles.copy}>
            <ThemedText type="small" themeColor="mutedForeground">
              {copiado ? "Copiado" : "Copiar"}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: Spacing.one, paddingHorizontal: Spacing.three },
  userAlign: { alignItems: "flex-end" },
  assistantAlign: { alignItems: "flex-start" },
  bubble: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  retry: { marginTop: Spacing.two },
  copy: { marginTop: Spacing.two, alignSelf: "flex-start" },
  uso: { marginTop: Spacing.two, ...TypeScale.micro },
  fail: {
    marginTop: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.two,
  },
});
