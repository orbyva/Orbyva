import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  createDocument,
  fetchDocumentById,
  updateDocument,
  updateDocumentPaid,
} from "@/api/car/car";
import { DateField } from "@/components/DateField";
import { ChoiceChip } from "@/components/ChoiceChip";
import { ThemedView } from "@/components/themed-view";
import { Button, Field, Input } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { DOCUMENT_TYPE_LABELS } from "@/domain/car";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

export default function DocumentFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ vehicleId?: string; id?: string }>();
  const vehicleId =
    typeof params.vehicleId === "string" ? params.vehicleId : "";
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;
  const [type, setType] = useState("ipva");
  const [customType, setCustomType] = useState("");
  const [dueDate, setDueDate] = useState(getTodayIso());
  const [paid, setPaid] = useState(false);
  const [loading, setLoading] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: editId ? "Editar documento" : "Novo documento",
    });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void fetchDocumentById(editId)
      .then((row) => {
        if (cancelled || !row) return;
        setType(row.type);
        setCustomType(row.custom_type ?? "");
        setDueDate(row.due_date);
        setPaid(row.paid);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);


  async function onSave() {
    if (!vehicleId && !editId) {
      fail("Veículo não informado.");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateDocument({
          id: editId,
          type,
          custom_type: type === "other" ? customType.trim() || null : null,
          due_date: dueDate,
        });
        await updateDocumentPaid(editId, paid);
      } else {
        await createDocument({
          vehicle_id: vehicleId,
          type,
          custom_type: type === "other" ? customType.trim() || null : null,
          due_date: dueDate,
          paid,
        });
      }
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar o documento."));
    } finally {
      setSaving(false);
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Field label="Tipo">
            <View style={styles.chips}>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([id, label]) => (
                <ChoiceChip
                  key={id}
                  label={label}
                  active={type === id}
                  onPress={() => setType(id)}
                />
              ))}
            </View>
          </Field>
          {type === "other" ? (
            <Field label="Qual documento">
              <Input
                value={customType}
                onChangeText={setCustomType}
              />
            </Field>
          ) : null}
          <Field label="Vencimento">
            <DateField value={dueDate} onChange={setDueDate} />
          </Field>
          <ChoiceChip
            label={paid ? "Pago" : "Em aberto"}
            active={paid}
            onPress={() => setPaid((cur) => !cur)}
            style={{ alignSelf: "flex-start" }}
          />
          <Button
            label={editId ? "Salvar alterações" : "Salvar documento"}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
