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
  TextInput,
  View,
} from "react-native";

import {
  createProjectEventApi,
  deleteProjectEventApi,
  fetchProjectEvents,
} from "@/api/tasks/events";
import {
  createProjectApi,
  deleteProjectApi,
  fetchProjectById,
  updateProjectApi,
} from "@/api/tasks/projects";
import { ChipBar } from "@/components/ChipBar";
import { DateField } from "@/components/DateField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { TimeField } from "@/components/TimeField";
import { Spacing } from "@/constants/theme";
import { CATEGORY_COLORS } from "@/domain/dimensions/listView";
import { todayIsoDate } from "@/domain/tasks/listView";
import { useTheme } from "@/hooks/use-theme";
import { formatEventWhen, formatLocalIsoDateTime } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import {
  PROJECT_STATUS_LABELS,
  type ProjectEvent,
  type ProjectStatus,
} from "@/types/tasks";

const STATUS_CHIPS = (
  Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]
).map((id) => ({ id, label: PROJECT_STATUS_LABELS[id] }));

export default function ProjectFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [loading, setLoading] = useState(Boolean(editId));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string | null>(CATEGORY_COLORS[2]);
  const [status, setStatus] = useState<ProjectStatus>("planned");
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(todayIsoDate());
  const [eventTime, setEventTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: editId ? "Editar projeto" : "Novo projeto",
    });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void Promise.all([fetchProjectById(editId), fetchProjectEvents(editId)])
      .then(([project, nextEvents]) => {
        if (!project) throw new Error("Projeto não encontrado.");
        if (cancelled) return;
        setName(project.name);
        setDescription(project.description ?? "");
        setColor(project.color ?? CATEGORY_COLORS[2]);
        setStatus(project.status);
        setEvents(nextEvents);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir o projeto."));
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
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe o nome do projeto.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editId) {
        await updateProjectApi({
          id: editId,
          name: trimmed,
          description: description.trim(),
          color,
          status,
        });
      } else {
        await createProjectApi({
          name: trimmed,
          description: description.trim(),
          color,
          status,
        });
      }
      router.back();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          editId
            ? "Não foi possível salvar o projeto."
            : "Não foi possível criar o projeto."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert(
      "Excluir projeto",
      "As tarefas ficam sem projeto. Essa ação não tem volta.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                await deleteProjectApi(editId);
                router.back();
              } catch (err) {
                setError(
                  getErrorMessage(err, "Não foi possível excluir o projeto.")
                );
                setSaving(false);
              }
            })();
          },
        },
      ]
    );
  }

  async function addEvent() {
    if (!editId) return;
    const trimmed = eventTitle.trim();
    if (!trimmed) {
      setError("Informe o título do evento.");
      return;
    }
    try {
      const created = await createProjectEventApi({
        projectId: editId,
        title: trimmed,
        startsAt: formatLocalIsoDateTime(eventDate, eventTime),
      });
      setEvents((cur) => [...cur, created]);
      setEventTitle("");
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível criar o evento."));
    }
  }

  function removeEvent(event: ProjectEvent) {
    Alert.alert("Excluir evento", event.title, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteProjectEventApi(event.id);
              setEvents((cur) => cur.filter((row) => row.id !== event.id));
            } catch (err) {
              setError(
                getErrorMessage(err, "Não foi possível excluir o evento.")
              );
            }
          })();
        },
      },
    ]);
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
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Nome *
            </ThemedText>
            <TextInput
              autoFocus={!editId}
              placeholder="Ex: Reforma, Viagem, App"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={name}
              onChangeText={setName}
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Descrição
            </ThemedText>
            <TextInput
              multiline
              placeholder="Opcional"
              placeholderTextColor={theme.textSecondary}
              style={[inputStyle, styles.area]}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Status
            </ThemedText>
            <ChipBar
              options={STATUS_CHIPS}
              value={status}
              onChange={setStatus}
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Cor
            </ThemedText>
            <View style={styles.swatches}>
              {CATEGORY_COLORS.map((hex) => (
                <Pressable
                  key={hex}
                  onPress={() => setColor(hex)}
                  style={[
                    styles.swatch,
                    { backgroundColor: hex },
                    color === hex && styles.swatchOn,
                  ]}
                />
              ))}
            </View>
          </View>
          {editId ? (
            <View style={styles.field}>
              <ThemedText type="small" themeColor="textSecondary">
                Eventos
              </ThemedText>
              {events.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Nenhum evento neste projeto.
                </ThemedText>
              ) : (
                events.map((event) => (
                  <View key={event.id} style={styles.eventRow}>
                    <View style={styles.flex}>
                      <ThemedText type="smallBold">{event.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatEventWhen(event.starts_at)}
                      </ThemedText>
                    </View>
                    <FormButton
                      label="Excluir"
                      tone="danger"
                      compact
                      onPress={() => removeEvent(event)}
                    />
                  </View>
                ))
              )}
              <TextInput
                placeholder="Título do evento"
                placeholderTextColor={theme.textSecondary}
                style={inputStyle}
                value={eventTitle}
                onChangeText={setEventTitle}
              />
              <DateField
                value={eventDate}
                onChange={setEventDate}
                style={inputStyle}
              />
              <TimeField
                value={eventTime}
                onChange={setEventTime}
                style={inputStyle}
              />
              <FormButton
                label="Adicionar evento"
                onPress={() => void addEvent()}
              />
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Eventos entram depois de criar o projeto.
            </ThemedText>
          )}
          <FormButton
            label={editId ? "Salvar alterações" : "Criar projeto"}
            tone="primary"
            disabled={saving}
            busy={saving}
            onPress={() => void onSave()}
          />
          {editId ? (
            <FormButton
              label="Excluir projeto"
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
  area: { minHeight: 96, paddingTop: 12 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  swatchOn: { borderWidth: 3, borderColor: "#0B0F1A" },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
});
