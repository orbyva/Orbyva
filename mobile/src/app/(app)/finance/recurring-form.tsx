import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchDimensions } from "@/api/finance/dimensions";
import {
  createRecurringApi,
  deleteRecurringApi,
  fetchRecurringById,
  updateRecurringApi,
} from "@/api/finance/recurring";
import { fetchMostUsedClassIds, todayIsoDate } from "@/api/finance/transactions";
import { ClassSearchPicker } from "@/components/ClassSearchPicker";
import { DateField } from "@/components/DateField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, Field, FormBlock, Input } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import {
  buildFixedYearPlan,
  countMonthsThroughYearEnd,
  isFixedRecurringPlan,
  MAX_SPLIT_INSTALLMENTS,
  normalizeFixedFrequency,
} from "@/domain/recurring/constants";
import {
  isHttpLink,
  normalizeRecurringLink,
  RECURRING_LINK_HINT,
} from "@/domain/recurring/links";
import {
  getTotalFromInstallments,
  splitInstallmentValue,
} from "@/domain/recurring/values";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatBRL, formatMoneyInput, moneyFromDigits } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { Dimension } from "@/types/dimensions";
import type { RecurringCreateRequest } from "@/types/recurring";

type PlanMode = "fixed" | "split";

function withScheduleDefaults(
  rec: RecurringCreateRequest,
  overrides: Partial<RecurringCreateRequest> = {}
): RecurringCreateRequest {
  return {
    ...rec,
    payment_start_date: rec.payment_start_date ?? todayIsoDate(),
    due_day: rec.due_day ?? 10,
    frequency: rec.frequency || "Mensal",
    ...overrides,
  };
}

function applyFixedYearFields(
  rec: RecurringCreateRequest
): RecurringCreateRequest {
  const start = rec.payment_start_date ?? todayIsoDate();
  const frequency = normalizeFixedFrequency(rec.frequency);
  const plan = buildFixedYearPlan(start, frequency);
  return withScheduleDefaults(rec, {
    payment_start_date: start,
    installment_count: plan.installment_count,
    validity: plan.validity,
    frequency,
  });
}

function defaultRecurring(): RecurringCreateRequest {
  return applyFixedYearFields({
    class_id: 0,
    value: 0,
    description: "",
    frequency: "Mensal",
    validity: null,
    due_day: 10,
    installment_count: null,
    payment_start_date: todayIsoDate(),
    status: true,
    link_url: null,
  });
}

export default function RecurringFormScreen() {
  const theme = useTheme();
  const { fail } = useFeedback();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = Array.isArray(params.id) ? params.id[0] : params.id;
  const isEditing = Boolean(editId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [frequentIds, setFrequentIds] = useState<number[]>([]);
  const [rec, setRec] = useState<RecurringCreateRequest>(defaultRecurring);
  const [planMode, setPlanMode] = useState<PlanMode>("fixed");
  const [valueDigits, setValueDigits] = useState("");
  const [totalDigits, setTotalDigits] = useState("");

  const isSplit = planMode === "split";
  const isAnnualFixed =
    !isSplit && normalizeFixedFrequency(rec.frequency) === "Anual";
  const value = moneyFromDigits(valueDigits);
  const totalValue = moneyFromDigits(totalDigits);

  const load = useCallback(async () => {
    const [dims, frequent] = await Promise.all([
      fetchDimensions(),
      fetchMostUsedClassIds(12).catch(() => [] as number[]),
    ]);
    setDimensions(dims);
    setFrequentIds(frequent);
    if (!editId) return;
    const existing = await fetchRecurringById(editId);
    if (!existing) throw new Error("Recorrência não encontrada.");
    const payload: RecurringCreateRequest = {
      class_id: existing.class?.id ?? 0,
      value: existing.value,
      description: existing.description,
      frequency: existing.frequency,
      validity: existing.validity,
      due_day: existing.due_day,
      installment_count: existing.installment_count,
      payment_start_date: existing.payment_start_date,
      status: existing.status,
      link_url: existing.link_url ?? null,
    };
    const split = !isFixedRecurringPlan(existing);
    setPlanMode(split ? "split" : "fixed");
    setRec(payload);
    setValueDigits(String(Math.round(Number(existing.value) * 100)));
    if (split && existing.installment_count) {
      const total = getTotalFromInstallments(
        existing.value,
        existing.installment_count
      );
      setTotalDigits(String(Math.round(total * 100)));
    }
  }, [editId]);

  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? "Editar recorrência" : "Nova recorrência",
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

  const installmentValue =
    isSplit &&
    totalValue != null &&
    totalValue > 0 &&
    rec.installment_count &&
    rec.installment_count > 0
      ? splitInstallmentValue(totalValue, rec.installment_count)
      : null;

  const fixedPreview = useMemo(() => {
    if (isSplit) return null;
    const start = rec.payment_start_date ?? todayIsoDate();
    const year = start.slice(0, 4);
    const frequency = normalizeFixedFrequency(rec.frequency);
    if (frequency === "Anual") return { kind: "annual" as const, year };
    return {
      kind: "monthly" as const,
      count: countMonthsThroughYearEnd(start),
      year,
    };
  }, [isSplit, rec.payment_start_date, rec.frequency]);

  function switchToFixed() {
    setPlanMode("fixed");
    setTotalDigits("");
    setRec((cur) => applyFixedYearFields(cur));
  }

  function switchToSplit() {
    setPlanMode("split");
    setRec((cur) =>
      withScheduleDefaults(cur, {
        installment_count:
          cur.installment_count &&
          !isFixedRecurringPlan(cur) &&
          cur.installment_count <= MAX_SPLIT_INSTALLMENTS
            ? cur.installment_count
            : 12,
        validity: null,
        frequency: "Mensal",
      })
    );
  }

  async function onSave() {
    if (!rec.class_id) {
      fail("Selecione a categoria.");
      return;
    }
    if (!rec.description.trim()) {
      fail("Informe a descrição.");
      return;
    }
    if (!rec.payment_start_date) {
      fail("Informe o início do pagamento.");
      return;
    }
    if (!rec.due_day || rec.due_day < 1 || rec.due_day > 31) {
      fail("Informe o dia de vencimento (1 a 31).");
      return;
    }

    if (isSplit) {
      if (!rec.installment_count || rec.installment_count < 1) {
        fail("Informe o número de parcelas.");
        return;
      }
      if (rec.installment_count > MAX_SPLIT_INSTALLMENTS) {
        fail(
          `Use no máximo ${MAX_SPLIT_INSTALLMENTS} parcelas, ou escolha Mensal fixa.`
        );
        return;
      }
      if (totalValue == null || totalValue <= 0) {
        fail("Informe o valor total.");
        return;
      }
    } else if (value == null || value <= 0) {
      fail("Informe um valor válido.");
      return;
    }

    const link = normalizeRecurringLink(rec.link_url);
    if (link && !isHttpLink(link)) {
      fail(RECURRING_LINK_HINT);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const payload = isSplit
        ? {
            ...rec,
            link_url: link,
            validity: null,
            frequency: "Mensal",
            installment_count: rec.installment_count!,
            value: splitInstallmentValue(totalValue!, rec.installment_count!),
          }
        : applyFixedYearFields({ ...rec, value: value!, link_url: link });
      if (isEditing && editId) {
        await updateRecurringApi(editId, payload);
      } else {
        await createRecurringApi(payload);
      }
      router.back();
    } catch (err) {
      fail(
        getErrorMessage(
          err,
          isEditing
            ? "Falha ao editar recorrência."
            : "Falha ao adicionar recorrência."
        )
      );
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
          <Banner message={error} />

          <View style={styles.modeRow}>
            <Pressable
              onPress={switchToFixed}
              style={[
                styles.modeBtn,
                {
                  backgroundColor: !isSplit
                    ? theme.primary
                    : theme.muted,
                },
              ]}
            >
              <ThemedText
                type="smallBold"
                themeColor={!isSplit ? "primaryForeground" : undefined}
              >
                Mensal fixa
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={switchToSplit}
              style={[
                styles.modeBtn,
                {
                  backgroundColor: isSplit
                    ? theme.primary
                    : theme.muted,
                },
              ]}
            >
              <ThemedText
                type="smallBold"
                themeColor={isSplit ? "primaryForeground" : undefined}
              >
                Parcelada (Nx)
              </ThemedText>
            </Pressable>
          </View>

          <FormBlock title="Classificação">
          <Field label="Categoria" required>
            <ClassSearchPicker
              dimensions={dimensions}
              value={rec.class_id || null}
              frequentIds={frequentIds}
              onChange={(opt) =>
                setRec((cur) => ({ ...cur, class_id: opt?.id ?? 0 }))
              }
            />
          </Field>
          </FormBlock>

          <FormBlock title="Detalhes">
          <Field label="Descrição" required>
            <Input
              placeholder="Ex: Cartão Nubank, Aluguel..."
              value={rec.description}
              onChangeText={(description) =>
                setRec((cur) => ({ ...cur, description }))
              }
            />
          </Field>

          <Field
            label={
              isSplit
                ? "Valor total"
                : isAnnualFixed
                  ? "Valor anual"
                  : "Valor mensal"
            }
            required
            hint={
              isSplit
                ? "Soma de todas as parcelas"
                : isAnnualFixed
                  ? "Cobrado uma vez no ano"
                  : "Cobrado todo mês"
            }
          >
            <Input
              keyboardType="number-pad"
              placeholder="0,00"
              value={
                isSplit
                  ? totalValue != null
                    ? formatMoneyInput(totalValue)
                    : ""
                  : value != null
                    ? formatMoneyInput(value)
                    : ""
              }
              onChangeText={(raw) => {
                const digits = raw.replace(/\D/g, "");
                if (isSplit) setTotalDigits(digits);
                else setValueDigits(digits);
              }}
            />
          </Field>

          <Field label="Link" hint="Onde se paga, por exemplo">
            <Input
              placeholder="https://"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={rec.link_url ?? ""}
              onChangeText={(link_url) =>
                setRec((cur) => ({ ...cur, link_url }))
              }
            />
          </Field>
          </FormBlock>

          <FormBlock title="Agenda">
          {isSplit ? (
            <Field label="Nº de parcelas" required>
              <Input
                keyboardType="number-pad"
                placeholder="Ex: 12"
                value={rec.installment_count ? String(rec.installment_count) : ""}
                onChangeText={(raw) => {
                  const n = raw.replace(/\D/g, "");
                  setRec((cur) => ({
                    ...cur,
                    installment_count: n ? Number(n) : null,
                    validity: null,
                    frequency: "Mensal",
                  }));
                }}
              />
            </Field>
          ) : (
            <Field label="Frequência" required>
              <View style={styles.modeRow}>
                {(["Mensal", "Anual"] as const).map((freq) => {
                  const active = normalizeFixedFrequency(rec.frequency) === freq;
                  return (
                    <Pressable
                      key={freq}
                      onPress={() =>
                        setRec((cur) =>
                          applyFixedYearFields({ ...cur, frequency: freq })
                        )
                      }
                      style={[
                        styles.modeBtn,
                        {
                          backgroundColor: active
                            ? theme.primary
                            : theme.muted,
                        },
                      ]}
                    >
                      <ThemedText
                        type="smallBold"
                        themeColor={active ? "primaryForeground" : undefined}
                      >
                        {freq}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
          )}

          {installmentValue != null && rec.installment_count ? (
            <ThemedText type="small" themeColor="mutedForeground">
              Cada parcela: {formatBRL(installmentValue)} · {rec.installment_count}x
              mensais
              {totalValue != null
                ? ` (total ${formatBRL(getTotalFromInstallments(installmentValue, rec.installment_count))})`
                : ""}
            </ThemedText>
          ) : null}

          {fixedPreview?.kind === "monthly" ? (
            <ThemedText type="small" themeColor="mutedForeground">
              Gera {fixedPreview.count}{" "}
              {fixedPreview.count === 1 ? "mês" : "meses"} · até dez/{fixedPreview.year}
            </ThemedText>
          ) : null}
          {fixedPreview?.kind === "annual" ? (
            <ThemedText type="small" themeColor="mutedForeground">
              Gera 1 cobrança · em {fixedPreview.year}
            </ThemedText>
          ) : null}

          <Field
            label={isSplit ? "1ª parcela em" : "A partir de"}
            required
          >
            <DateField
              value={rec.payment_start_date ?? todayIsoDate()}
              onChange={(iso) => {
                if (!isSplit) {
                  setRec((cur) =>
                    applyFixedYearFields({ ...cur, payment_start_date: iso })
                  );
                  return;
                }
                setRec((cur) => ({ ...cur, payment_start_date: iso }));
              }}
            />
          </Field>

          <Field label="Dia de vencimento" required>
            <Input
              keyboardType="number-pad"
              placeholder="Ex: 10"
              value={rec.due_day ? String(rec.due_day) : ""}
              onChangeText={(raw) => {
                const n = raw.replace(/\D/g, "");
                setRec((cur) => ({
                  ...cur,
                  due_day: n ? Number(n) : null,
                }));
              }}
            />
          </Field>
          </FormBlock>

          <Button
            label={isEditing ? "Salvar alterações" : "Salvar recorrência"}
            disabled={saving}
            loading={saving}
            onPress={() => void onSave()}
            size="lg"
          />
          {isEditing && editId ? (
            <Button
              label="Excluir recorrência"
              disabled={saving}
              onPress={() =>
                Alert.alert(
                  "Excluir recorrência?",
                  "Esta ação não pode ser desfeita.",
                  [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Excluir",
                      style: "destructive",
                      onPress: () => {
                        void (async () => {
                          setSaving(true);
                          try {
                            await deleteRecurringApi(editId);
                            router.back();
                          } catch (err) {
                            fail(
                              getErrorMessage(
                                err,
                                "Não foi possível excluir a recorrência."
                              )
                            );
                          } finally {
                            setSaving(false);
                          }
                        })();
                      },
                    },
                  ]
                )
              }
              variant="destructive"
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
  modeRow: { flexDirection: "row", gap: 8 },
  modeBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
});
