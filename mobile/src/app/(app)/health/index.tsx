import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { loadHealthHome, markDoseTaken, upsertReminderPreference } from "@/api/health/health";
import { toggleHabitLog } from "@/api/habits/habits";
import { ChipBar } from "@/components/ChipBar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { ModuleSection } from "@/components/ui/ModuleSection";
import { Spacing } from "@/constants/theme";
import { frequencyLabel, getTodayIso } from "@/domain/habits";
import { formatRate } from "@/domain/health/adherence";
import { formatPosology, nextDoseSlot } from "@/domain/health/medication";
import {
  bmiCategory,
  computeBmi,
  deltaSincePrevious,
  formatMetricValue,
  latestByType,
  METRIC_LABEL,
  METRIC_TYPES,
  METRIC_UNIT,
} from "@/domain/health/metrics";
import {
  REMINDER_ENTITY_DESCRIPTION,
  REMINDER_ENTITY_LABEL,
  REMINDER_ENTITY_TYPES,
  REMINDER_FREQUENCY_LABEL,
} from "@/domain/health/reminder";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatDateTimeBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type {
  HealthHabitToday,
  HealthMetric,
  Medication,
  ReminderPreference,
} from "@/types/health";
import type { Task } from "@/types/tasks";

function nowHm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function HealthScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { fail, ok } = useFeedback();
  const { bottomInset } = useAppShell();
  const [nextDose, setNextDose] = useState<Task | null>(null);
  const [nextConsult, setNextConsult] = useState<Task | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [adherenceLabel, setAdherenceLabel] = useState<string | null>(null);
  const [doses, setDoses] = useState<Task[]>([]);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [reminders, setReminders] = useState<ReminderPreference[]>([]);
  const [healthHabits, setHealthHabits] = useState<HealthHabitToday[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<"today" | "care" | "more">("today");
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    const home = await loadHealthHome();
    setNextDose(home.nextMedicationDose);
    setNextConsult(home.nextConsultation);
    setMedications(home.medications);
    setDoses(home.doses);
    setMetrics(home.metrics);
    setReminders(home.reminders);
    setHealthHabits(home.healthHabits);
    setAdherenceLabel(
      home.adherence.total > 0
        ? `${formatRate(home.adherence.takenRate)} tomadas · ${formatRate(home.adherence.onTimeRate)} na hora`
        : null
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar a saúde."));
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

  async function onTake() {
    if (!nextDose) return;
    setBusy(true);
    try {
      await markDoseTaken(nextDose.id);
      ok("Dose marcada");
      await load();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível marcar a dose."));
    } finally {
      setBusy(false);
    }
  }

  async function onCheckIn(entry: HealthHabitToday) {
    const next = !entry.doneToday;
    setHealthHabits((rows) =>
      rows.map((row) =>
        row.habit.id === entry.habit.id ? { ...row, doneToday: next } : row
      )
    );
    try {
      await toggleHabitLog(entry.habit.id, getTodayIso(), next);
    } catch (err) {
      setHealthHabits((rows) =>
        rows.map((row) =>
          row.habit.id === entry.habit.id
            ? { ...row, doneToday: entry.doneToday }
            : row
        )
      );
      fail(getErrorMessage(err, "Não foi possível registrar o hábito."));
    }
  }

  async function onToggleReminder(entityType: ReminderPreference["entity_type"]) {
    const current = reminders.find((row) => row.entity_type === entityType);
    const enabled = !(current?.enabled ?? false);
    try {
      const next = await upsertReminderPreference(entityType, {
        enabled,
        frequency: current?.frequency ?? "daily",
        time_of_day: current?.time_of_day ?? "09:00",
      });
      setReminders((rows) => {
        const idx = rows.findIndex((row) => row.entity_type === entityType);
        if (idx < 0) return [...rows, next];
        const copy = [...rows];
        copy[idx] = next;
        return copy;
      });
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar o lembrete."));
    }
  }

  const today = getTodayIso();
  const clock = nowHm();
  const treatments = useMemo(
    () => [...medications].sort((a, b) => Number(b.active) - Number(a.active)),
    [medications]
  );
  const latest = useMemo(() => latestByType(metrics), [metrics]);
  const bmi = computeBmi(latest.weight?.value, latest.height?.value);
  const habitsDone = healthHabits.filter((row) => row.doneToday).length;

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
      {loading && medications.length === 0 && !nextDose && healthHabits.length === 0 ? (
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
          <ChipBar
            options={[
              { id: "today", label: "Hoje" },
              { id: "care", label: "Cuidados" },
              { id: "more", label: "Mais" },
            ]}
            value={section}
            onChange={setSection}
          />
          {section === "today" ? (
          <ModuleSection
            title="Hoje"
            icon="water-outline"
            tint="#0EA5E9"
            badge={
              healthHabits.length > 0
                ? `${habitsDone} de ${healthHabits.length}`
                : undefined
            }
            actionLabel="Novo"
            onAction={() =>
              router.push({ pathname: "/habits/form", params: { health: "1" } })
            }
          >
            {healthHabits.length === 0 ? (
              <ThemedText themeColor="textSecondary">
                Nenhum hábito de saúde. Crie água, alimentação etc. para marcar aqui.
              </ThemedText>
            ) : (
              healthHabits.map((entry) => (
                <Pressable
                  key={entry.habit.id}
                  onPress={() => void onCheckIn(entry)}
                  style={styles.row}
                >
                  <Ionicons
                    name={entry.doneToday ? "checkmark-circle" : "ellipse-outline"}
                    size={22}
                    color={entry.doneToday ? "#22A37A" : theme.textSecondary}
                  />
                  <View style={styles.rowCopy}>
                    <ThemedText type="smallBold">{entry.habit.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {frequencyLabel(entry.habit)}
                    </ThemedText>
                  </View>
                </Pressable>
              ))
            )}
          </ModuleSection>
          ) : null}

          {section === "more" ? (
          <ModuleSection
            title="Progresso"
            icon="pulse-outline"
            tint="#A855F7"
            actionLabel="Registrar"
            onAction={() => router.push("/health/metric-form")}
          >
            {bmi != null ? (
              <ThemedText type="smallBold">
                IMC {formatMetricValue(bmi)}
                {bmiCategory(bmi) ? ` · ${bmiCategory(bmi)}` : ""}
              </ThemedText>
            ) : null}
            {METRIC_TYPES.map((type) => {
              const row = latest[type];
              const delta = deltaSincePrevious(metrics, type);
              return (
                <View key={type} style={styles.metricRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {METRIC_LABEL[type]}
                  </ThemedText>
                  <ThemedText type="smallBold">
                    {row
                      ? `${formatMetricValue(row.value)} ${METRIC_UNIT[type]}`
                      : "—"}
                    {delta != null
                      ? ` (${delta > 0 ? "+" : ""}${formatMetricValue(delta)})`
                      : ""}
                  </ThemedText>
                </View>
              );
            })}
          </ModuleSection>
          ) : null}

          {section === "care" ? (
          <>
          <ModuleSection
            title="Medicações"
            icon="medkit-outline"
            tint="#22A37A"
            actionLabel="Nova"
            onAction={() => router.push("/health/form")}
          >
            {nextDose ? (
              <View style={styles.stack}>
                <ThemedText type="small" themeColor="textSecondary">
                  Próxima dose
                </ThemedText>
                <ThemedText type="smallBold">{nextDose.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {nextDose.due_date
                    ? formatDateTimeBR(
                        nextDose.due_date,
                        nextDose.dose_time ?? nextDose.due_time
                      )
                    : "Sem horário"}
                </ThemedText>
                <Pressable
                  disabled={busy}
                  onPress={() => void onTake()}
                  style={[styles.primary, { backgroundColor: theme.primary }]}
                >
                  {busy ? (
                    <ActivityIndicator color="#0B0F1A" />
                  ) : (
                    <ThemedText type="smallBold" style={styles.primaryLabel}>
                      Marcar tomada
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            ) : (
              <ThemedText themeColor="textSecondary">
                Nenhuma dose pendente a partir de hoje.
              </ThemedText>
            )}
            {adherenceLabel ? (
              <ThemedText type="small" themeColor="textSecondary">
                Últimos 30 dias: {adherenceLabel}
              </ThemedText>
            ) : null}
            {treatments.length === 0 ? (
              <ThemedText themeColor="textSecondary">
                Nenhuma medicação cadastrada.
              </ThemedText>
            ) : (
              treatments.map((med) => {
                const next = nextDoseSlot(med, today, clock);
                const medDoses = doses.filter((dose) => dose.medication_id === med.id);
                const taken = medDoses.filter((dose) => dose.status === "done").length;
                return (
                  <Pressable
                    key={med.id}
                    onPress={() =>
                      router.push({
                        pathname: "/health/form",
                        params: { id: med.id },
                      })
                    }
                    style={[
                      styles.medCard,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <Ionicons name="medkit-outline" size={16} color="#22A37A" />
                    <View style={styles.rowCopy}>
                      <ThemedText type="smallBold">{med.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatPosology(med)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {med.active
                          ? next
                            ? `Próxima: ${formatDateTimeBR(next.date, next.time)}`
                            : "Sem próxima dose na janela"
                          : "Encerrada"}
                        {medDoses.length > 0
                          ? ` · ${taken}/${medDoses.length} na janela`
                          : ""}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })
            )}
          </ModuleSection>

          <ModuleSection
            title="Consultas"
            icon="fitness-outline"
            tint="#0284C7"
            actionLabel="Nova"
            onAction={() => router.push("/health/consult-form")}
          >
            {nextConsult ? (
              <>
                <ThemedText type="smallBold">{nextConsult.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {nextConsult.due_date
                    ? formatDateTimeBR(nextConsult.due_date, nextConsult.due_time)
                    : "Sem data"}
                </ThemedText>
              </>
            ) : (
              <ThemedText themeColor="textSecondary">
                Nenhuma consulta agendada.
              </ThemedText>
            )}
          </ModuleSection>
          </>
          ) : null}

          {section === "more" ? (
          <ModuleSection title="Lembretes" icon="notifications-outline" tint="#F59E0B">
            <ThemedText type="small" themeColor="textSecondary">
              Preferência no app. Push nativo ainda não entra nesta fatia.
            </ThemedText>
            {REMINDER_ENTITY_TYPES.map((entityType) => {
              const pref = reminders.find((row) => row.entity_type === entityType);
              const on = Boolean(pref?.enabled);
              return (
                <Pressable
                  key={entityType}
                  onPress={() => void onToggleReminder(entityType)}
                  style={styles.row}
                >
                  <Ionicons
                    name={on ? "notifications" : "notifications-off-outline"}
                    size={18}
                    color={on ? "#F59E0B" : theme.textSecondary}
                  />
                  <View style={styles.rowCopy}>
                    <ThemedText type="smallBold">
                      {REMINDER_ENTITY_LABEL[entityType]}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {on
                        ? `${REMINDER_FREQUENCY_LABEL[pref?.frequency ?? "daily"]} · ${
                            pref?.time_of_day?.slice(0, 5) ?? "09:00"
                          }`
                        : REMINDER_ENTITY_DESCRIPTION[entityType]}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
            <Pressable onPress={() => router.push("/health/reminders")} style={styles.row}>
              <ThemedText type="linkPrimary">Frequência e horários</ThemedText>
            </Pressable>
            <Pressable onPress={() => router.push("/health/reminders")} style={styles.row}>
              <ThemedText type="linkPrimary">Frequência e horários</ThemedText>
            </Pressable>
          </ModuleSection>
          ) : null}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
  list: { padding: Spacing.four, gap: Spacing.three },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  rowCopy: { flex: 1, gap: 2 },
  stack: { gap: 6 },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 2,
  },
  medCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    padding: 10,
  },
  primary: {
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryLabel: { color: "#0B0F1A" },
});
