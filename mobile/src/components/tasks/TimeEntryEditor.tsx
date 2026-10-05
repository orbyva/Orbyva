import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { updateTimeEntry } from "@/api/tasks/timeEntries";
import { DateField } from "@/components/DateField";
import { ThemedText } from "@/components/themed-text";
import { TimeField } from "@/components/TimeField";
import { Button } from "@/components/ui";
import { buildTimeEntryUpdate, splitLocalDateTime } from "@/domain/tasks/timeEntryEdit";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { TaskTimeEntry } from "@/types/tasks";

export function TimeEntryEditor({
  entry,
  onSaved,
  onCancel,
}: {
  entry: TaskTimeEntry;
  onSaved: (updated: TaskTimeEntry) => void;
  onCancel: () => void;
}) {
  const { fail, ok } = useFeedback();
  const [start, setStart] = useState(() => splitLocalDateTime(entry.started_at));
  const [end, setEnd] = useState(() => (entry.ended_at ? splitLocalDateTime(entry.ended_at) : null));
  const [saving, setSaving] = useState(false);

  async function onSave() {
    const result = buildTimeEntryUpdate(start, end);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateTimeEntry(entry.id, result.value);
      ok("Registro atualizado");
      onSaved(updated);
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar o registro."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.box}>
      <ThemedText type="small" themeColor="mutedForeground">
        Início
      </ThemedText>
      <View style={styles.row}>
        <DateField style={styles.flex} value={start.date} onChange={(date) => setStart((cur) => ({ ...cur, date }))} />
        <TimeField style={styles.flex} value={start.time} onChange={(time) => setStart((cur) => ({ ...cur, time }))} />
      </View>
      {end ? (
        <>
          <ThemedText type="small" themeColor="mutedForeground">
            Fim
          </ThemedText>
          <View style={styles.row}>
            <DateField
              style={styles.flex}
              value={end.date}
              onChange={(date) => setEnd((cur) => (cur ? { ...cur, date } : cur))}
            />
            <TimeField
              style={styles.flex}
              value={end.time}
              onChange={(time) => setEnd((cur) => (cur ? { ...cur, time } : cur))}
            />
          </View>
        </>
      ) : (
        <ThemedText type="small" themeColor="mutedForeground">
          Em andamento — o fim é gravado ao parar o timer.
        </ThemedText>
      )}
      <View style={styles.row}>
        <Button
          label="Salvar"
          size="sm"
          loading={saving}
          disabled={saving}
          onPress={() => void onSave()}
          style={styles.flex}
        />
        <Button label="Cancelar" size="sm" variant="outline" onPress={onCancel} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, paddingTop: 4 },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
});
