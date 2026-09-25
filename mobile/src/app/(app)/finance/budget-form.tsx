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

import {
  createMonthlyBudgetApi,
  deleteMonthlyBudgetApi,
  updateMonthlyBudgetApi,
} from "@/api/finance/budget";
import { budgetMonthIso, fetchMonthlyBudgetSummary } from "@/api/finance/dashboard";
import { fetchDimensions } from "@/api/finance/dimensions";
import { fetchMostUsedClassIds } from "@/api/finance/transactions";
import { ClassSearchPicker } from "@/components/ClassSearchPicker";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { FormBlock } from "@/components/ui/FormSection";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { formatMoneyInput, moneyFromDigits } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { Dimension } from "@/types/dimensions";

const now = new Date();

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function BudgetFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    id?: string;
    year?: string;
    month?: string;
    typeId?: string;
    classId?: string;
    value?: string;
  }>();
  const editIdRaw = Number(firstParam(params.id));
  const editId = Number.isFinite(editIdRaw) && editIdRaw > 0 ? editIdRaw : null;
  const isEditing = editId != null;

  const year = Number(firstParam(params.year)) || now.getFullYear();
  const month = Number(firstParam(params.month)) || now.getMonth() + 1;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [frequentIds, setFrequentIds] = useState<number[]>([]);
  const [classId, setClassId] = useState<number | null>(
    Number(firstParam(params.classId)) || null
  );
  const [typeId, setTypeId] = useState<number | null>(
    Number(firstParam(params.typeId)) || null
  );
  const [typeLabel, setTypeLabel] = useState<string | null>(null);
  const [digits, setDigits] = useState(
    firstParam(params.value)
      ? String(Math.round(Number(firstParam(params.value)) * 100))
      : ""
  );
  const [applyAllMonths, setApplyAllMonths] = useState(false);
  const [parentOnly, setParentOnly] = useState(false);

  const value = moneyFromDigits(digits);
  const budgetMonth = budgetMonthIso(year, month);

  const load = useCallback(async () => {
    const [dims, frequent] = await Promise.all([
      fetchDimensions(),
      fetchMostUsedClassIds(12).catch(() => [] as number[]),
    ]);
    setDimensions(dims);
    setFrequentIds(frequent);
    if (!isEditing || editId == null) return;
    const rows = await fetchMonthlyBudgetSummary(budgetMonth);
    const row = rows.find((item) => item.id === editId);
    if (!row) throw new Error("Orçamento não encontrado.");
    setTypeId(row.type_id);
    setClassId(row.class_id);
    setParentOnly(row.class_id == null);
    setTypeLabel(row.type_name);
    setDigits(String(Math.round(Number(row.planned_value) * 100)));
  }, [budgetMonth, editId, isEditing]);

  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? "Editar orçamento" : "Novo orçamento",
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

  async function onSave() {
    if (!parentOnly && (!classId || !typeId)) {
      setError("Selecione a categoria.");
      return;
    }
    if (parentOnly && !typeId) {
      setError("Categoria inválida.");
      return;
    }
    if (value == null || value <= 0) {
      setError("Informe um valor planejado.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        type_id: typeId,
        class_id: parentOnly ? null : classId,
        budget_month: budgetMonth,
        planned_value: value,
      };
      if (isEditing && editId != null) {
        await updateMonthlyBudgetApi({ id: editId, ...payload });
      } else if (applyAllMonths) {
        await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            createMonthlyBudgetApi({
              ...payload,
              budget_month: budgetMonthIso(year, i + 1),
            })
          )
        );
      } else {
        await createMonthlyBudgetApi(payload);
      }
      router.back();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível salvar o orçamento."));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!isEditing || editId == null) return;
    Alert.alert(
      "Excluir teto?",
      parentOnly
        ? "Exclui também os tetos das subcategorias deste mês."
        : "Esta ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                await deleteMonthlyBudgetApi(editId);
                router.back();
              } catch (err) {
                setError(
                  getErrorMessage(err, "Não foi possível excluir o orçamento.")
                );
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
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Banner message={error} />

          <FormBlock title="Classificação">
          {parentOnly ? (
            <Field label="Categoria">
              <ThemedText type="smallBold">{typeLabel ?? "Categoria"}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Teto da categoria (sem subcategoria).
              </ThemedText>
            </Field>
          ) : (
            <Field label="Categoria" required hint="Busque categoria ou subcategoria.">
              <ClassSearchPicker
                dimensions={dimensions}
                value={classId}
                frequentIds={frequentIds}
                onChange={(opt) => {
                  setClassId(opt?.id ?? null);
                  setTypeId(opt?.typeId ?? null);
                }}
              />
            </Field>
          )}
          </FormBlock>

          <FormBlock title="Detalhes">
          <Field label="Valor planejado" required>
            <TextInput
              keyboardType="number-pad"
              placeholder="0,00"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={value != null ? formatMoneyInput(value) : ""}
              onChangeText={(raw) => setDigits(raw.replace(/\D/g, ""))}
            />
          </Field>

          {!isEditing ? (
            <Pressable
              onPress={() => setApplyAllMonths((cur) => !cur)}
              style={[
                styles.toggle,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: applyAllMonths
                      ? theme.primary
                      : theme.backgroundSelected,
                  },
                ]}
              />
              <View style={styles.toggleCopy}>
                <ThemedText type="smallBold">
                  Replicar nos 12 meses de {year}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Cria o mesmo valor em todos os meses deste ano.
                </ThemedText>
              </View>
            </Pressable>
          ) : null}
          </FormBlock>

          <FormButton
            label={
              isEditing
                ? "Salvar alterações"
                : applyAllMonths
                  ? `Salvar nos 12 meses de ${year}`
                  : "Adicionar orçamento"
            }
            tone="primary"
            disabled={saving}
            busy={saving}
            onPress={() => void onSave()}
          />

          {isEditing ? (
            <FormButton
              label="Excluir teto"
              tone="danger"
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
  hint,
  children,
}: {
  label: string;
  required?: boolean;
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
    fontSize: 16,
  },
  toggle: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 12,
    padding: 14,
  },
  toggleCopy: { flex: 1, gap: 2 },
  dot: { width: 18, height: 18, borderRadius: 9, marginTop: 2 },
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
  danger: { alignItems: "center", paddingVertical: 12 },
  dangerLabel: { color: "#E11D48" },
});
