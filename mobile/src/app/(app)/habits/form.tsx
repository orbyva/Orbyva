import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
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

import { fetchGoals } from "@/api/goals/goals";
import { ChoiceChip } from "@/components/ChoiceChip";
import {
  createHabit,
  deleteHabit,
  fetchHabitById,
  updateHabit,
} from "@/api/habits/habits";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { FormSection } from "@/components/ui/FormSection";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { PersonalGoal } from "@/types/goals";
import type { HabitFrequency, HabitKind } from "@/types/habits";

const KIND_CHIPS: { id: HabitKind; label: string }[] = [
  { id: "build", label: "Hábito" },
  { id: "avoid", label: "Anti-hábito" },
];

const FREQ_CHIPS: { id: HabitFrequency; label: string }[] = [
  { id: "daily", label: "Todo dia" },
  { id: "weekly", label: "Por semana" },
];

export default function HabitFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ id?: string; health?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [loading, setLoading] = useState(Boolean(editId));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<HabitKind>("build");
  const [frequency, setFrequency] = useState<HabitFrequency>("daily");
  const [target, setTarget] = useState("3");
  const [isHealth, setIsHealth] = useState(params.health === "1");
  const [goalId, setGoalId] = useState<string | null>(null);
  const [goalIncrement, setGoalIncrement] = useState("1");
  const [goals, setGoals] = useState<PersonalGoal[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar hábito" : "Novo hábito" });
  }, [editId, navigation]);

  useEffect(() => {
    let cancelled = false;
    void fetchGoals()
      .then((rows) => {
        if (!cancelled) {
          setGoals(rows.filter((goal) => goal.status === "active"));
        }
      })
      .catch(() => {
        /* metas opcionais no form */
      });
    if (!editId) return () => {
      cancelled = true;
    };
    void fetchHabitById(editId)
      .then((habit) => {
        if (cancelled) return;
        if (!habit) {
          setError("Hábito não encontrado.");
          return;
        }
        setName(habit.name);
        setDescription(habit.description ?? "");
        setKind(habit.kind === "avoid" ? "avoid" : "build");
        setFrequency(habit.frequency);
        setTarget(String(habit.target_per_week || 3));
        setIsHealth(Boolean(habit.is_health));
        setGoalId(habit.goal_id ?? null);
        setGoalIncrement(
          habit.goal_increment != null ? String(habit.goal_increment) : "1"
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir o hábito."));
        }
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
    const trimmed = name.trim();
    if (!trimmed) {
      fail("Informe o nome do hábito.");
      return;
    }
    setSaving(true);
    setError(null);
    const targetPerWeek =
      frequency === "daily"
        ? 7
        : Math.max(1, Math.min(7, Number.parseInt(target, 10) || 1));
    const increment = Number.parseFloat(goalIncrement.replace(",", "."));
    const payload = {
      name: trimmed,
      description,
      frequency,
      target_per_week: targetPerWeek,
      kind,
      is_health: isHealth,
      goal_id: goalId,
      goal_increment:
        goalId && Number.isFinite(increment) && increment > 0 ? increment : null,
    };
    try {
      if (editId) {
        await updateHabit({ id: editId, ...payload });
      } else {
        await createHabit(payload);
      }
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar o hábito."));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert("Excluir hábito", name || "Esse hábito", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deleteHabit(editId);
              router.back();
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir o hábito."));
              setSaving(false);
            }
          })();
        },
      },
    ]);
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
          <Field label="Nome" required>
            <TextInput
              autoFocus={!editId}
              placeholder={kind === "avoid" ? "Sem delivery" : "Beber água"}
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={name}
              onChangeText={setName}
            />
          </Field>
          <Field label="Tipo">
            <View style={styles.chips}>
              {KIND_CHIPS.map((chip) => (
                <ChoiceChip
                  key={chip.id}
                  label={chip.label}
                  active={kind === chip.id}
                  onPress={() => setKind(chip.id)}
                />
              ))}
            </View>
          </Field>
          <Field label="Frequência">
            <View style={styles.chips}>
              {FREQ_CHIPS.map((chip) => (
                <ChoiceChip
                  key={chip.id}
                  label={chip.label}
                  active={frequency === chip.id}
                  onPress={() => setFrequency(chip.id)}
                />
              ))}
            </View>
            {frequency === "weekly" ? (
              <TextInput
                keyboardType="number-pad"
                value={target}
                onChangeText={(value) =>
                  setTarget(value.replace(/\D/g, "") || "1")
                }
                style={inputStyle}
              />
            ) : null}
          </Field>
          <Field label="Descrição">
            <TextInput
              placeholder="Opcional"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={description}
              onChangeText={setDescription}
            />
          </Field>
          <ChoiceChip
            label={
              isHealth ? "Também aparece em Saúde" : "Marcar como hábito de saúde"
            }
            active={isHealth}
            onPress={() => setIsHealth((cur) => !cur)}
            style={{ alignSelf: "flex-start" }}
          />
          <FormSection
            title="Vincular a uma meta"
            hint={
              goalId
                ? goals.find((goal) => goal.id === goalId)?.title
                : "Opcional"
            }
          >
            <View style={styles.chips}>
              <ChoiceChip
                label="Nenhuma"
                active={!goalId}
                onPress={() => setGoalId(null)}
              />
              {goals.map((goal) => (
                <ChoiceChip
                  key={goal.id}
                  label={goal.title}
                  active={goalId === goal.id}
                  onPress={() => setGoalId(goal.id)}
                />
              ))}
            </View>
            {goalId ? (
              <Field label="Quanto somar a cada check-in">
                <TextInput
                  keyboardType="decimal-pad"
                  style={inputStyle}
                  value={goalIncrement}
                  onChangeText={setGoalIncrement}
                />
              </Field>
            ) : null}
          </FormSection>
          <FormButton
            label={editId ? "Salvar alterações" : "Criar hábito"}
            tone="primary"
            disabled={saving}
            busy={saving}
            onPress={() => void onSave()}
          />
          {editId ? (
            <FormButton
              label="Excluir hábito"
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
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
        {required ? " *" : ""}
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
