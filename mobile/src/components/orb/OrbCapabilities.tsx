import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import {
  ORB_CAPABILITY_AREAS,
  ORB_CAPABILITY_CONSULT_COUNT,
} from "@/domain/orb/capabilities";
import { useTheme } from "@/hooks/use-theme";

export function OrbCapabilitiesSeal() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.seal,
        {
          borderColor: theme.backgroundSelected,
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: theme.success }]} />
      <ThemedText type="small">
        Conectada · {ORB_CAPABILITY_CONSULT_COUNT} consultas ·{" "}
        <ThemedText type="smallBold" style={{ color: theme.success }}>
          só cria com confirmação
        </ThemedText>
      </ThemedText>
    </View>
  );
}

export function OrbCapabilities({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.background,
            paddingTop: insets.top + Spacing.two,
            paddingBottom: insets.bottom + Spacing.three,
          },
        ]}
      >
        <View style={styles.header}>
          <ThemedText type="subtitle">O que eu sei consultar</ThemedText>
          <Pressable onPress={onClose} hitSlop={12}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              Fechar
            </ThemedText>
          </Pressable>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.desc}>
          Consulto seus dados no seu login, abro a tela certa e preparo criações
          para você confirmar.
        </ThemedText>
        <OrbCapabilitiesSeal />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {ORB_CAPABILITY_AREAS.map((area) => (
            <View key={area.nome} style={styles.area}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {area.nome.toUpperCase()} · {area.tools.length}
              </ThemedText>
              <View style={styles.tools}>
                {area.tools.map((tool) => (
                  <View
                    key={tool}
                    style={[
                      styles.toolChip,
                      {
                        borderColor: theme.backgroundSelected,
                        backgroundColor: theme.surface,
                      },
                    ]}
                  >
                    <ThemedText type="small">{tool}</ThemedText>
                  </View>
                ))}
              </View>
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
            Não edito e não apago nada — o que precisar mudar, você muda no Orbyva.
            Criar, eu só preparo: a linha só passa a existir depois que você
            confirma no cartão.
          </ThemedText>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  seal: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignSelf: "flex-start",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sheet: { flex: 1, paddingHorizontal: Spacing.four },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.two,
  },
  desc: { marginBottom: Spacing.three },
  scroll: { flex: 1, marginTop: Spacing.three },
  scrollContent: { gap: Spacing.four, paddingBottom: Spacing.four },
  area: { gap: Spacing.two },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.one },
  toolChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  footer: { lineHeight: 18, paddingTop: Spacing.two },
});
