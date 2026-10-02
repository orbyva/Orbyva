import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from "react-native";

import { fetchReminderPreferences, upsertReminderPreference } from "@/api/health/health";
import { ChoiceChip } from "@/components/ChoiceChip";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TimeField } from "@/components/TimeField";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import {
  nextReminderLabel,
  REMINDER_ENTITY_DESCRIPTION,
  REMINDER_ENTITY_LABEL,
  REMINDER_FREQUENCY_LABEL,
  reminderRows,
  type ReminderRow,
} from "@/domain/health/reminder";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { ReminderFrequency } from "@/types/health";

const FREQUENCIES = Object.keys(REMINDER_FREQUENCY_LABEL) as ReminderFrequency[];

/** Cada mexida salva na hora (upsert por tipo), como o diálogo da web: não há botão "Salvar". */
export default function HealthRemindersScreen() {
  const theme = useTheme();
  const { fail } = useFeedback();
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<ReminderRow["entity_type"] | null>(null);

  useEffect(() => {
    void fetchReminderPreferences()
      .then((prefs) => setRows(reminderRows(prefs)))
      .catch((err) => fail(getErrorMessage(err, "Não foi possível carregar os lembretes.")))
      .finally(() => setLoading(false));
  }, [fail]);

  async function persist(next: ReminderRow) {
    const previous = rows;
    setRows((current) =>
      current.map((row) => (row.entity_type === next.entity_type ? next : row))
    );
    setSavingType(next.entity_type);
    try {
      const saved = await upsertReminderPreference(next.entity_type, {
        frequency: next.frequency,
        time_of_day: next.time_of_day,
        enabled: next.enabled,
      });
      setRows((current) =>
        current.map((row) =>
          row.entity_type === next.entity_type
            ? {
                ...next,
                last_notified_at: saved.last_notified_at ?? null,
                created_at: saved.created_at ?? null,
              }
            : row
        )
      );
    } catch (err) {
      setRows(previous);
      fail(getErrorMessage(err, "Não foi possível salvar o lembrete."));
    } finally {
      setSavingType(null);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">
          Os lembretes aparecem enquanto o Orbyva estiver aberto. Notificação com o app fechado ainda
          não está disponível.
        </ThemedText>
        {rows.map((row) => {
          const next = nextReminderLabel(row);
          return (
            <Card key={row.entity_type} style={styles.card}>
              <View style={styles.header}>
                <View style={styles.headerText}>
                  <ThemedText type="smallBold">{REMINDER_ENTITY_LABEL[row.entity_type]}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {REMINDER_ENTITY_DESCRIPTION[row.entity_type]}
                  </ThemedText>
                </View>
                <Switch
                  accessibilityLabel={REMINDER_ENTITY_LABEL[row.entity_type]}
                  value={row.enabled}
                  disabled={savingType === row.entity_type}
                  onValueChange={(enabled) => void persist({ ...row, enabled })}
                />
              </View>
              {row.enabled ? (
                <>
                  <View style={styles.chips}>
                    {FREQUENCIES.map((frequency) => (
                      <ChoiceChip
                        key={frequency}
                        label={REMINDER_FREQUENCY_LABEL[frequency]}
                        active={row.frequency === frequency}
                        onPress={() => void persist({ ...row, frequency })}
                      />
                    ))}
                  </View>
                  <TimeField
                    value={row.time_of_day}
                    onChange={(time_of_day) => void persist({ ...row, time_of_day })}
                    style={[styles.time, { borderColor: theme.backgroundSelected }]}
                  />
                  {next ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Próximo: {next}
                    </ThemedText>
                  ) : null}
                </>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  card: { gap: 10, padding: Spacing.three },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerText: { flex: 1, gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  time: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
});
