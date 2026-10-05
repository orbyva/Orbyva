import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
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
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, Field, FormBlock, Input } from "@/components/ui";
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
            <Input
              keyboardType="number-pad"
              placeholder="0,00"
              invalid={Boolean(fieldErrors.value)}
              value={value != null ? formatMoneyInput(value) : ""}
              onChangeText={(raw) => setDigits(raw.replace(/\D/g, ""))}
            />
          </Field>

          <Field label="Data" required error={fieldErrors.transaction_at}>
            <DateField
              value={dateIso}
              onChange={setDateIso}
              invalid={Boolean(fieldErrors.transaction_at)}
            />
          </Field>

          <Field label="Descrição" required error={fieldErrors.description}>
            <Input
              placeholder="Ex: Supermercado, Salário..."
              invalid={Boolean(fieldErrors.description)}
              value={description}
              onChangeText={setDescription}
            />
          </Field>
          </FormBlock>

          <Button
            label={isEditing ? "Salvar alterações" : "Adicionar transação"}
            size="lg"
            loading={saving}
            onPress={() => void onSave()}
          />

          {isEditing ? (
            <Button
              label="Excluir transação"
              variant="destructive"
              disabled={saving}
              onPress={onDelete}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
});
