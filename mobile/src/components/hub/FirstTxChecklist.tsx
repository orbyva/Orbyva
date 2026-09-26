import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { fetchTransactionsQuery } from "@/api/finance/transactions";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import {
  isFirstBudgetDone,
  isFirstTxDone,
  isTourDone,
  markFirstBudgetDone,
  markFirstTxDone,
} from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";

export function FirstTxChecklist() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [hasTx, setHasTx] = useState(false);
  const [hasBudget, setHasBudget] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setVisible(false);
      return;
    }
    const tourDone = await isTourDone(user.id);
    if (!tourDone) {
      setVisible(false);
      return;
    }
    const result = await fetchTransactionsQuery({ page: 1, pageSize: 1 });
    const txOk = (result.total ?? result.data.length) > 0;
    setHasTx(txOk);
    if (txOk && !(await isFirstTxDone(user.id))) await markFirstTxDone(user.id);

    const { count } = await supabase
      .from("monthly_budget")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    const budgetOk = (count ?? 0) > 0;
    setHasBudget(budgetOk);
    if (budgetOk && !(await isFirstBudgetDone(user.id))) {
      await markFirstBudgetDone(user.id);
    }
    setVisible(!txOk || (!budgetOk && !(await isFirstBudgetDone(user.id))));
  }, [user?.id]);

  useEffect(() => {
    void refresh().catch(() => setVisible(false));
  }, [refresh]);

  if (!visible) return null;

  return (
    <Card style={styles.card}>
      <ThemedText type="smallBold">Primeiros passos</ThemedText>
      <View style={styles.row}>
        <ThemedText type="small">{hasTx ? "✓" : "○"} Primeira transação</ThemedText>
        {!hasTx ? (
          <Pressable onPress={() => router.push("/finance/form")}>
            <ThemedText type="linkPrimary">Registrar</ThemedText>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.row}>
        <ThemedText type="small">{hasBudget ? "✓" : "○"} Orçamento do mês</ThemedText>
        {!hasBudget ? (
          <Pressable onPress={() => router.push("/finance/budget")}>
            <ThemedText type="linkPrimary">Definir</ThemedText>
          </Pressable>
        ) : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={{ color: theme.textSecondary }}>
        Some sozinho quando os dois estiverem feitos.
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two, padding: Spacing.three },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});
