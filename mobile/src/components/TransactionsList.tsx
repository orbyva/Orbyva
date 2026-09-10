import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { TypeIcon } from "@/components/TypeIcon";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { formatBRL, formatDateBR } from "@/lib/currency";
import type { Transaction } from "@/types/finance";

function natureColor(name?: string | null): string {
  if (name === "Receita") return "#16A34A";
  if (name === "Investimento") return "#0F766E";
  return "#E11D48";
}

function NatureBadge({ nature }: { nature: string }) {
  const color = natureColor(nature);
  return (
    <View style={[styles.badge, { borderColor: `${color}55` }]}>
      <ThemedText type="small" style={{ color, fontSize: 12 }}>
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
      <View style={styles.empty}>
        <ThemedText type="smallBold">Nenhuma transação encontrada</ThemedText>
        <ThemedText themeColor="textSecondary">
          Adicione um lançamento ou ajuste os filtros de busca.
        </ThemedText>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.table,
        {
          borderColor: theme.backgroundSelected,
          backgroundColor: theme.background,
        },
      ]}
    >
      {transactions.map((tx, index) => {
        const nature = tx.class?.type?.nature?.name ?? "";
        const swatch = tx.class?.type?.hex_color || natureColor(nature);
        return (
          <View
            key={tx.id}
            style={[
              styles.row,
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.backgroundSelected,
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
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {tx.class?.type?.name}
                    {tx.class?.name ? ` · ${tx.class.name}` : ""}
                  </ThemedText>
                  {nature ? <NatureBadge nature={nature} /> : null}
                </View>
              </View>
              <ThemedText
                type="smallBold"
                style={{ color: natureColor(nature) }}
              >
                {formatBRL(tx.value)}
              </ThemedText>
            </View>
            <View style={styles.bottom}>
              <ThemedText type="small" themeColor="textSecondary">
                {formatDateBR(tx.transaction_at)}
              </ThemedText>
              <View style={styles.actions}>
                <Pressable
                  accessibilityLabel="Editar transação"
                  onPress={() => onEdit(tx)}
                  hitSlop={8}
                  style={styles.actionBtn}
                >
                  <Ionicons name="pencil-outline" size={18} color={theme.text} />
                </Pressable>
                <Pressable
                  accessibilityLabel="Excluir transação"
                  onPress={() => onDelete(tx)}
                  hitSlop={8}
                  style={styles.actionBtn}
                >
                  <Ionicons name="trash-outline" size={18} color="#E11D48" />
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  empty: { paddingVertical: 24, gap: 6, paddingHorizontal: 8 },
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
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
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
