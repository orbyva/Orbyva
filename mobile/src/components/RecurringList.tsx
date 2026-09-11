import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { TypeIcon } from "@/components/TypeIcon";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/Card";
import {
  getRecurringActionCopy,
  getRemainingInfo,
} from "@/domain/recurring/copy";
import { formatInstallmentPlanSummary } from "@/domain/recurring/formatters";
import {
  isRecurringPaidInMonth,
  recurringInstallmentInMonth,
} from "@/domain/recurring/alerts";
import { useTheme } from "@/hooks/use-theme";
import { formatBRL, formatDateBR } from "@/lib/currency";
import type { Recurring } from "@/types/recurring";

export function RecurringList({
  items,
  year,
  month,
  lastPaidAtById,
  busyId,
  onToggleMonth,
  onToggleInstallment,
  onManage,
}: {
  items: Recurring[];
  year: number;
  month: number;
  lastPaidAtById: Record<string, string>;
  busyId: string | null;
  onToggleMonth: (rec: Recurring) => void;
  onToggleInstallment: (
    rec: Recurring,
    installmentNumber: number,
    paid: boolean
  ) => void;
  onManage?: (rec: Recurring) => void;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type="smallBold">Nenhuma recorrência neste mês</ThemedText>
        <ThemedText themeColor="textSecondary">
          Cadastre uma conta fixa ou compra parcelada, ou mude o mês.
        </ThemedText>
      </View>
    );
  }

  return (
    <Card>
      {items.map((item, index) => {
        const copy = getRecurringActionCopy(item);
        const plan = formatInstallmentPlanSummary(item);
        const remaining = getRemainingInfo(item);
        const monthInst = recurringInstallmentInMonth(item, year, month);
        const paidInMonth = isRecurringPaidInMonth(item, year, month);
        const open = !!expanded[item.id];
        const color = item.class?.type?.hex_color || "#64748B";
        const busy = busyId === item.id;

        return (
          <View
            key={item.id}
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
                  style={[styles.iconWrap, { backgroundColor: `${color}33` }]}
                >
                  <TypeIcon
                    name={item.class?.type?.lucide_icon}
                    color={color}
                    size={16}
                  />
                </View>
                <View style={styles.copy}>
                  <ThemedText numberOfLines={2}>
                    {item.description || item.class?.name || "·"}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    numberOfLines={1}
                  >
                    {item.class?.type?.name}
                    {item.class?.name ? ` · ${item.class.name}` : ""}
                  </ThemedText>
                  {lastPaidAtById[item.id] ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Pago em {formatDateBR(lastPaidAtById[item.id])}
                    </ThemedText>
                  ) : null}
                </View>
              </View>
              <ThemedText type="smallBold">{formatBRL(item.value)}</ThemedText>
            </View>
            {item.status === false ? (
              <ThemedText type="small" themeColor="textSecondary">
                Arquivada
              </ThemedText>
            ) : null}

            {plan ? (
              <View
                style={[
                  styles.plan,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText type="smallBold">{plan.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {plan.subtitle}
                </ThemedText>
                {remaining ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {remaining.paid}/{remaining.total} {copy.progressPaidLabel}
                    {" · resto "}
                    {formatBRL(remaining.remainingAmount)}
                  </ThemedText>
                ) : null}
              </View>
            ) : null}

            <View style={styles.actions}>
              {onManage ? (
                <Pressable
                  onPress={() => onManage(item)}
                  style={[
                    styles.ghost,
                    { borderColor: theme.backgroundSelected },
                  ]}
                >
                  <ThemedText type="small">Gerir</ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() =>
                  setExpanded((prev) => ({ ...prev, [item.id]: !open }))
                }
                style={[
                  styles.ghost,
                  { borderColor: theme.backgroundSelected },
                ]}
              >
                <ThemedText type="small">
                  {open ? "Ocultar parcelas" : "Ver parcelas"}
                </ThemedText>
              </Pressable>
              {monthInst ? (
                <Pressable
                  disabled={busy}
                  onPress={() => onToggleMonth(item)}
                  style={[
                    styles.pay,
                    {
                      backgroundColor: paidInMonth
                        ? theme.backgroundElement
                        : theme.primary,
                    },
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={paidInMonth ? undefined : styles.payLabel}
                  >
                    {paidInMonth ? "Desfazer" : copy.action}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>

            {open ? (
              <View
                style={[
                  styles.parcels,
                  { borderColor: theme.backgroundSelected },
                ]}
              >
                {typeof item.installments === "string" ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.installments}
                  </ThemedText>
                ) : Array.isArray(item.installments) ? (
                  item.installments.map((inst) => {
                    const paid = (item.paid_parcels || []).includes(inst.number);
                    return (
                      <View key={inst.number} style={styles.parcel}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {inst.number}
                        </ThemedText>
                        <ThemedText type="small" style={styles.parcelDate}>
                          {item.frequency === "Anual"
                            ? inst.dueDate.slice(0, 4)
                            : formatDateBR(inst.dueDate)}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {paid ? copy.doneBadge : copy.openBadge}
                        </ThemedText>
                        <Pressable
                          disabled={busy}
                          onPress={() =>
                            onToggleInstallment(item, inst.number, paid)
                          }
                          hitSlop={8}
                        >
                          <ThemedText type="linkPrimary">
                            {paid ? "Desfazer" : copy.action}
                          </ThemedText>
                        </Pressable>
                      </View>
                    );
                  })
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    Sem parcelas calculadas.
                  </ThemedText>
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
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
  plan: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  ghost: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pay: {
    minWidth: 108,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  payLabel: { color: "#0B0F1A" },
  parcels: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  parcel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  parcelDate: { flex: 1 },
});
