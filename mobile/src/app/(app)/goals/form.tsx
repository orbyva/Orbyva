import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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

import {
  createGoal,
  deleteGoal,
  fetchGoalById,
  updateGoal,
} from "@/api/goals/goals";
import { ChoiceChip } from "@/components/ChoiceChip";
import { DateField } from "@/components/DateField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, Field, Input, useInputStyle } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { GOAL_CATEGORY_LABELS } from "@/domain/goals";
import { getTodayIso } from "@/domain/habits";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { GoalCategory, GoalStatus } from "@/types/goals";

const CATEGORY_CHIPS = (
  Object.keys(GOAL_CATEGORY_LABELS) as GoalCategory[]
).map((id) => ({ id, label: GOAL_CATEGORY_LABELS[id] }));

const STATUS_CHIPS: { id: GoalStatus; label: string }[] = [
  { id: "active", label: "Ativa" },
  { id: "completed", label: "Concluída" },
  { id: "cancelled", label: "Cancelada" },
];

export default function GoalFormScreen() {
  const theme = useTheme();
  const inputStyle = useInputStyle().container;
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [loading, setLoading] = useState(Boolean(editId));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<GoalCategory>("other");
  const [target, setTarget] = useState("1");
  const [current, setCurrent] = useState("0");
  const [unit, setUnit] = useState("");
  const [deadline, setDeadline] = useState<string | null>(null);
  const [status, setStatus] = useState<GoalStatus>("active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar meta" : "Nova meta" });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void fetchGoalById(editId)
      .then((goal) => {
        if (cancelled) return;
        if (!goal) {
          setError("Meta não encontrada.");
          return;
        }
        setTitle(goal.title);
        setDescription(goal.description ?? "");
        setCategory(goal.category);
        setTarget(String(goal.target_value));
        setCurrent(String(goal.current_value));
        setUnit(goal.unit ?? "");
        setDeadline(goal.deadline ?? null);
        setStatus(goal.status);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir a meta."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);


  async function onSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      fail("Informe o título da meta.");
      return;
    }
    const targetValue = Number(target.replace(",", "."));
    const currentValue = Number(current.replace(",", "."));
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      fail("Informe um alvo maior que zero.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title: trimmed,
      description: description.trim() || null,
      category,
      target_value: targetValue,
      current_value: Number.isFinite(currentValue) ? Math.max(0, currentValue) : 0,
      unit: unit.trim() || null,
      deadline,
      status,
    };
    try {
      if (editId) await updateGoal({ id: editId, ...payload });
      else await createGoal(payload);
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar a meta."));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert("Excluir meta", title || "Essa meta", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deleteGoal(editId);
              router.back();
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir a meta."));
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
          <Field label="Título" required>
            <Input
              autoFocus={!editId}
              placeholder="Ex.: Ler 12 livros"
              value={title}
              onChangeText={setTitle}
            />
          </Field>
          <Field label="Categoria">
            <View style={styles.chips}>
              {CATEGORY_CHIPS.map((chip) => (
                <ChoiceChip
                  key={chip.id}
                  label={chip.label}
                  active={category === chip.id}
                  onPress={() => setCategory(chip.id)}
                />
              ))}
            </View>
          </Field>
          <Field label="Alvo">
            <Input
              keyboardType="decimal-pad"
              value={target}
              onChangeText={setTarget}
            />
          </Field>
          <Field label="Atual">
            <Input
              keyboardType="decimal-pad"
              value={current}
              onChangeText={setCurrent}
            />
          </Field>
          <Field label="Unidade">
            <Input
              placeholder="livros, km, R$…"
              value={unit}
              onChangeText={setUnit}
            />
          </Field>
          <Field label="Prazo">
            {deadline ? (
              <>
                <DateField value={deadline} onChange={setDeadline} />
                <Pressable onPress={() => setDeadline(null)}>
                  <ThemedText type="small" themeColor="mutedForeground">
                    Sem prazo
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => setDeadline(getTodayIso())}
                style={inputStyle}
              >
                <ThemedText themeColor="mutedForeground">Definir prazo</ThemedText>
              </Pressable>
            )}
          </Field>
          {editId ? (
            <Field label="Status">
              <View style={styles.chips}>
                {STATUS_CHIPS.map((chip) => (
                  <ChoiceChip
                    key={chip.id}
                    label={chip.label}
                    active={status === chip.id}
                    onPress={() => setStatus(chip.id)}
                  />
                ))}
              </View>
            </Field>
          ) : null}
          <Field label="Descrição">
            <Input
              placeholder="Opcional"
              value={description}
              onChangeText={setDescription}
            />
          </Field>
          <Button
            label={editId ? "Salvar alterações" : "Criar meta"}
            disabled={saving}
            loading={saving}
            onPress={() => void onSave()}
            size="lg"
          />
          {editId ? (
            <Button
              label="Excluir meta"
              disabled={saving}
              onPress={onDelete}
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
