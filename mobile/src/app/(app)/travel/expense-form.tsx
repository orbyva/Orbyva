import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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

import { listTripMembers } from "@/api/travel/members";
import {
  createTripExpense,
  fetchTripExpenses,
  registerMyExpenseSplit,
  updateTripExpense,
} from "@/api/travel/travel";
import { DateField } from "@/components/DateField";
import { ChoiceChip } from "@/components/ChoiceChip";
import { LedgerClassField } from "@/components/LedgerClassField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FormButton } from "@/components/ui/FormButton";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { EXPENSE_CATEGORY_LABELS } from "@/domain/travel";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getCurrentUserId } from "@/lib/auth-user";
import { formatBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type {
  TripExpense,
  TripExpenseCategory,
  TripMember,
} from "@/types/travel";

function equalSplits(memberIds: string[], amount: number) {
  if (memberIds.length === 0) return [];
  const slice = Math.round((amount / memberIds.length) * 100) / 100;
  return memberIds.map((user_id, index) => ({
    user_id,
    amount:
      index === memberIds.length - 1
        ? Math.round((amount - slice * (memberIds.length - 1)) * 100) / 100
        : slice,
  }));
}

export default function TripExpenseFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail, ok } = useFeedback();
  const params = useLocalSearchParams<{ tripId?: string; id?: string }>();
  const tripId = typeof params.tripId === "string" ? params.tripId : "";
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [existing, setExisting] = useState<TripExpense | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<TripExpenseCategory>("food");
  const [expenseDate, setExpenseDate] = useState(getTodayIso());
  const [visibility, setVisibility] = useState<"personal" | "shared">(
    "personal"
  );
  const [payerId, setPayerId] = useState<string | null>(null);
  const [linkLedger, setLinkLedger] = useState(false);
  const [classId, setClassId] = useState<number | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar gasto" : "Novo gasto" });
  }, [editId, navigation]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const uid = await getCurrentUserId();
      const nextMembers = await listTripMembers(tripId).catch(() => []);
      let row: TripExpense | null = null;
      if (editId) {
        const rows = await fetchTripExpenses(tripId);
        row = rows.find((item) => item.id === editId) ?? null;
      }
      if (cancelled) return;
      setUserId(uid);
      setMembers(nextMembers);
      setPayerId(uid);
      if (row) {
        setExisting(row);
        setDescription(row.description);
        setAmount(String(row.amount));
        setCategory(row.category);
        setExpenseDate(row.expense_date);
        setVisibility(row.visibility ?? "personal");
        setPayerId(row.paid_by_user_id ?? uid);
      }
    })()
      .catch((err) => fail(getErrorMessage(err, "Não foi possível abrir o gasto.")))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId, fail, tripId]);

  const mySplit = useMemo(() => {
    if (!existing || !userId) return null;
    return (existing.splits ?? []).find((s) => s.user_id === userId) ?? null;
  }, [existing, userId]);

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

  async function onSave() {
    const parsed = Number.parseFloat(amount.replace(",", "."));
    if (!description.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      fail("Informe descrição e valor.");
      return;
    }
    const memberIds = members.map((m) => m.user_id);
    const splits =
      visibility === "shared" ? equalSplits(memberIds, parsed) : undefined;
    setSaving(true);
    try {
      if (editId) {
        await updateTripExpense({
          id: editId,
          description,
          amount: parsed,
          category,
          expense_date: expenseDate,
          visibility,
          paid_by_user_id: payerId,
          splits,
        });
      } else {
        await createTripExpense({
          trip_id: tripId,
          description,
          amount: parsed,
          category,
          expense_date: expenseDate,
          visibility,
          paid_by_user_id: payerId,
          splits,
          classId: linkLedger ? classId : null,
        });
      }
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar o gasto."));
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
          <Field label="Descrição">
            <TextInput
              placeholder="Almoço, Uber…"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={description}
              onChangeText={setDescription}
            />
          </Field>
          <Field label="Valor">
            <TextInput
              keyboardType="decimal-pad"
              style={inputStyle}
              value={amount}
              onChangeText={setAmount}
            />
          </Field>
          <Field label="Data">
            <DateField
              value={expenseDate}
              onChange={setExpenseDate}
              style={inputStyle}
            />
          </Field>
          <Field label="Categoria">
            <View style={styles.chips}>
              {(Object.keys(EXPENSE_CATEGORY_LABELS) as TripExpenseCategory[]).map(
                (cat) => (
                  <ChoiceChip
                    key={cat}
                    label={EXPENSE_CATEGORY_LABELS[cat]}
                    active={category === cat}
                    onPress={() => setCategory(cat)}
                  />
                )
              )}
            </View>
          </Field>
          <Field label="Quem vê">
            <View style={styles.chips}>
              <ChoiceChip
                label="Pessoal"
                active={visibility === "personal"}
                onPress={() => setVisibility("personal")}
              />
              <ChoiceChip
                label="Conjunto"
                active={visibility === "shared"}
                onPress={() => setVisibility("shared")}
              />
            </View>
          </Field>
          {members.length > 0 ? (
            <Field label="Quem pagou">
              <View style={styles.chips}>
                {members.map((member) => (
                  <ChoiceChip
                    key={member.user_id}
                    label={
                      member.display_name ||
                      (member.user_id === userId ? "Você" : "Membro")
                    }
                    active={payerId === member.user_id}
                    onPress={() => setPayerId(member.user_id)}
                  />
                ))}
              </View>
            </Field>
          ) : null}
          {visibility === "shared" && members.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Rateio igual entre {members.length} pessoa(s).
            </ThemedText>
          ) : null}
          {!editId ? (
            <LedgerClassField
              enabled={linkLedger}
              onEnabledChange={setLinkLedger}
              classId={classId}
              onClassIdChange={setClassId}
              hint={
                visibility === "shared"
                  ? "Lança só a sua fatia no extrato."
                  : "Cria um lançamento em Finanças com o mesmo valor."
              }
            />
          ) : existing?.transaction_id ? (
            <ThemedText type="small" themeColor="textSecondary">
              Já lançado no extrato — o valor é atualizado ao salvar.
            </ThemedText>
          ) : null}
          {editId && mySplit && !mySplit.transaction_id ? (
            <Cardish>
              <ThemedText type="smallBold">
                Sua fatia: {formatBRL(Number(mySplit.amount))}
              </ThemedText>
              <LedgerClassField
                enabled={linkLedger}
                onEnabledChange={setLinkLedger}
                classId={classId}
                onClassIdChange={setClassId}
                hint="Registra só a sua parte no extrato pessoal."
              />
              <FormButton
                label="Lançar minha fatia"
                tone="primary"
                onPress={() => {
                  if (!classId) {
                    fail("Escolha a categoria do extrato.");
                    return;
                  }
                  void registerMyExpenseSplit(editId, classId)
                    .then(() => {
                      ok("Fatia lançada");
                      router.back();
                    })
                    .catch((err) =>
                      fail(getErrorMessage(err, "Não foi possível lançar a fatia."))
                    );
                }}
              />
            </Cardish>
          ) : null}
          <FormButton
            label={editId ? "Salvar alterações" : "Salvar gasto"}
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

function Cardish({ children }: { children: ReactNode }) {
  return <View style={styles.cardish}>{children}</View>;
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
  cardish: { gap: 10 },
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
