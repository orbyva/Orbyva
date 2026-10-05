import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { Radius } from "@/constants/theme";
import { TypeIcon } from "@/components/TypeIcon";
import { ThemedText } from "@/components/themed-text";
import { Card, EmptyState } from "@/components/ui";
import {
  getRecurringActionCopy,
  getRemainingInfo,
} from "@/domain/recurring/copy";
import { formatInstallmentPlanSummary } from "@/domain/recurring/formatters";
import { linkLabel, normalizeRecurringLink } from "@/domain/recurring/links";
import {
  isRecurringPaidInMonth,
  recurringInstallmentInMonth,
} from "@/domain/recurring/alerts";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { openExternalUrl } from "@/lib/url";
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
      <EmptyState
        icon="repeat-outline"
        title="Nenhuma recorrência neste mês"
        description="Cadastre uma conta fixa ou compra parcelada, ou mude o mês."
      />
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
        const color = item.class?.type?.hex_color || theme.mutedForeground;
        const busy = busyId === item.id;
        const link = normalizeRecurringLink(item.link_url);
        const actionColor = copy.isReceive ? theme.success : theme.destructive;

        return (
          <View
            key={item.id}
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
                    themeColor="mutedForeground"
                    numberOfLines={1}
                  >
                    {item.class?.type?.name}
                    {item.class?.name ? ` · ${item.class.name}` : ""}
                  </ThemedText>
                  {lastPaidAtById[item.id] ? (
                    <ThemedText type="small" themeColor="mutedForeground">
                      Pago em {formatDateBR(lastPaidAtById[item.id])}
                    </ThemedText>
                  ) : null}
                  {link ? (
                    <Pressable
                      onPress={() => openExternalUrl(link)}
                      hitSlop={6}
                      style={styles.link}
                      accessibilityRole="link"
                      accessibilityLabel={`Abrir link de ${item.description || "recorrência"}`}
                    >
                      <Ionicons name="link-outline" size={14} color={theme.primary} />
                      <ThemedText
                        type="small"
                        numberOfLines={1}
                        style={[styles.linkText, { color: theme.primary }]}
                      >
                        {linkLabel(link)}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <ThemedText
                type="smallBold"
                style={[TypeScale.bodyStrong, { color: actionColor }]}
              >
                {formatBRL(item.value)}
              </ThemedText>
            </View>
            {item.status === false ? (
              <ThemedText type="small" themeColor="mutedForeground">
                Arquivada
              </ThemedText>
            ) : null}

            {plan ? (
              <View
                style={[
                  styles.plan,
                  { backgroundColor: theme.muted },
                ]}
              >
                <ThemedText type="smallBold">{plan.title}</ThemedText>
                <ThemedText type="small" themeColor="mutedForeground">
                  {plan.subtitle}
                </ThemedText>
                {remaining ? (
                  <ThemedText type="small" themeColor="mutedForeground">
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
                      ? theme.muted
                      : actionColor,
                  },
                ]}
              >
                <ThemedText
                  type="smallBold"
                  style={
                    paidInMonth ? undefined : { color: theme.primaryForeground }
                  }
                >
                  {paidInMonth
                    ? copy.isReceive
                      ? "Desfazer recebimento"
                      : "Desfazer pagamento"
                    : copy.action}
                </ThemedText>
              </Pressable>
            ) : null}

            <View style={styles.actions}>
              {onManage ? (
                <Pressable
                  onPress={() => onManage(item)}
                  style={[
                    styles.ghost,
                    { borderColor: theme.border },
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
                  { borderColor: theme.border },
                  open && { backgroundColor: theme.muted },
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
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
              >
                <View
                  style={[
                    styles.parcelHead,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <ThemedText type="small" themeColor="mutedForeground">
                    {remaining
                      ? `${remaining.paid}/${remaining.total} ${copy.progressPaidLabel} · resto ${formatBRL(remaining.remainingAmount)}`
                      : "Parcelas"}
                  </ThemedText>
                </View>
                {typeof item.installments === "string" ? (
                  <ThemedText
                    type="small"
                    themeColor="mutedForeground"
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
                            borderTopColor: theme.border,
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
                                : theme.muted,
                            },
                          ]}
                        >
                          <ThemedText
                            type="smallBold"
                            style={{
                              color: paid ? theme.success : theme.mutedForeground,
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
                                : theme.border,
                            },
                          ]}
                        >
                          <ThemedText
                            type="small"
                            style={{
                              color: paid ? theme.success : theme.mutedForeground,
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
                                ? theme.muted
                                : hexAlpha(actionColor, 0.14),
                            },
                          ]}
                        >
                          <ThemedText
                            type="smallBold"
                            style={{ color: paid ? theme.foreground : actionColor }}
                          >
                            {paid
                              ? copy.isReceive
                                ? "Desfazer recebimento"
                                : "Desfazer pagamento"
                              : copy.action}
                          </ThemedText>
                        </Pressable>
                      </View>
                    );
                  })
                ) : (
                  <ThemedText
                    type="small"
                    themeColor="mutedForeground"
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
  link: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  linkText: { flexShrink: 1 },
  plan: {
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  ghost: {
    flex: 1,
    height: 40,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pay: {
    height: 46,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  parcels: {
    borderWidth: 1,
    borderRadius: Radius.xl,
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
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  parcelDate: { flex: 1 },
  badge: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  parcelAction: {
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
});
