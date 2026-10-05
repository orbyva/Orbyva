import { useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";

import { createConsultation } from "@/api/health/health";
import { DateField } from "@/components/DateField";
import { TimeField } from "@/components/TimeField";
import { ThemedView } from "@/components/themed-view";
import { Button, Field, Input } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

export default function ConsultFormScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(getTodayIso());
  const [dueTime, setDueTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "Nova consulta" });
  }, [navigation]);


  async function onSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      fail("Informe o que é a consulta.");
      return;
    }
    setSaving(true);
    try {
      await createConsultation({
        title: trimmed,
        due_date: dueDate,
        due_time: dueTime,
        description: notes,
      });
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar a consulta."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Field label="Consulta" required>
            <Input
              autoFocus
              placeholder="Clínico geral"
              value={title}
              onChangeText={setTitle}
            />
          </Field>
          <Field label="Data">
            <DateField value={dueDate} onChange={setDueDate} />
          </Field>
          <Field label="Horário">
            <TimeField value={dueTime} onChange={setDueTime} />
          </Field>
          <Field label="Notas">
            <Input
              placeholder="Opcional"
              value={notes}
              onChangeText={setNotes}
            />
          </Field>
          <Button
            label="Agendar consulta"
            disabled={saving}
            loading={saving}
            onPress={() => void onSave()}
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}


const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
});
