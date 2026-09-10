import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

import { fetchProjects } from "@/api/tasks/projects";
import {
  fetchExternalLinksForTask,
  saveExternalLinksForTask,
} from "@/api/tasks/links";
import { createTagApi, fetchTags } from "@/api/tasks/tags";
import {
  completeTaskApi,
  createTaskApi,
  deleteTaskApi,
  deleteTaskSeriesApi,
  fetchSubtasksApi,
  fetchTaskById,
  reopenTaskApi,
  updateTaskApi,
} from "@/api/tasks/tasks";
import { ChipBar } from "@/components/ChipBar";
import { DateField } from "@/components/DateField";
import { StringSelectModal } from "@/components/StringSelectModal";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TimeField } from "@/components/TimeField";
import { Spacing } from "@/constants/theme";
import { PRIORITY_OPTIONS } from "@/domain/tasks/priority";
import {
  formatRecurrenceSummary,
  WEEKDAY_LABELS,
  WEEKDAYS_EMPTY_HINT,
} from "@/domain/tasks/recurrence";
import { endOfWeekIso, todayIsoDate, visibleProjects } from "@/domain/tasks/listView";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import type {
  RecurrenceFrequency,
  RecurrenceRule,
  Tag,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/types/tasks";
import { TASK_STATUS_LABELS } from "@/types/tasks";

const NO_PROJECT = "__none__";

const DUE_CHIPS: { id: "today" | "week" | "none"; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "week", label: "Esta semana" },
  { id: "none", label: "Sem prazo" },
];

const REPEAT_CHIPS: { id: "none" | RecurrenceFrequency; label: string }[] = [
  { id: "none", label: "Não se repete" },
  { id: "daily", label: "Todo dia" },
  { id: "weekly", label: "Toda semana" },
  { id: "monthly", label: "Todo mês" },
  { id: "yearly", label: "Todo ano" },
];

const STATUS_CHIPS = (Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map(
  (id) => ({ id, label: TASK_STATUS_LABELS[id] })
);

export default function TaskFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ projectId?: string; id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;
  const paramProjectId =
    typeof params.projectId === "string" && params.projectId.length > 0
      ? params.projectId
      : null;

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(todayIsoDate());
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(paramProjectId);
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [repeat, setRepeat] = useState<"none" | RecurrenceFrequency>("none");
  const [interval, setInterval] = useState("1");
  const [until, setUntil] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [repeatDirty, setRepeatDirty] = useState(false);
  const [linkedRecurringId, setLinkedRecurringId] = useState<string | null>(null);
  const [originId, setOriginId] = useState<string | null>(null);
  const [existingRule, setExistingRule] = useState<RecurrenceRule | null>(null);
  const [links, setLinks] = useState<{ url: string }[]>([{ url: "" }]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [children, setChildren] = useState<Task[]>([]);
  const savedSubtaskTitles = useRef<Record<string, string>>({});
  const [draftSubtasks, setDraftSubtasks] = useState<string[]>([]);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [busySubtaskId, setBusySubtaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInstance = Boolean(originId);
  const isLinked = Boolean(linkedRecurringId);
  const canEditRepeat = !isInstance && !isLinked;
  const seriesOriginId = originId ?? (existingRule && editId ? editId : null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar tarefa" : "Nova tarefa" });
  }, [editId, navigation]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const [projectRows, tagRows] = await Promise.all([
          fetchProjects(),
          fetchTags(),
        ]);
        if (cancelled) return;
        setProjects(
          visibleProjects(projectRows).map((project) => ({
            id: project.id,
            name: project.name,
          }))
        );
        setTags(tagRows);

        if (editId) {
          const [task, childRows, linkRows] = await Promise.all([
            fetchTaskById(editId),
            fetchSubtasksApi(editId),
            fetchExternalLinksForTask(editId),
          ]);
          if (!task) throw new Error("Tarefa não encontrada.");
          if (cancelled) return;
          setTitle(task.title);
          setDescription(task.description ?? "");
          setDueDate(task.due_date);
          setDueTime(task.due_time ?? null);
          setProjectId(task.project_id);
          setPriority(task.priority ?? null);
          setStatus(task.status);
          setTagIds(task.tag_ids ?? []);
          setLinkedRecurringId(task.linked_recurring_id);
          setOriginId(task.recurrence_origin_id);
          setExistingRule(task.recurrence_rule);
          setRepeat(task.recurrence_rule?.frequency ?? "none");
          setInterval(String(task.recurrence_rule?.interval ?? 1));
          setUntil(task.recurrence_rule?.until ?? null);
          setWeekdays(task.recurrence_rule?.weekdays ?? []);
          setChildren(childRows);
          savedSubtaskTitles.current = Object.fromEntries(
            childRows.map((row) => [row.id, row.title])
          );
          setLinks(
            linkRows.length > 0
              ? linkRows.map((row) => ({ url: row.url }))
              : [{ url: "" }]
          );
        } else if (paramProjectId) {
          setProjectId(paramProjectId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir a tarefa."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [editId, paramProjectId]);

  useFocusEffect(
    useCallback(() => {
      if (!editId) return;
      let cancelled = false;
      void fetchSubtasksApi(editId)
        .then((rows) => {
          if (!cancelled) {
            setChildren(rows);
            savedSubtaskTitles.current = Object.fromEntries(
              rows.map((row) => [row.id, row.title])
            );
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [editId])
  );

  const today = todayIsoDate();
  const weekEnd = endOfWeekIso(today);
  const chipId =
    dueDate == null ? "none" : dueDate === today ? "today" : dueDate === weekEnd ? "week" : null;
  const projectName =
    projectId == null
      ? "Sem projeto"
      : (projects.find((project) => project.id === projectId)?.name ?? "Projeto");

  const parsedInterval = Math.max(1, Number.parseInt(interval, 10) || 1);

  const recurrenceRule = useMemo((): RecurrenceRule | null => {
    if (!canEditRepeat) return existingRule;
    if (!repeatDirty && existingRule) {
      return { ...existingRule, time: dueTime };
    }
    if (repeat === "none") return null;
    if (!dueDate) return null;
    return {
      frequency: repeat,
      interval: parsedInterval,
      time: dueTime,
      until,
      weekdays:
        repeat === "weekly" && weekdays.length > 0 ? [...weekdays].sort() : undefined,
      monthlyMode: repeat === "monthly" ? "day" : undefined,
    };
  }, [
    canEditRepeat,
    dueDate,
    dueTime,
    existingRule,
    parsedInterval,
    repeat,
    repeatDirty,
    until,
    weekdays,
  ]);

  function writePayload() {
    return {
      title: title.trim(),
      due_date: dueDate,
      due_time: dueTime,
      description: description.trim(),
      project_id: projectId,
      priority,
      status,
      tag_ids: tagIds,
      recurrence_rule: canEditRepeat ? recurrenceRule : undefined,
    };
  }

  async function persistLinks(taskId: string) {
    await saveExternalLinksForTask(
      taskId,
      links.map((link) => ({ url: link.url.trim() })).filter((link) => link.url)
    );
  }

  async function onSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Informe o título da tarefa.");
      return;
    }
    if (repeat !== "none" && canEditRepeat && !dueDate) {
      setError("Recorrência precisa de um prazo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = writePayload();
      if (editId) {
        await updateTaskApi({ id: editId, ...payload });
        await persistLinks(editId);
      } else {
        const created = await createTaskApi(payload);
        await persistLinks(created.id);
        for (const childTitle of draftSubtasks) {
          const trimmedChild = childTitle.trim();
          if (!trimmedChild) continue;
          await createTaskApi({
            title: trimmedChild,
            due_date: null,
            project_id: created.project_id,
            parent_task_id: created.id,
            description: "",
          });
        }
      }
      router.back();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          editId
            ? "Não foi possível salvar a tarefa."
            : "Não foi possível criar a tarefa."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  function runDelete(action: () => Promise<void>) {
    void (async () => {
      setSaving(true);
      try {
        await action();
        router.back();
      } catch (err) {
        setError(getErrorMessage(err, "Não foi possível excluir a tarefa."));
        setSaving(false);
      }
    })();
  }

  function onDelete() {
    if (!editId) return;
    const buttons: {
      text: string;
      style?: "cancel" | "destructive";
      onPress?: () => void;
    }[] = [{ text: "Cancelar", style: "cancel" }];
    buttons.push({
      text: seriesOriginId ? "Só esta" : "Excluir",
      style: "destructive",
      onPress: () => runDelete(() => deleteTaskApi(editId)),
    });
    if (seriesOriginId) {
      buttons.push({
        text: "Excluir série",
        style: "destructive",
        onPress: () => runDelete(() => deleteTaskSeriesApi(seriesOriginId)),
      });
    }
    Alert.alert(
      "Excluir tarefa",
      seriesOriginId
        ? "Pode apagar só esta ocorrência ou a série inteira."
        : "Essa ação não tem volta.",
      buttons
    );
  }

  async function addTag() {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    setNewTag("");
    const existing = tags.find(
      (tag) => tag.name.toLocaleLowerCase("pt-BR") === trimmed.toLocaleLowerCase("pt-BR")
    );
    if (existing) {
      setTagIds((cur) =>
        cur.includes(existing.id) ? cur : [...cur, existing.id]
      );
      return;
    }
    try {
      const created = await createTagApi(trimmed);
      setTags((cur) => [...cur, created].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setTagIds((cur) => [...cur, created.id]);
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível criar a tag."));
    }
  }

  function toggleTag(id: string) {
    setTagIds((cur) =>
      cur.includes(id) ? cur.filter((tagId) => tagId !== id) : [...cur, id]
    );
  }

  async function addSubtask() {
    const trimmed = subtaskTitle.trim();
    if (!trimmed) return;
    setSubtaskTitle("");
    if (!editId) {
      setDraftSubtasks((cur) => [...cur, trimmed]);
      return;
    }
    try {
      const created = await createTaskApi({
        title: trimmed,
        due_date: null,
        project_id: projectId,
        parent_task_id: editId,
        description: "",
      });
      setChildren((cur) => [...cur, created]);
      savedSubtaskTitles.current[created.id] = created.title;
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível adicionar a subtarefa."));
    }
  }

  async function renameSubtask(task: Task, nextTitle: string) {
    const trimmed = nextTitle.trim();
    const original = savedSubtaskTitles.current[task.id] ?? task.title;
    if (!trimmed) {
      setChildren((cur) =>
        cur.map((row) => (row.id === task.id ? { ...row, title: original } : row))
      );
      return;
    }
    if (trimmed === original) return;
    try {
      await updateTaskApi({
        id: task.id,
        title: trimmed,
        due_date: task.due_date,
        due_time: task.due_time,
        description: task.description ?? "",
        project_id: task.project_id,
        priority: task.priority ?? null,
        status: task.status,
      });
      savedSubtaskTitles.current[task.id] = trimmed;
      setChildren((cur) =>
        cur.map((row) => (row.id === task.id ? { ...row, title: trimmed } : row))
      );
    } catch (err) {
      setChildren((cur) =>
        cur.map((row) => (row.id === task.id ? { ...row, title: original } : row))
      );
      setError(getErrorMessage(err, "Não foi possível renomear a subtarefa."));
    }
  }

  async function toggleSubtask(task: Task) {
    setBusySubtaskId(task.id);
    const previous = children;
    const nextStatus = task.status === "done" ? "todo" : "done";
    setChildren((cur) =>
      cur.map((row) =>
        row.id === task.id
          ? {
              ...row,
              status: nextStatus,
              completed_at: nextStatus === "done" ? new Date().toISOString() : null,
            }
          : row
      )
    );
    try {
      if (nextStatus === "done") await completeTaskApi(task.id);
      else await reopenTaskApi(task.id);
    } catch (err) {
      setChildren(previous);
      setError(getErrorMessage(err, "Não foi possível atualizar a subtarefa."));
    } finally {
      setBusySubtaskId(null);
    }
  }

  function removeDraft(index: number) {
    setDraftSubtasks((cur) => cur.filter((_, i) => i !== index));
  }

  function removeSaved(task: Task) {
    Alert.alert("Excluir subtarefa", task.title, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteTaskApi(task.id);
              setChildren((cur) => cur.filter((row) => row.id !== task.id));
            } catch (err) {
              setError(
                getErrorMessage(err, "Não foi possível excluir a subtarefa.")
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

  const repeatHint = isLinked
    ? formatRecurrenceSummary({
        recurrence_rule: existingRule,
        linked_recurring_id: linkedRecurringId,
        due_date: dueDate,
      })
    : isInstance
      ? "Ocorrência de uma série — a regra fica na origem."
      : formatRecurrenceSummary({
          recurrence_rule: recurrenceRule,
          due_date: dueDate,
        });

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
          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

          <Field label="Título" required>
            <TextInput
              autoFocus={!editId}
              placeholder="O que precisa ser feito?"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={title}
              onChangeText={setTitle}
            />
          </Field>

          <Field label="Status">
            <ChipBar
              options={STATUS_CHIPS}
              value={status}
              onChange={setStatus}
            />
          </Field>

          <Field label="Projeto">
            <Pressable
              onPress={() => setProjectPickerOpen(true)}
              style={inputStyle}
            >
              <ThemedText>{projectName}</ThemedText>
            </Pressable>
          </Field>

          <Field label="Tags">
            {tags.length > 0 ? (
              <View style={styles.chipRow}>
                {tags.map((tag) => (
                  <Pressable
                    key={tag.id}
                    onPress={() => toggleTag(tag.id)}
                    style={[
                      styles.chip,
                      { backgroundColor: theme.backgroundElement },
                      tagIds.includes(tag.id) && {
                        backgroundColor: theme.backgroundSelected,
                      },
                    ]}
                  >
                    <ThemedText type="smallBold">{tag.name}</ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <TextInput
              placeholder="Nova tag"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={newTag}
              onChangeText={setNewTag}
              onSubmitEditing={() => void addTag()}
              returnKeyType="done"
            />
          </Field>

          <Field label="Prazo">
            <View style={styles.chipRow}>
              {DUE_CHIPS.map((chip) => (
                <Pressable
                  key={chip.id}
                  onPress={() => {
                    if (chip.id === "none") {
                      setDueDate(null);
                      setDueTime(null);
                      if (canEditRepeat) {
                        setRepeat("none");
                        setRepeatDirty(true);
                      }
                    } else if (chip.id === "today") setDueDate(today);
                    else setDueDate(weekEnd);
                  }}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    chipId === chip.id && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{chip.label}</ThemedText>
                </Pressable>
              ))}
            </View>
            {dueDate ? (
              <>
                <DateField value={dueDate} onChange={setDueDate} style={inputStyle} />
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() =>
                      setDueTime((cur) => (cur ? null : "09:00"))
                    }
                    style={[
                      styles.chip,
                      { backgroundColor: theme.backgroundElement },
                      dueTime
                        ? { backgroundColor: theme.backgroundSelected }
                        : null,
                    ]}
                  >
                    <ThemedText type="smallBold">
                      {dueTime ? "Com horário" : "Sem horário"}
                    </ThemedText>
                  </Pressable>
                </View>
                {dueTime ? (
                  <TimeField value={dueTime} onChange={setDueTime} style={inputStyle} />
                ) : null}
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Vai para a inbox até você definir uma data.
              </ThemedText>
            )}
          </Field>

          <Field label="Prioridade">
            <View style={styles.chipRow}>
              {PRIORITY_OPTIONS.map(([value, label]) => (
                <Pressable
                  key={label}
                  onPress={() => setPriority(value)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    priority === value && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{label}</ThemedText>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Repetição">
            {canEditRepeat ? (
              <>
                <View style={styles.chipRow}>
                  {REPEAT_CHIPS.map((chip) => (
                    <Pressable
                      key={chip.id}
                      onPress={() => {
                        if (chip.id !== "none" && !dueDate) setDueDate(today);
                        setRepeat(chip.id);
                        setRepeatDirty(true);
                        if (chip.id === "none") {
                          setUntil(null);
                          setWeekdays([]);
                          setInterval("1");
                        }
                      }}
                      style={[
                        styles.chip,
                        { backgroundColor: theme.backgroundElement },
                        repeat === chip.id && {
                          backgroundColor: theme.backgroundSelected,
                        },
                      ]}
                    >
                      <ThemedText type="smallBold">{chip.label}</ThemedText>
                    </Pressable>
                  ))}
                </View>
                {repeat !== "none" ? (
                  <>
                    <ThemedText type="small" themeColor="textSecondary">
                      A cada
                    </ThemedText>
                    <TextInput
                      keyboardType="number-pad"
                      value={interval}
                      onChangeText={(value) => {
                        setInterval(value.replace(/\D/g, "") || "1");
                        setRepeatDirty(true);
                      }}
                      style={inputStyle}
                    />
                    {repeat === "weekly" ? (
                      <>
                        <View style={styles.chipRow}>
                          {WEEKDAY_LABELS.map((label, weekday) => (
                            <Pressable
                              key={`${label}-${weekday}`}
                              onPress={() => {
                                setRepeatDirty(true);
                                setWeekdays((cur) =>
                                  cur.includes(weekday)
                                    ? cur.filter((day) => day !== weekday)
                                    : [...cur, weekday]
                                );
                              }}
                              style={[
                                styles.weekday,
                                { backgroundColor: theme.backgroundElement },
                                weekdays.includes(weekday) && {
                                  backgroundColor: theme.backgroundSelected,
                                },
                              ]}
                            >
                              <ThemedText type="smallBold">{label}</ThemedText>
                            </Pressable>
                          ))}
                        </View>
                        {weekdays.length === 0 ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            {WEEKDAYS_EMPTY_HINT}
                          </ThemedText>
                        ) : null}
                      </>
                    ) : null}
                    <Pressable
                      onPress={() => {
                        setRepeatDirty(true);
                        setUntil((cur) => cur ?? dueDate ?? today);
                      }}
                      style={[
                        styles.chip,
                        { backgroundColor: theme.backgroundElement },
                        until ? { backgroundColor: theme.backgroundSelected } : null,
                      ]}
                    >
                      <ThemedText type="smallBold">
                        {until ? "Com término" : "Sem término"}
                      </ThemedText>
                    </Pressable>
                    {until ? (
                      <>
                        <DateField
                          value={until}
                          onChange={(value) => {
                            setUntil(value);
                            setRepeatDirty(true);
                          }}
                          style={inputStyle}
                        />
                        <Pressable
                          onPress={() => {
                            setUntil(null);
                            setRepeatDirty(true);
                          }}
                        >
                          <ThemedText type="small" themeColor="textSecondary">
                            Remover término
                          </ThemedText>
                        </Pressable>
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">
              {repeatHint}
            </ThemedText>
          </Field>

          <Field label="Links">
            {links.map((link, index) => (
              <View key={`link-${index}`} style={styles.subRow}>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="https://"
                  placeholderTextColor={theme.textSecondary}
                  style={[inputStyle, styles.flex]}
                  value={link.url}
                  onChangeText={(value) =>
                    setLinks((cur) =>
                      cur.map((row, rowIndex) =>
                        rowIndex === index ? { url: value } : row
                      )
                    )
                  }
                />
                <Pressable
                  onPress={() =>
                    setLinks((cur) =>
                      cur.length === 1
                        ? [{ url: "" }]
                        : cur.filter((_, rowIndex) => rowIndex !== index)
                    )
                  }
                  hitSlop={8}
                >
                  <ThemedText type="small" style={styles.error}>
                    Excluir
                  </ThemedText>
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() => setLinks((cur) => [...cur, { url: "" }])}
            >
              <ThemedText type="linkPrimary">Adicionar link</ThemedText>
            </Pressable>
          </Field>

          <Field label="Subtarefas">
            {children.map((child) => (
              <View key={child.id} style={styles.subRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: child.status === "done" }}
                  disabled={busySubtaskId === child.id}
                  onPress={() => void toggleSubtask(child)}
                  style={[
                    styles.subCheck,
                    {
                      borderColor: theme.textSecondary,
                      backgroundColor:
                        child.status === "done" ? theme.primary : "transparent",
                    },
                  ]}
                />
                <TextInput
                  style={[
                    inputStyle,
                    styles.subInput,
                    child.status === "done" && styles.subDone,
                  ]}
                  value={child.title}
                  onChangeText={(value) =>
                    setChildren((cur) =>
                      cur.map((row) =>
                        row.id === child.id ? { ...row, title: value } : row
                      )
                    )
                  }
                  onEndEditing={() => void renameSubtask(child, child.title)}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/tasks/form",
                      params: { id: child.id },
                    })
                  }
                  hitSlop={8}
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    Abrir
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => removeSaved(child)} hitSlop={8}>
                  <ThemedText type="small" style={styles.error}>
                    Excluir
                  </ThemedText>
                </Pressable>
              </View>
            ))}
            {draftSubtasks.map((childTitle, index) => (
              <View key={`draft-${index}`} style={styles.subRow}>
                <View
                  style={[styles.subCheck, { borderColor: theme.textSecondary }]}
                />
                <TextInput
                  style={[inputStyle, styles.subInput]}
                  value={childTitle}
                  onChangeText={(value) =>
                    setDraftSubtasks((cur) =>
                      cur.map((row, rowIndex) =>
                        rowIndex === index ? value : row
                      )
                    )
                  }
                  returnKeyType="done"
                />
                <Pressable onPress={() => removeDraft(index)} hitSlop={8}>
                  <ThemedText type="small" style={styles.error}>
                    Excluir
                  </ThemedText>
                </Pressable>
              </View>
            ))}
            <TextInput
              placeholder="Nova subtarefa"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={subtaskTitle}
              onChangeText={setSubtaskTitle}
              onSubmitEditing={() => void addSubtask()}
              returnKeyType="done"
            />
          </Field>

          <Field label="Descrição">
            <TextInput
              multiline
              placeholder="Opcional"
              placeholderTextColor={theme.textSecondary}
              style={[inputStyle, styles.area]}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
            />
          </Field>

          <Pressable
            disabled={saving}
            onPress={() => void onSave()}
            style={[styles.primary, { backgroundColor: theme.primary }]}
          >
            {saving ? (
              <ActivityIndicator color="#0B0F1A" />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryLabel}>
                {editId ? "Salvar alterações" : "Criar tarefa"}
              </ThemedText>
            )}
          </Pressable>

          {editId ? (
            <Pressable disabled={saving} onPress={onDelete}>
              <ThemedText style={styles.error}>Excluir tarefa</ThemedText>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <StringSelectModal
        visible={projectPickerOpen}
        title="Projeto"
        searchable={projects.length > 8}
        selectedId={projectId ?? NO_PROJECT}
        options={[
          { id: NO_PROJECT, label: "Sem projeto" },
          ...projects.map((project) => ({
            id: project.id,
            label: project.name,
          })),
        ]}
        onSelect={(id) => setProjectId(id === NO_PROJECT ? null : id)}
        onClose={() => setProjectPickerOpen(false)}
      />
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
  area: { minHeight: 120, paddingTop: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  weekday: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  subCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  subInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  subDone: { textDecorationLine: "line-through", opacity: 0.55 },
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
