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
  createProjectEventApi,
  deleteProjectEventApi,
  fetchProjectEvents,
  updateProjectEventApi,
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
import { Banner, Button, Input } from "@/components/ui";
import { TimeField } from "@/components/TimeField";
import { Radius, Spacing } from "@/constants/theme";
import { CATEGORY_COLORS } from "@/domain/dimensions/listView";
import { todayIsoDate } from "@/domain/tasks/listView";
import { useTheme } from "@/hooks/use-theme";
import { formatEventWhen, formatLocalIsoDate, formatLocalIsoDateTime } from "@/lib/dates";
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
  const params = useLocalSearchParams<{ id?: string; eventId?: string }>();
  const initialEventId = typeof params.eventId === "string" ? params.eventId : null;
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
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
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
        const target = initialEventId
          ? nextEvents.find((event) => event.id === initialEventId)
          : undefined;
        if (target) startEditEvent(target);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única por projeto
  }, [editId, initialEventId]);

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

  function startEditEvent(event: ProjectEvent) {
    const when = new Date(event.starts_at);
    setEditingEventId(event.id);
    setEventTitle(event.title);
    setEventDate(formatLocalIsoDate(when));
    setEventTime(
      `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`
    );
  }

  function cancelEditEvent() {
    setEditingEventId(null);
    setEventTitle("");
    setEventDate(todayIsoDate());
    setEventTime("09:00");
  }

  async function submitEvent() {
    if (!editId) return;
    const trimmed = eventTitle.trim();
    if (!trimmed) {
      setError("Informe o título do evento.");
      return;
    }
    const startsAt = formatLocalIsoDateTime(eventDate, eventTime);
    try {
      if (editingEventId) {
        const updated = await updateProjectEventApi({
          id: editingEventId,
          title: trimmed,
          startsAt,
        });
        setEvents((cur) =>
          cur
            .map((row) => (row.id === updated.id ? updated : row))
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        );
        cancelEditEvent();
        return;
      }
      const created = await createProjectEventApi({
        projectId: editId,
        title: trimmed,
        startsAt,
      });
      setEvents((cur) => [...cur, created]);
      setEventTitle("");
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          editingEventId
            ? "Não foi possível salvar o evento."
            : "Não foi possível criar o evento."
        )
      );
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
              if (editingEventId === event.id) cancelEditEvent();
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
            <ThemedText type="small" themeColor="mutedForeground">
              Nome *
            </ThemedText>
            <Input
              autoFocus={!editId}
              placeholder="Ex: Reforma, Viagem, App"
              value={name}
              onChangeText={setName}
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="mutedForeground">
              Descrição
            </ThemedText>
            <Input
              multiline
              placeholder="Opcional"
              style={styles.area}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="mutedForeground">
              Status
            </ThemedText>
            <ChipBar
              options={STATUS_CHIPS}
              value={status}
              onChange={setStatus}
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="mutedForeground">
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
                    color === hex && [styles.swatchOn, { borderColor: theme.foreground }],
                  ]}
                />
              ))}
            </View>
          </View>
          {editId ? (
            <View style={styles.field}>
              <ThemedText type="small" themeColor="mutedForeground">
                Eventos
              </ThemedText>
              {events.length === 0 ? (
                <ThemedText type="small" themeColor="mutedForeground">
                  Nenhum evento neste projeto.
                </ThemedText>
              ) : (
                events.map((event) => (
                  <View key={event.id} style={styles.eventRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Editar evento ${event.title}`}
                      onPress={() => startEditEvent(event)}
                      style={styles.flex}
                    >
                      <ThemedText
                        type="smallBold"
                        themeColor={editingEventId === event.id ? "primary" : undefined}
                      >
                        {event.title}
                      </ThemedText>
                      <ThemedText type="small" themeColor="mutedForeground">
                        {formatEventWhen(event.starts_at)}
                        {editingEventId === event.id ? " · editando" : " · toque para editar"}
                      </ThemedText>
                    </Pressable>
                    <Button
                      label="Excluir"
                      onPress={() => removeEvent(event)}
                      variant="destructive"
                      size="sm"
                    />
                  </View>
                ))
              )}
              <Input
                placeholder="Título do evento"
                value={eventTitle}
                onChangeText={setEventTitle}
              />
              <DateField
                value={eventDate}
                onChange={setEventDate}
              />
              <TimeField
                value={eventTime}
                onChange={setEventTime}
              />
              <Button
                label={editingEventId ? "Salvar evento" : "Adicionar evento"}
                onPress={() => void submitEvent()}
                variant="outline"
              />
              {editingEventId ? (
                <Button label="Cancelar edição" onPress={cancelEditEvent} variant="ghost" />
              ) : null}
            </View>
          ) : (
            <ThemedText type="small" themeColor="mutedForeground">
              Eventos entram depois de criar o projeto.
            </ThemedText>
          )}
          <Button
            label={editId ? "Salvar alterações" : "Criar projeto"}
            disabled={saving}
            loading={saving}
            onPress={() => void onSave()}
            size="lg"
          />
          {editId ? (
            <Button
              label="Excluir projeto"
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
  field: { gap: 8 },
  area: { minHeight: 96, paddingTop: 12 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: Radius.full },
  swatchOn: { borderWidth: 3 },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
