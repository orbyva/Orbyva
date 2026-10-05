import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type KeyboardEvent,
  type ListRenderItem,
} from "react-native";
import { useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLogo } from "@/components/BrandLogo";
import {
  OrbCapabilities,
  OrbCapabilitiesSeal,
} from "@/components/orb/OrbCapabilities";
import { OrbComposer } from "@/components/orb/OrbComposer";
import { OrbMessageBubble } from "@/components/orb/OrbMessageBubble";
import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { orbChatKeyboardInset } from "@/domain/orb/composerLayout";
import { useOrbContext } from "@/hooks/useOrb";
import { useOrbChat } from "@/hooks/useOrbChat";
import { useTheme } from "@/hooks/use-theme";
import type { OrbMessage } from "@/types/orb";

const ORB_SUGESTOES_DE_CHAT = [
  "Tenho algum orçamento estourado esse mês?",
  "Posso parcelar uma compra de R$ 5.000 em 12x?",
  "O que eu tenho pra fazer hoje?",
  "O que vence nos próximos 7 dias?",
  "Me indica um filme que eu ainda não vi",
  "Como estão meus hábitos essa semana?",
];

export function OrbChat() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const contexto = useOrbContext();
  const local = useOrbChat();
  const orb = contexto ?? local;
  const listRef = useRef<FlatList<OrbMessage>>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setCapabilitiesOpen(true)}
          hitSlop={12}
          style={{ marginRight: 4, padding: 8 }}
          accessibilityLabel="O que a Orb sabe"
        >
          <ThemedText type="smallBold" style={{ color: theme.primary }}>
            ?
          </ThemedText>
        </Pressable>
      ),
    });
  }, [navigation, theme.primary]);

  useEffect(() => {
    const onShow = (event: KeyboardEvent) => {
      setKeyboardHeight(event.endCoordinates.height);
    };
    const onHide = () => setKeyboardHeight(0);
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      onShow
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      onHide
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const renderItem: ListRenderItem<OrbMessage> = ({ item }) => (
    <OrbMessageBubble
      message={item}
      onRetry={(id) => void orb.retry(id)}
      onAskReply={(texto) => void orb.send(texto)}
      isStreaming={orb.isStreaming}
    />
  );

  const bottomInset = orbChatKeyboardInset(Platform.OS, keyboardHeight, insets.bottom);
  const keyboardOpen = keyboardHeight > 0;

  return (
    <View
      style={[
        styles.fill,
        {
          backgroundColor: theme.background,
          paddingBottom: bottomInset,
        },
      ]}
    >
      {orb.messages.length === 0 ? (
        <View
          style={[
            styles.empty,
            keyboardOpen && styles.emptyKeyboardOpen,
          ]}
        >
          {!keyboardOpen ? (
            <>
              <BrandLogo size={48} />
              <ThemedText type="subtitle" style={styles.emptyTitle}>
                Converse com a Orb
              </ThemedText>
              <ThemedText type="small" themeColor="mutedForeground" style={styles.emptyHint}>
                Pergunte sobre suas finanças, tarefas, hábitos e o resto do Orbyva.
              </ThemedText>
              <OrbCapabilitiesSeal />
              <Pressable onPress={() => setCapabilitiesOpen(true)}>
                <ThemedText type="small" style={{ color: theme.primary, marginTop: Spacing.one }}>
                  Ver o que eu sei
                </ThemedText>
              </Pressable>
            </>
          ) : null}
          <View style={styles.chips}>
            {ORB_SUGESTOES_DE_CHAT.slice(0, 4).map((suggestion) => (
              <Pressable
                key={suggestion}
                onPress={() => {
                  Keyboard.dismiss();
                  void orb.send(suggestion);
                }}
                style={[
                  styles.chip,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.muted,
                  },
                ]}
              >
                <ThemedText type="small">{suggestion}</ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={orb.messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          removeClippedSubviews={false}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
        />
      )}
      <OrbComposer
        streaming={orb.isStreaming}
        onSend={(text) => void orb.send(text)}
        onStop={orb.stop}
      />
      <OrbCapabilities open={capabilitiesOpen} onClose={() => setCapabilitiesOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingVertical: Spacing.two, flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  emptyKeyboardOpen: {
    justifyContent: "flex-end",
    paddingBottom: Spacing.two,
  },
  emptyTitle: { textAlign: "center", marginTop: Spacing.two },
  emptyHint: { textAlign: "center", marginBottom: Spacing.two },
  chips: { width: "100%", gap: Spacing.two, marginTop: Spacing.two },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
