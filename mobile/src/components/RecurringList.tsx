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
import { hexAlpha } from "@/lib/color";
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
        const actionColor = copy.isReceive ? theme.success : theme.danger;

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
              <ThemedText
                type="smallBold"
                style={{ color: actionColor, fontSize: 16 }}
              >
                {formatBRL(item.value)}
              </ThemedText>
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

            {monthInst ? (
              <Pressable
                disabled={busy}
                onPress={() => onToggleMonth(item)}
                style={[
                  styles.pay,
                  {
                    backgroundColor: paidInMonth
                      ? theme.backgroundElement
                      : actionColor,
                  },
                ]}
              >
                <ThemedText
                  type="smallBold"
                  style={
                    paidInMonth ? undefined : { color: "#FFFFFF", fontSize: 15 }
                  }
                >
                  {paidInMonth ? "Desfazer" : copy.action}
                </ThemedText>
              </Pressable>
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
                  <ThemedText type="small">Opções</ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() =>
                  setExpanded((prev) => ({ ...prev, [item.id]: !open }))
                }
                style={[
                  styles.ghost,
                  { borderColor: theme.backgroundSelected },
                  open && { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText type="small">
                  {open ? "Ocultar parcelas" : "Ver parcelas"}
                </ThemedText>
              </Pressable>
            </View>

            {open ? (
              <View
                style={[
                  styles.parcels,
                  {
                    borderColor: theme.backgroundSelected,
                    backgroundColor: theme.background,
                  },
                ]}
              >
                <View
                  style={[
                    styles.parcelHead,
                    { borderBottomColor: theme.backgroundSelected },
                  ]}
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    {remaining
                      ? `${remaining.paid}/${remaining.total} ${copy.progressPaidLabel} · resto ${formatBRL(remaining.remainingAmount)}`
                      : "Parcelas"}
                  </ThemedText>
                </View>
                {typeof item.installments === "string" ? (
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={styles.parcelPad}
                  >
                    {item.installments}
                  </ThemedText>
                ) : Array.isArray(item.installments) ? (
                  item.installments.map((inst, instIndex) => {
                    const paid = (item.paid_parcels || []).includes(inst.number);
                    return (
                      <View
                        key={inst.number}
                        style={[
                          styles.parcel,
                          instIndex > 0 && {
                            borderTopWidth: StyleSheet.hairlineWidth,
                            borderTopColor: theme.backgroundSelected,
                          },
                          paid && { opacity: 0.72 },
                        ]}
                      >
                        <View
                          style={[
                            styles.parcelNum,
                            {
                              backgroundColor: paid
                                ? hexAlpha(theme.success, 0.16)
                                : theme.backgroundElement,
                            },
                          ]}
                        >
                          <ThemedText
                            type="smallBold"
                            style={{
                              color: paid ? theme.success : theme.textSecondary,
                            }}
                          >
                            {inst.number}
                          </ThemedText>
                        </View>
                        <ThemedText type="small" style={styles.parcelDate}>
                          {item.frequency === "Anual"
                            ? inst.dueDate.slice(0, 4)
                            : formatDateBR(inst.dueDate)}
                        </ThemedText>
                        <View
                          style={[
                            styles.badge,
                            {
                              borderColor: paid
                                ? hexAlpha(theme.success, 0.4)
                                : theme.backgroundSelected,
                            },
                          ]}
                        >
                          <ThemedText
                            type="small"
                            style={{
                              color: paid ? theme.success : theme.textSecondary,
                            }}
                          >
                            {paid ? copy.doneBadge : copy.openBadge}
                          </ThemedText>
                        </View>
                        <Pressable
                          disabled={busy}
                          onPress={() =>
                            onToggleInstallment(item, inst.number, paid)
                          }
                          style={[
                            styles.parcelAction,
                            {
                              backgroundColor: paid
                                ? theme.backgroundElement
                                : hexAlpha(actionColor, 0.14),
                            },
                          ]}
                        >
                          <ThemedText
                            type="smallBold"
                            style={{ color: paid ? theme.text : actionColor }}
                          >
                            {paid ? "Desfazer" : copy.action}
                          </ThemedText>
                        </Pressable>
                      </View>
                    );
                  })
                ) : (
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={styles.parcelPad}
                  >
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
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  parcels: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  parcelHead: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  parcelPad: { paddingHorizontal: 12, paddingVertical: 12 },
  parcel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  parcelNum: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  parcelDate: { flex: 1 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  parcelAction: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
});
