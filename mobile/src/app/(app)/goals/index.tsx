import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { createTransaction } from "@/api/finance/transactions";
import { fetchValueByNatureForMonth } from "@/api/finance/dashboard";
import {
  createRecurringApi,
  fetchRecurringTransactions,
} from "@/api/finance/recurring";
import {
  fetchGoals,
  sumGoalAporteFromLedger,
  updateGoalProgress,
} from "@/api/goals/goals";
import { fetchNotesLinkedToMany } from "@/api/notes/mentions";
import { ChipBar } from "@/components/ChipBar";
import { EntityNotesSection } from "@/components/notes/EntityNotesSection";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Radius, Spacing } from "@/constants/theme";
import {
  formatGoalProgress,
  getGoalProgress,
  GOAL_CATEGORY_LABELS,
} from "@/domain/goals";
import {
  buildGoalInstallmentDraft,
  clampGoalApplyAmount,
  evaluateGoalAgainstSurplus,
  getFinancialGoalInsight,
  goalMetaClassName,
  initialGoalInstallmentFields,
  installmentsToCoverRemaining,
  maxGoalApplyAmount,
  resolveSyncedGoalProgress,
} from "@/domain/goals/finance";
import { ensureGoalMetaClass } from "@/domain/goals/poupanca";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { GoalStatus, PersonalGoal } from "@/types/goals";
import type { Note } from "@/types/notes";

const STATUS_CHIPS: { id: GoalStatus | "all"; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "active", label: "Ativas" },
  { id: "completed", label: "Concluídas" },
];

export default function GoalsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { fail, ok } = useFeedback();
  const { bottomInset } = useAppShell();
  const [goals, setGoals] = useState<PersonalGoal[]>([]);
  const [monthSurplus, setMonthSurplus] = useState<number | null>(null);
  const [filter, setFilter] = useState<GoalStatus | "all">("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destinarGoal, setDestinarGoal] = useState<PersonalGoal | null>(null);
  const [destinarAmount, setDestinarAmount] = useState("");
  const [routineGoal, setRoutineGoal] = useState<PersonalGoal | null>(null);
  const [routineMonthly, setRoutineMonthly] = useState("");
  const [routineDueDay, setRoutineDueDay] = useState(String(new Date().getDate()));
  const [busy, setBusy] = useState(false);
  const [notesByGoal, setNotesByGoal] = useState<Record<string, Note[]>>({});
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    const now = new Date();
    const [list, nature] = await Promise.all([
      fetchGoals(),
      fetchValueByNatureForMonth(now.getFullYear(), now.getMonth() + 1).catch(
        () => null
      ),
    ]);
    setGoals(list);
    setNotesByGoal(
      await fetchNotesLinkedToMany(
        "goal",
        list.map((goal) => goal.id)
      ).catch(() => ({}))
    );
    setMonthSurplus(
      nature ? nature.receita_total - nature.despesa_total : null
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar as metas."));
          }
        })
        .finally(() => {
          if (!cancelled) {
            hasLoaded.current = true;
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setRefreshing(false);
    }
  }

  const visible = useMemo(
    () =>
      filter === "all"
        ? goals.filter((goal) => goal.status !== "cancelled")
        : goals.filter((goal) => goal.status === filter),
    [filter, goals]
  );

  const destinarFit =
    destinarGoal && monthSurplus != null
      ? evaluateGoalAgainstSurplus(destinarGoal, monthSurplus)
      : null;
  const destinarMax = destinarFit
    ? maxGoalApplyAmount(destinarFit.remaining, destinarFit.surplus)
    : 0;

  const routineDraft = useMemo(() => {
    if (!routineGoal) return null;
    const insight = getFinancialGoalInsight(routineGoal);
    const remaining =
      insight?.remaining ??
      Math.max(0, routineGoal.target_value - routineGoal.current_value);
    const monthly = Number(routineMonthly.replace(",", ".")) || 0;
    const installments = installmentsToCoverRemaining(remaining, monthly);
    return buildGoalInstallmentDraft(remaining, monthly, installments);
  }, [routineGoal, routineMonthly]);

  function openDestinar(goal: PersonalGoal) {
    if (monthSurplus == null) return;
    const fit = evaluateGoalAgainstSurplus(goal, monthSurplus);
    if (!fit || fit.remaining <= 0) return;
    const initial =
      fit.applyAmount > 0
        ? fit.applyAmount
        : maxGoalApplyAmount(fit.remaining, fit.surplus);
    setDestinarGoal(goal);
    setDestinarAmount(initial > 0 ? String(initial) : "");
  }

  function openRoutine(goal: PersonalGoal) {
    const fields = initialGoalInstallmentFields(goal);
    setRoutineDueDay(String(new Date().getDate()));
    setRoutineMonthly(fields.monthlyAmount > 0 ? String(fields.monthlyAmount) : "");
    setRoutineGoal(goal);
  }

  async function confirmDestinar() {
    if (!destinarGoal || !destinarFit || monthSurplus == null) return;
    const amount = clampGoalApplyAmount(
      Number(destinarAmount.replace(",", ".")) || 0,
      destinarFit.remaining,
      destinarFit.surplus
    );
    if (amount <= 0) {
      fail(`Informe um valor entre R$ 0,01 e ${formatBRL(destinarMax)}.`);
      return;
    }
    setBusy(true);
    try {
      const classId = await ensureGoalMetaClass(destinarGoal.title);
      await createTransaction({
        class_id: classId,
        value: amount,
        description: goalMetaClassName(destinarGoal.title),
        transaction_at: new Date().toISOString(),
      });
      const next =
        Math.round((destinarGoal.current_value + amount) * 100) / 100;
      await updateGoalProgress(
        destinarGoal.id,
        Math.min(destinarGoal.target_value, next)
      );
      ok(`${formatBRL(amount)} destinado à meta`);
      setDestinarGoal(null);
      await load();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível destinar o valor."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRoutine() {
    if (!routineGoal || !routineDraft) return;
    const monthly = routineDraft.monthlyAmount;
    const months = routineDraft.installments;
    const dueDay = Number.parseInt(routineDueDay, 10);
    if (monthly <= 0 || months <= 0) {
      fail("Informe o valor mensal.");
      return;
    }
    if (dueDay < 1 || dueDay > 31) {
      fail("Informe o dia do mês (1–31).");
      return;
    }
    setBusy(true);
    try {
      const classId = await ensureGoalMetaClass(routineGoal.title);
      const prefix = goalMetaClassName(routineGoal.title);
      const existing = await fetchRecurringTransactions();
      const already = existing.find(
        (row) =>
          ((row.description || "").toLowerCase().startsWith(prefix.toLowerCase()) ||
            (row.class?.name || "").toLowerCase() === prefix.toLowerCase()) &&
          row.status
      );
      if (already) {
        fail("Já existe uma recorrência dessa meta.");
        setRoutineGoal(null);
        return;
      }
      await createRecurringApi({
        class_id: classId,
        value: monthly,
        description: prefix,
        frequency: "Mensal",
        validity: null,
        due_day: dueDay,
        installment_count: months,
        payment_start_date: new Date().toISOString().slice(0, 10),
        status: true,
      });
      ok(`${formatBRL(monthly)} × ${months} em Recorrências`);
      setRoutineGoal(null);
    } catch (err) {
                      fail(getErrorMessage(err, "Não foi possível criar os aportes mensais."));
    } finally {
      setBusy(false);
    }
  }

  async function onSync(goal: PersonalGoal) {
    try {
      const summed = await sumGoalAporteFromLedger(goal.title);
      const resolved = resolveSyncedGoalProgress(
        goal.current_value,
        summed,
        goal.target_value
      );
      if (!resolved.foundLedger) {
        ok("Nenhum aporte nos lançamentos");
        return;
      }
      if (resolved.changed) {
        await updateGoalProgress(goal.id, resolved.next);
      }
      ok(`Progresso: ${formatBRL(resolved.next)}`);
      await load();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível sincronizar."));
    }
  }

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
      {loading && goals.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
            />
          }
        >
          <ChipBar options={STATUS_CHIPS} value={filter} onChange={setFilter} />
          {visible.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Nenhuma meta neste filtro.
            </ThemedText>
          ) : (
            visible.map((goal) => {
              const pct = getGoalProgress(goal);
              const insight = getFinancialGoalInsight(goal);
              const surplusFit =
                monthSurplus != null
                  ? evaluateGoalAgainstSurplus(goal, monthSurplus)
                  : null;
              const canDestinar =
                !!surplusFit &&
                surplusFit.remaining > 0 &&
                maxGoalApplyAmount(surplusFit.remaining, surplusFit.surplus) > 0;
              const canRoutine = !!insight && insight.remaining > 0;
              return (
                <Card key={goal.id} style={styles.card}>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/goals/form",
                        params: { id: goal.id },
                      })
                    }
                    style={styles.cardPress}
                  >
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      <ThemedText type="small" themeColor="textSecondary">
                        {GOAL_CATEGORY_LABELS[goal.category]}
                      </ThemedText>
                    </View>
                    <ThemedText type="subtitle">{goal.title}</ThemedText>
                    {goal.description ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {goal.description}
                      </ThemedText>
                    ) : null}
                    <View style={styles.progressRow}>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatGoalProgress(goal)}
                      </ThemedText>
                      <ThemedText type="smallBold">{pct}%</ThemedText>
                    </View>
                    <View
                      style={[
                        styles.track,
                        { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      <View
                        style={[
                          styles.fill,
                          {
                            width: `${pct}%`,
                            backgroundColor:
                              pct >= 100 ? theme.success : theme.primary,
                          },
                        ]}
                      />
                    </View>
                    {goal.deadline ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        Prazo {formatDateBR(goal.deadline)}
                      </ThemedText>
                    ) : null}
                  </Pressable>
                  <EntityNotesSection notes={notesByGoal[goal.id] ?? []} />
                  {insight ? (
                    <View
                      style={[
                        styles.finance,
                        { borderColor: `${theme.primary}33` },
                      ]}
                    >
                      <ThemedText type="smallBold">
                        Meta ← saldo do mês
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {surplusFit?.summary ?? insight.suggestion}
                      </ThemedText>
                      <View style={styles.actions}>
                        {canDestinar ? (
                          <Pressable
                            onPress={() => openDestinar(goal)}
                            style={styles.linkBtn}
                          >
                            <ThemedText type="linkPrimary">
                              Destinar valor
                            </ThemedText>
                          </Pressable>
                        ) : null}
                        {canRoutine ? (
                          <Pressable
                            onPress={() => openRoutine(goal)}
                            style={styles.linkBtn}
                          >
                            <ThemedText type="linkPrimary">
                              Aportes mensais
                            </ThemedText>
                          </Pressable>
                        ) : null}
                        <Pressable
                          onPress={() => void onSync(goal)}
                          style={styles.linkBtn}
                        >
                          <ThemedText type="small" themeColor="textSecondary">
                            Sincronizar
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal
        visible={destinarGoal != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDestinarGoal(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setDestinarGoal(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface }]}
            onPress={() => undefined}
          >
            <ThemedText type="smallBold">Destinar valor à meta</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {destinarGoal?.title}
              {destinarMax > 0 ? ` · até ${formatBRL(destinarMax)}` : ""}
            </ThemedText>
            <TextInput
              keyboardType="decimal-pad"
              value={destinarAmount}
              onChangeText={setDestinarAmount}
              placeholder="0,00"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
            />
            <Pressable
              disabled={busy}
              onPress={() => void confirmDestinar()}
              style={[styles.primary, { backgroundColor: theme.primary }]}
            >
              {busy ? (
                <ActivityIndicator color="#0B0F1A" />
              ) : (
                <ThemedText type="smallBold" style={styles.primaryLabel}>
                  Destinar
                </ThemedText>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={routineGoal != null}
        transparent
        animationType="fade"
        onRequestClose={() => setRoutineGoal(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setRoutineGoal(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface }]}
            onPress={() => undefined}
          >
            <ThemedText type="smallBold">Aportes mensais em Recorrências</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {routineGoal?.title}. Informe quanto guardar por mês até fechar a
              meta.
            </ThemedText>
            <TextInput
              keyboardType="decimal-pad"
              value={routineMonthly}
              onChangeText={setRoutineMonthly}
              placeholder="Valor mensal"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
            />
            <TextInput
              keyboardType="number-pad"
              value={routineDueDay}
              onChangeText={(value) =>
                setRoutineDueDay(value.replace(/\D/g, "").slice(0, 2))
              }
              placeholder="Dia do mês"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
            />
            {routineDraft ? (
              <ThemedText type="small" themeColor="textSecondary">
                {routineDraft.summary}
              </ThemedText>
            ) : null}
            <Pressable
              disabled={busy}
              onPress={() => void confirmRoutine()}
              style={[styles.primary, { backgroundColor: theme.primary }]}
            >
              {busy ? (
                <ActivityIndicator color="#0B0F1A" />
              ) : (
                <ThemedText type="smallBold" style={styles.primaryLabel}>
                  Criar aportes
                </ThemedText>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
  list: { padding: Spacing.four, gap: Spacing.three },
  card: { padding: Spacing.three, gap: 10 },
  cardPress: { gap: 8 },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  track: { height: 8, borderRadius: 999, overflow: "hidden" },
  fill: { height: 8, borderRadius: 999 },
  finance: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: "rgba(14,165,233,0.06)",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  linkBtn: { paddingVertical: 2 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(11,15,26,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  input: {
    height: 44,
    borderRadius: Radius.input,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  primary: {
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: { color: "#0B0F1A" },
});
