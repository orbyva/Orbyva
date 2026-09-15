import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { fetchDimensions } from "@/api/finance/dimensions";
import {
  createTransaction,
  deleteTransaction,
  fetchMostUsedClassIds,
  fetchTransactionById,
  todayIsoDate,
  updateTransaction,
} from "@/api/finance/transactions";
import { ClassSearchPicker } from "@/components/ClassSearchPicker";
import { DateField } from "@/components/DateField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { FormBlock } from "@/components/ui/FormSection";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  formatMoneyInput,
  moneyFromDigits,
} from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { Dimension } from "@/types/dimensions";

export default function TransactionFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id ? Number(params.id) : null;
  const isEditing = Number.isFinite(editId) && editId != null && editId > 0;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [frequentIds, setFrequentIds] = useState<number[]>([]);

  const [classId, setClassId] = useState<number | null>(null);
  const [digits, setDigits] = useState("");
  const [description, setDescription] = useState("");
  const [dateIso, setDateIso] = useState(todayIsoDate());

  const load = useCallback(async () => {
    setError(null);
    const [dims, frequent] = await Promise.all([
      fetchDimensions(),
      fetchMostUsedClassIds(12).catch(() => [] as number[]),
    ]);
    setDimensions(dims);
    setFrequentIds(frequent);
    if (!isEditing || editId == null) return;
    const tx = await fetchTransactionById(editId);
    if (!tx) throw new Error("Transação não encontrada.");
    setClassId(tx.class.id);
    const cents = Math.round(Number(tx.value) * 100);
    setDigits(String(cents));
    setDescription(tx.description ?? "");
    setDateIso(tx.transaction_at.slice(0, 10));
  }, [editId, isEditing]);

  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? "Editar transação" : "Nova transação",
    });
  }, [isEditing, navigation]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir o formulário."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const value = moneyFromDigits(digits);

  async function onSave() {
    const next: Record<string, string> = {};
    if (!classId) next.class_id = "Selecione a categoria.";
    if (value == null || value <= 0) next.value = "Informe um valor válido.";
    if (!description.trim()) next.description = "Informe a descrição.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      next.transaction_at = "Selecione uma data válida.";
    }
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      setError("Revise os campos destacados para salvar.");
      return;
    }
    setFieldErrors({});
    setError(null);
    setSaving(true);
    try {
      const payload = {
        class_id: classId!,
        value: value!,
        description: description.trim(),
        transaction_at: dateIso,
      };
      if (isEditing && editId != null) {
        await updateTransaction(editId, payload);
      } else {
        await createTransaction(payload);
      }
      router.back();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          isEditing ? "Falha ao editar transação." : "Falha ao adicionar transação."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!isEditing || editId == null) return;
    Alert.alert(
      "Excluir transação?",
      `${description || "Esta transação"} · ${
        value != null ? formatMoneyInput(value) : ""
      }. Esta ação não pode ser desfeita.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                await deleteTransaction(editId);
                router.back();
              } catch (err) {
                setError(getErrorMessage(err, "Falha ao excluir transação."));
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ]
    );
  }

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

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
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Banner message={error} />

          <FormBlock
            title="Classificação"
            subtitle="Natureza e subcategoria definem relatórios e orçamento."
          >
          <Field
            label="Categoria"
            required
            error={fieldErrors.class_id}
            hint="Busque por nome, categoria ou natureza."
          >
            <ClassSearchPicker
              dimensions={dimensions}
              value={classId}
              frequentIds={frequentIds}
              onChange={(opt) => setClassId(opt?.id ?? null)}
            />
          </Field>
          </FormBlock>

          <FormBlock title="Detalhes">
          <Field label="Valor" required error={fieldErrors.value}>
            <TextInput
              keyboardType="number-pad"
              placeholder="0,00"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={value != null ? formatMoneyInput(value) : ""}
              onChangeText={(raw) => setDigits(raw.replace(/\D/g, ""))}
            />
          </Field>

          <Field label="Data" required error={fieldErrors.transaction_at}>
            <DateField value={dateIso} onChange={setDateIso} style={inputStyle} />
          </Field>

          <Field label="Descrição" required error={fieldErrors.description}>
            <TextInput
              placeholder="Ex: Supermercado, Salário..."
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={description}
              onChangeText={setDescription}
            />
          </Field>
          </FormBlock>

          <FormButton
            label={isEditing ? "Salvar alterações" : "Adicionar transação"}
            tone="primary"
            disabled={saving}
            busy={saving}
            onPress={() => void onSave()}
          />

          {isEditing ? (
            <FormButton
              label="Excluir transação"
              tone="danger"
              disabled={saving}
              onPress={onDelete}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
        {required ? " *" : ""}
      </ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
      {children}
      {error ? <ThemedText style={styles.fieldError}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  field: { gap: 6 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: "center",
    fontSize: 16,
  },
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
  error: { color: "#E11D48", textAlign: "center" },
  fieldError: { color: "#E11D48", fontSize: 13 },
});
