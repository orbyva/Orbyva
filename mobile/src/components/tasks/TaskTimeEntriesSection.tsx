import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { deleteTimeEntry, fetchEntriesForTask } from "@/api/tasks/timeEntries";
import { ThemedText } from "@/components/themed-text";
import { FormSection } from "@/components/ui";
import { Radius } from "@/constants/theme";
import {
  entryDurationMinutes,
  formatTimeOfDay,
  splitLocalDateTime,
} from "@/domain/tasks/timeEntryEdit";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { TaskTimeEntry } from "@/types/tasks";

import { TimeEntryEditor } from "./TimeEntryEditor";

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ""}` : `${m}min`;
}

export function TaskTimeEntriesSection({ taskId, reloadKey }: { taskId: string; reloadKey?: number }) {
  const theme = useTheme();
  const { fail, ok } = useFeedback();
  const [entries, setEntries] = useState<TaskTimeEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchEntriesForTask(taskId)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [taskId, reloadKey]);

  const totalMinutes = entries.reduce(
    (sum, entry) => sum + entryDurationMinutes(entry.started_at, entry.ended_at),
    0
  );

  function confirmDelete(entry: TaskTimeEntry) {
    Alert.alert("Excluir registro", "Apagar este tempo marcado?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteTimeEntry(entry.id);
              setEntries((cur) => cur.filter((row) => row.id !== entry.id));
              ok("Registro excluído");
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir."));
            }
          })();
        },
      },
    ]);
  }

  return (
    <FormSection
      title="Registros de tempo"
      defaultOpen={entries.length > 0}
      hint={entries.length > 0 ? `${entries.length} · ${formatMinutes(totalMinutes)}` : undefined}
    >
      {entries.length === 0 ? (
        <ThemedText type="small" themeColor="mutedForeground">
          Nenhum tempo marcado nesta tarefa.
        </ThemedText>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={[styles.row, { backgroundColor: theme.muted }]}>
            <View style={styles.head}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Editar registro"
                style={styles.copy}
                onPress={() => setEditingId((cur) => (cur === entry.id ? null : entry.id))}
              >
                <ThemedText type="smallBold">
                  {formatDateBR(splitLocalDateTime(entry.started_at).date)}
                </ThemedText>
                <ThemedText type="small" themeColor="mutedForeground">
                  {formatTimeOfDay(entry.started_at)} – {entry.ended_at ? formatTimeOfDay(entry.ended_at) : "em andamento"} ·{" "}
                  {formatMinutes(entryDurationMinutes(entry.started_at, entry.ended_at))}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Excluir registro"
                hitSlop={8}
                onPress={() => confirmDelete(entry)}
              >
                <Ionicons name="trash-outline" size={18} color={theme.destructive} />
              </Pressable>
            </View>
            {editingId === entry.id ? (
              <TimeEntryEditor
                entry={entry}
                onCancel={() => setEditingId(null)}
                onSaved={(updated) => {
                  setEntries((cur) => cur.map((row) => (row.id === updated.id ? updated : row)));
                  setEditingId(null);
                }}
              />
            ) : null}
          </View>
        ))
      )}
    </FormSection>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: Radius.lg, padding: 10, gap: 6 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  copy: { flex: 1, gap: 2 },
});
