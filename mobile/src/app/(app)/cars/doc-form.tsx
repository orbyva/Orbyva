import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
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
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FormButton } from "@/components/ui/FormButton";
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

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

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
              <TextInput
                style={inputStyle}
                value={customType}
                onChangeText={setCustomType}
              />
            </Field>
          ) : null}
          <Field label="Vencimento">
            <DateField value={dueDate} onChange={setDueDate} style={inputStyle} />
          </Field>
          <ChoiceChip
            label={paid ? "Pago" : "Em aberto"}
            active={paid}
            onPress={() => setPaid((cur) => !cur)}
            style={{ alignSelf: "flex-start" }}
          />
          <FormButton
            label={editId ? "Salvar alterações" : "Salvar documento"}
            tone="primary"
            disabled={saving}
            busy={saving}
            onPress={() => void onSave()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  field: { gap: 8 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: "center",
    fontSize: 16,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
});
