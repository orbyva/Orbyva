import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { Radius } from "@/constants/theme";
import { TypeIcon } from "@/components/TypeIcon";
import { ThemedText } from "@/components/themed-text";
import { Card, EmptyState } from "@/components/ui";
import { natureTone } from "@/domain/ui/semanticTone";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
import { formatBRL, formatDateBR } from "@/lib/currency";
import type { Transaction } from "@/types/finance";

function NatureBadge({ nature }: { nature: string }) {
  const color = useTheme()[natureTone(nature)];
  return (
    <View style={[styles.badge, { borderColor: hexAlpha(color, 0.33) }]}>
      <ThemedText type="caption" style={{ color }}>
        {nature}
      </ThemedText>
    </View>
  );
}

export function TransactionsList({
  transactions,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const theme = useTheme();

  if (transactions.length === 0) {
    return (
      <EmptyState
        icon="receipt-outline"
        title="Nenhuma transação encontrada"
        description="Adicione um lançamento ou ajuste os filtros de busca."
      />
    );
  }

  return (
    <Card>
      {transactions.map((tx, index) => {
        const nature = tx.class?.type?.nature?.name ?? "";
        const swatch = tx.class?.type?.hex_color || theme[natureTone(nature)];
        return (
          <View
            key={tx.id}
            style={[
              styles.row,
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border,
              },
            ]}
          >
            <View style={styles.top}>
              <View style={styles.identity}>
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: `${swatch}33` },
                  ]}
                >
                  <TypeIcon
                    name={tx.class?.type?.lucide_icon}
                    color={swatch}
                    size={16}
                  />
                </View>
                <View style={styles.copy}>
                  <ThemedText numberOfLines={2}>
                    {tx.description || "·"}
                  </ThemedText>
                  <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1}>
                    {tx.class?.type?.name}
                    {tx.class?.name ? ` · ${tx.class.name}` : ""}
                  </ThemedText>
                  {nature ? <NatureBadge nature={nature} /> : null}
                </View>
              </View>
              <ThemedText
                type="smallBold"
                style={{ color: theme[natureTone(nature)] }}
              >
                {formatBRL(tx.value)}
              </ThemedText>
            </View>
            <View style={styles.bottom}>
              <ThemedText type="small" themeColor="mutedForeground">
                {formatDateBR(tx.transaction_at)}
              </ThemedText>
              <View style={styles.actions}>
                <Pressable
                  accessibilityLabel="Editar transação"
                  onPress={() => onEdit(tx)}
                  hitSlop={8}
                  style={styles.actionBtn}
                >
                  <Ionicons name="create-outline" size={18} color={theme.foreground} />
                </Pressable>
                <Pressable
                  accessibilityLabel="Excluir transação"
                  onPress={() => onDelete(tx)}
                  hitSlop={8}
                  style={styles.actionBtn}
                >
                  <Ionicons name="trash-outline" size={18} color={theme.destructive} />
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  identity: { flex: 1, minWidth: 0, flexDirection: "row", gap: 10 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
