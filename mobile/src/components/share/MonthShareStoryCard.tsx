import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ShareMonthBackdrop,
  ShareStoryFooter,
  ShareStoryHeader,
} from "@/components/share/ShareStoryChrome";
import { SHARE_H, SHARE_W } from "@/components/share/shareStory";
import { monthLabel, monthRemainingVsPlan } from "@/domain/monthShare";
import { BRAND_COLORS } from "@/components/share/brandColors";
import { formatBRL } from "@/lib/currency";

export function MonthShareStoryCard({
  year,
  month,
  receita,
  despesa,
  budgetPlanned,
  onReady,
}: {
  year: number;
  month: number;
  receita: number;
  despesa: number;
  budgetPlanned?: number | null;
  onReady?: () => void;
}) {
  const leftover = monthRemainingVsPlan({ receita, despesa, budgetPlanned });
  const saldo = receita - despesa;
  const cards = [
    { title: "Receitas", value: formatBRL(receita), color: "#4ADE80" },
    { title: "Despesas", value: formatBRL(despesa), color: "#F87171" },
    {
      title: "Saldo",
      value: formatBRL(saldo),
      color: saldo >= 0 ? "#4ADE80" : "#F87171",
    },
    {
      title: leftover.label,
      value: formatBRL(leftover.value),
      color: leftover.value >= 0 ? "#4ADE80" : "#F87171",
    },
  ];

  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    const timer = setTimeout(() => readyRef.current?.(), 200);
    return () => clearTimeout(timer);
  }, [year, month, receita, despesa, budgetPlanned]);

  return (
    <View style={styles.root} collapsable={false}>
      <ShareMonthBackdrop />
      <ShareStoryHeader eyebrow="Fechamento do mês" />
      <Text style={styles.month}>{monthLabel(year, month)}</Text>
      <View style={styles.list}>
        {cards.map((card) => (
          <View key={card.title} style={styles.card}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={[styles.cardValue, { color: card.color }]}>
              {card.value}
            </Text>
          </View>
        ))}
      </View>
      <ShareStoryFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: SHARE_W,
    height: SHARE_H,
    backgroundColor: BRAND_COLORS.ink,
    overflow: "hidden",
  },
  month: {
    position: "absolute",
    left: 72,
    top: 248,
    color: BRAND_COLORS.paper,
    fontSize: 56,
    fontWeight: "800",
  },
  list: {
    position: "absolute",
    left: 72,
    right: 72,
    top: 360,
    gap: 24,
  },
  card: {
    height: 128,
    borderRadius: 28,
    backgroundColor: "rgba(248, 250, 252, 0.08)",
    paddingHorizontal: 32,
    justifyContent: "center",
    gap: 8,
  },
  cardTitle: {
    color: BRAND_COLORS.muted,
    fontSize: 24,
    fontWeight: "600",
  },
  cardValue: {
    fontSize: 44,
    fontWeight: "800",
  },
});
