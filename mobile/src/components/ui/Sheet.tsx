import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Radius, Spacing } from "@/constants/theme";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";

/**
 * Folha de baixo no papel do dialog/popover/select do web. `pageSheet` dá o gesto nativo de
 * arrastar para fechar no iOS; no Android vira tela cheia com a mesma estrutura.
 */
export function Sheet({
  visible,
  onClose,
  title,
  footer,
  scroll = true,
  closeDisabled = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  footer?: ReactNode;
  scroll?: boolean;
  closeDisabled?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: theme.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <View style={styles.head}>
          <Text style={[TypeScale.heading, styles.title, { color: theme.foreground }]}>
            {title ?? ""}
          </Text>
          <Button
            variant="ghost"
            size="icon"
            icon="close"
            accessibilityLabel="Fechar"
            onPress={onClose}
            disabled={closeDisabled}
          />
        </View>
        <Body
          style={styles.flex}
          contentContainerStyle={scroll ? styles.body : undefined}
          keyboardShouldPersistTaps={scroll ? "handled" : undefined}
        >
          {scroll ? children : <View style={[styles.flex, styles.body]}>{children}</View>}
        </Body>
        {footer ? (
          <View
            style={[
              styles.footer,
              { borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, Spacing.three) },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: Radius.full,
    marginTop: Spacing.two,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: Spacing.four,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.one,
  },
  title: { flex: 1 },
  body: { padding: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, paddingBottom: 48 },
  footer: {
    flexDirection: "row",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
