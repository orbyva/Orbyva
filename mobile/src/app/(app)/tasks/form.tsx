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
import { createTagApi, deleteTagApi, fetchTags, updateTagApi } from "@/api/tasks/tags";
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
import { ChoiceChip } from "@/components/ChoiceChip";
import { DateField } from "@/components/DateField";
import { StringSelectModal } from "@/components/StringSelectModal";
import { SubtaskFormRow } from "@/components/SubtaskFormRow";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TimeField } from "@/components/TimeField";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { FormSection } from "@/components/ui/FormSection";
import { Spacing } from "@/constants/theme";
import { CATEGORY_COLORS } from "@/domain/dimensions/listView";
import { PRIORITY_OPTIONS } from "@/domain/tasks/priority";
import {
  formatRecurrenceSummary,
  monthlyWeekdayLabel,
  WEEKDAY_LABELS,
  WEEKDAYS_EMPTY_HINT,
} from "@/domain/tasks/recurrence";
import { endOfWeekIso, todayIsoDate, visibleProjects } from "@/domain/tasks/listView";
import {
  clampDueToParent,
  isSubtaskDueDateValid,
  sortSubtasks,
} from "@/domain/tasks/subtasks";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
import { choiceChipColors } from "@/lib/color";
import { getErrorMessage } from "@/lib/errors";
import { openExternalUrl } from "@/lib/url";
import type {
  RecurrenceFrequency,
  RecurrenceMonthlyMode,
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
  const { fail } = useFeedback();
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
  const [isQuick, setIsQuick] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState("");
  const [projectId, setProjectId] = useState<string | null>(paramProjectId);
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [newTagColor, setNewTagColor] = useState("#A855F7");
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagColor, setEditTagColor] = useState("#A855F7");
  const [repeat, setRepeat] = useState<"none" | RecurrenceFrequency>("none");
  const [interval, setInterval] = useState("1");
  const [until, setUntil] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [monthlyMode, setMonthlyMode] = useState<RecurrenceMonthlyMode>("day");
  const [endMode, setEndMode] = useState<"never" | "until" | "count">("never");
  const [endCount, setEndCount] = useState("5");
  const [repeatDirty, setRepeatDirty] = useState(false);
  const [linkedRecurringId, setLinkedRecurringId] = useState<string | null>(null);
  const [originId, setOriginId] = useState<string | null>(null);
  const [existingRule, setExistingRule] = useState<RecurrenceRule | null>(null);
  const [links, setLinks] = useState<{ url: string; comment: string }[]>([
    { url: "", comment: "" },
  ]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [children, setChildren] = useState<Task[]>([]);
  const savedSubtaskTitles = useRef<Record<string, string>>({});
  const [draftSubtasks, setDraftSubtasks] = useState<string[]>([]);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [busySubtaskId, setBusySubtaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parentTaskId, setParentTaskId] = useState<string | null>(null);
  const [parentDueDate, setParentDueDate] = useState<string | null>(null);
  const [parentTitle, setParentTitle] = useState<string | null>(null);

  const isSubtask = Boolean(parentTaskId);
  const isInstance = Boolean(originId);
  const isLinked = Boolean(linkedRecurringId);
  const canEditRepeat = !isInstance && !isLinked && !isSubtask;
  const seriesOriginId = originId ?? (existingRule && editId ? editId : null);

  useEffect(() => {
    navigation.setOptions({
      title: parentTaskId
        ? "Editar subtarefa"
        : editId
          ? "Editar tarefa"
          : "Nova tarefa",
    });
  }, [editId, parentTaskId, navigation]);

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
          const parent = task.parent_task_id
            ? await fetchTaskById(task.parent_task_id)
            : null;
          if (cancelled) return;
          setTitle(task.title);
          setDescription(task.description ?? "");
          setDueDate(task.due_date);
          setDueTime(task.due_time ?? null);
          setIsQuick(Boolean(task.is_quick));
          setDurationMinutes(
            task.estimated_duration ? String(task.estimated_duration) : ""
          );
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
          setMonthlyMode(task.recurrence_rule?.monthlyMode ?? "day");
          if (task.recurrence_rule?.count) {
            setEndMode("count");
            setEndCount(String(task.recurrence_rule.count));
          } else if (task.recurrence_rule?.until) {
            setEndMode("until");
          } else {
            setEndMode("never");
          }
          setParentTaskId(task.parent_task_id);
          setParentDueDate(parent?.due_date ?? null);
          setParentTitle(parent?.title ?? null);
          setChildren(task.parent_task_id ? [] : sortSubtasks(childRows));
          savedSubtaskTitles.current = Object.fromEntries(
            childRows.map((row) => [row.id, row.title])
          );
          setLinks(
            linkRows.length > 0
              ? linkRows.map((row) => ({
                  url: row.url,
                  comment: row.comment ?? "",
                }))
              : [{ url: "", comment: "" }]
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
      if (!editId || parentTaskId) return;
      let cancelled = false;
      void fetchSubtasksApi(editId)
        .then((rows) => {
          if (!cancelled) {
            setChildren(sortSubtasks(rows));
            savedSubtaskTitles.current = Object.fromEntries(
              rows.map((row) => [row.id, row.title])
            );
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [editId, parentTaskId])
  );

  const today = todayIsoDate();
  const weekEnd = endOfWeekIso(today);
  const chipId =
    dueDate == null ? "none" : dueDate === today ? "today" : dueDate === weekEnd ? "week" : null;
  const dueDateError =
    isSubtask && parentDueDate && !isSubtaskDueDateValid(dueDate, parentDueDate)
      ? `O prazo não pode passar de ${formatDateBR(parentDueDate)}, prazo da tarefa principal.`
      : null;
  const maxDueDate = isSubtask ? parentDueDate : null;
  const projectName =
    projectId == null
      ? "Sem projeto"
      : (projects.find((project) => project.id === projectId)?.name ?? "Projeto");

  const parsedInterval = Math.max(1, Number.parseInt(interval, 10) || 1);
  const parsedCount = Math.max(1, Number.parseInt(endCount, 10) || 1);

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
      until: endMode === "until" ? until : undefined,
      count: endMode === "count" ? parsedCount : undefined,
      weekdays:
        repeat === "weekly" && weekdays.length > 0 ? [...weekdays].sort() : undefined,
      monthlyMode: repeat === "monthly" ? monthlyMode : undefined,
    };
  }, [
    canEditRepeat,
    dueDate,
    dueTime,
    endMode,
    existingRule,
    monthlyMode,
    parsedCount,
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
      estimated_duration: isQuick
        ? null
        : Math.max(0, Number.parseInt(durationMinutes, 10) || 0) || null,
      is_quick: isQuick,
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
      links
        .map((link) => ({
          url: link.url.trim(),
          comment: link.comment.trim() || null,
        }))
        .filter((link) => link.url)
    );
  }

  async function onSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      fail("Informe o título da tarefa.");
      return;
    }
    if (repeat !== "none" && canEditRepeat && !dueDate) {
      fail("Recorrência precisa de um prazo.");
      return;
    }
    if (isSubtask && !isSubtaskDueDateValid(dueDate, parentDueDate)) {
      fail(
        parentDueDate
          ? `O prazo não pode passar de ${formatDateBR(parentDueDate)}, prazo da tarefa principal.`
          : "O prazo da subtarefa não pode passar do prazo da tarefa principal."
      );
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
            due_date: dueDate,
            project_id: created.project_id,
            parent_task_id: created.id,
            description: "",
          });
        }
      }
      router.back();
    } catch (err) {
      fail(
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
        fail(getErrorMessage(err, "Não foi possível excluir a tarefa."));
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
      const created = await createTagApi(trimmed, newTagColor);
      setTags((cur) => [...cur, created].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setTagIds((cur) => [...cur, created.id]);
      setNewTagColor("#A855F7");
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível criar a tag."));
    }
  }

  function toggleTag(id: string) {
    setTagIds((cur) =>
      cur.includes(id) ? cur.filter((tagId) => tagId !== id) : [...cur, id]
    );
  }

  function startEditTag(tag: Tag) {
    setEditingTag(tag);
    setEditTagName(tag.name);
    setEditTagColor(tag.color || "#A855F7");
  }

  async function saveEditTag() {
    if (!editingTag) return;
    const trimmed = editTagName.trim();
    if (!trimmed) {
      fail("Informe o nome da tag.");
      return;
    }
    try {
      await updateTagApi({
        id: editingTag.id,
        name: trimmed,
        color: editTagColor,
      });
      setTags((cur) =>
        cur
          .map((tag) =>
            tag.id === editingTag.id
              ? { ...tag, name: trimmed, color: editTagColor }
              : tag
          )
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      );
      setEditingTag(null);
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar a tag."));
    }
  }

  function confirmDeleteTag(tag: Tag) {
    Alert.alert("Excluir tag", `Excluir “${tag.name}”?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteTagApi(tag.id);
              setTags((cur) => cur.filter((row) => row.id !== tag.id));
              setTagIds((cur) => cur.filter((id) => id !== tag.id));
              if (editingTag?.id === tag.id) setEditingTag(null);
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir a tag."));
            }
          })();
        },
      },
    ]);
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
        due_date: dueDate,
        project_id: projectId,
        parent_task_id: editId,
        description: "",
      });
      setChildren((cur) => sortSubtasks([...cur, created]));
      savedSubtaskTitles.current[created.id] = created.title;
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível adicionar a subtarefa."));
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
      fail(getErrorMessage(err, "Não foi possível renomear a subtarefa."));
    }
  }

  async function patchSubtask(
    task: Task,
    patch: { due_date?: string | null; priority?: TaskPriority | null }
  ) {
    const nextDue = clampDueToParent(
      patch.due_date !== undefined ? patch.due_date : task.due_date,
      dueDate
    );
    const nextPriority =
      patch.priority !== undefined ? patch.priority : (task.priority ?? null);
    const nextTime = nextDue ? task.due_time : null;
    setBusySubtaskId(task.id);
    setChildren((cur) =>
      sortSubtasks(
        cur.map((row) =>
          row.id === task.id
            ? {
                ...row,
                due_date: nextDue,
                due_time: nextTime,
                priority: nextPriority,
              }
            : row
        )
      )
    );
    try {
      await updateTaskApi({
        id: task.id,
        title: savedSubtaskTitles.current[task.id] ?? task.title,
        due_date: nextDue,
        due_time: nextTime,
        description: task.description ?? "",
        project_id: task.project_id,
        priority: nextPriority,
        status: task.status,
      });
    } catch (err) {
      setChildren((cur) =>
        cur.map((row) => (row.id === task.id ? task : row))
      );
      fail(getErrorMessage(err, "Não foi possível atualizar a subtarefa."));
    } finally {
      setBusySubtaskId(null);
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
      fail(getErrorMessage(err, "Não foi possível atualizar a subtarefa."));
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
              fail(
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
          <Banner message={error} />
          {isSubtask && parentTitle ? (
            <ThemedText type="small" themeColor="textSecondary">
              Subtarefa de “{parentTitle}”
            </ThemedText>
          ) : null}

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

          <Field label="Projeto">
            <Pressable
              onPress={() => setProjectPickerOpen(true)}
              style={inputStyle}
            >
              <ThemedText>{projectName}</ThemedText>
            </Pressable>
          </Field>

          <Field label="Prazo">
            <View style={styles.chipRow}>
              {DUE_CHIPS.map((chip) => (
                <ChoiceChip
                  key={chip.id}
                  label={chip.label}
                  active={chipId === chip.id}
                  onPress={() => {
                    if (chip.id === "none") {
                      setDueDate(null);
                      setDueTime(null);
                      if (canEditRepeat) {
                        setRepeat("none");
                        setRepeatDirty(true);
                      }
                    } else if (chip.id === "today") {
                      setDueDate(clampDueToParent(today, maxDueDate));
                    } else {
                      setDueDate(clampDueToParent(weekEnd, maxDueDate));
                    }
                  }}
                />
              ))}
            </View>
            {dueDate ? (
              <>
                <DateField
                  value={dueDate}
                  onChange={setDueDate}
                  maximumDate={maxDueDate}
                  style={inputStyle}
                />
                <View style={styles.chipRow}>
                  <ChoiceChip
                    label={dueTime ? "Com horário" : "Sem horário"}
                    active={Boolean(dueTime)}
                    onPress={() => setDueTime((cur) => (cur ? null : "09:00"))}
                  />
                </View>
                {dueTime ? (
                  <TimeField value={dueTime} onChange={setDueTime} style={inputStyle} />
                ) : null}
                <ChipBar
                  options={[
                    { id: "block", label: "Bloco" },
                    { id: "quick", label: "Pontual" },
                  ]}
                  value={isQuick ? "quick" : "block"}
                  onChange={(id) => setIsQuick(id === "quick")}
                />
                {!isQuick ? (
                  <TextInput
                    keyboardType="number-pad"
                    placeholder="Duração em minutos"
                    placeholderTextColor={theme.textSecondary}
                    style={inputStyle}
                    value={durationMinutes}
                    onChangeText={(value) =>
                      setDurationMinutes(value.replace(/\D/g, "").slice(0, 4))
                    }
                  />
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    Pontual vira bolinha na grade de horas, sem duração.
                  </ThemedText>
                )}
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Vai para a inbox até você definir uma data.
              </ThemedText>
            )}
            {dueDateError ? (
              <ThemedText type="small" themeColor="danger">
                {dueDateError}
              </ThemedText>
            ) : isSubtask && parentDueDate ? (
              <ThemedText type="small" themeColor="textSecondary">
                No máximo {formatDateBR(parentDueDate)} (tarefa principal).
              </ThemedText>
            ) : null}
          </Field>

          <FormSection
            title="Status e prioridade"
            defaultOpen={
              isSubtask || Boolean(editId) || status !== "todo" || Boolean(priority)
            }
            hint={
              [TASK_STATUS_LABELS[status], priority ? PRIORITY_OPTIONS.find((row) => row[0] === priority)?.[1] : null]
                .filter(Boolean)
                .join(" · ") || undefined
            }
          >
            <Field label="Status">
              <ChipBar
                options={STATUS_CHIPS}
                value={status}
                onChange={setStatus}
              />
            </Field>
            <Field label="Prioridade">
              <View style={styles.chipRow}>
                {PRIORITY_OPTIONS.map(([value, label]) => (
                  <ChoiceChip
                    key={label}
                    label={label}
                    active={priority === value}
                    onPress={() => setPriority(value)}
                  />
                ))}
              </View>
            </Field>
          </FormSection>

          <FormSection
            title="Tags"
            defaultOpen={tagIds.length > 0}
            hint={
              tagIds.length > 0
                ? `${tagIds.length} selecionada${tagIds.length === 1 ? "" : "s"}`
                : undefined
            }
          >
            {tags.length > 0 ? (
              <View style={styles.chipRow}>
                {tags.map((tag) => (
                  <Pressable
                    key={tag.id}
                    onPress={() => toggleTag(tag.id)}
                    onLongPress={() => startEditTag(tag)}
                    delayLongPress={280}
                    style={[
                      styles.chip,
                      styles.tagChip,
                      choiceChipColors(theme, tagIds.includes(tag.id)),
                    ]}
                  >
                    <View style={styles.tagChip}>
                      <View
                        style={[
                          styles.tagDot,
                          { backgroundColor: tag.color || "#A855F7" },
                        ]}
                      />
                      <ThemedText
                        type="smallBold"
                        style={
                          tagIds.includes(tag.id)
                            ? { color: theme.primary }
                            : undefined
                        }
                      >
                        {tag.name}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {editingTag ? (
              <View style={styles.field}>
                <ThemedText type="small" themeColor="textSecondary">
                  Editar tag
                </ThemedText>
                <TextInput
                  placeholder="Nome"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={editTagName}
                  onChangeText={setEditTagName}
                />
                <ColorDots value={editTagColor} onChange={setEditTagColor} />
                <View style={styles.chipRow}>
                  <FormButton
                    label="Salvar"
                    tone="primary"
                    compact
                    flex
                    onPress={() => void saveEditTag()}
                  />
                  <FormButton
                    label="Excluir"
                    tone="danger"
                    compact
                    flex
                    onPress={() => confirmDeleteTag(editingTag)}
                  />
                  <FormButton
                    label="Cancelar"
                    compact
                    flex
                    onPress={() => setEditingTag(null)}
                  />
                </View>
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
            {newTag.trim() ? (
              <ColorDots value={newTagColor} onChange={setNewTagColor} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Segure uma tag para editar ou excluir.
              </ThemedText>
            )}
          </FormSection>

          {!isSubtask ? (
          <FormSection
            title="Repetição"
            defaultOpen={repeat !== "none" || isLinked || isInstance}
            hint={repeatHint}
          >
            <Field label="Repetição">
            {canEditRepeat ? (
              <>
                <View style={styles.chipRow}>
                  {REPEAT_CHIPS.map((chip) => (
                    <ChoiceChip
                      key={chip.id}
                      label={chip.label}
                      active={repeat === chip.id}
                      onPress={() => {
                        if (chip.id !== "none" && !dueDate) setDueDate(today);
                        setRepeat(chip.id);
                        setRepeatDirty(true);
                        if (chip.id === "none") {
                          setUntil(null);
                          setWeekdays([]);
                          setInterval("1");
                          setMonthlyMode("day");
                          setEndMode("never");
                          setEndCount("5");
                        }
                      }}
                    />
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
                                choiceChipColors(
                                  theme,
                                  weekdays.includes(weekday)
                                ),
                              ]}
                            >
                              <ThemedText
                                type="smallBold"
                                style={
                                  weekdays.includes(weekday)
                                    ? { color: theme.primary }
                                    : undefined
                                }
                              >
                                {label}
                              </ThemedText>
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
                    {repeat === "monthly" && dueDate ? (
                      <View style={styles.chipRow}>
                        <ChoiceChip
                          label={`No dia ${Number(dueDate.slice(8, 10))}`}
                          active={monthlyMode === "day"}
                          onPress={() => {
                            setMonthlyMode("day");
                            setRepeatDirty(true);
                          }}
                        />
                        <ChoiceChip
                          label={monthlyWeekdayLabel(dueDate)}
                          active={monthlyMode === "weekday"}
                          onPress={() => {
                            setMonthlyMode("weekday");
                            setRepeatDirty(true);
                          }}
                        />
                      </View>
                    ) : null}
                    <ThemedText type="small" themeColor="textSecondary">
                      Termina
                    </ThemedText>
                    <View style={styles.chipRow}>
                      {(
                        [
                          ["never", "Nunca"],
                          ["until", "Em uma data"],
                          ["count", "Depois de N"],
                        ] as const
                      ).map(([id, label]) => (
                        <ChoiceChip
                          key={id}
                          label={label}
                          active={endMode === id}
                          onPress={() => {
                            setRepeatDirty(true);
                            setEndMode(id);
                            if (id === "never") setUntil(null);
                            if (id === "until") setUntil((cur) => cur ?? dueDate ?? today);
                            if (id === "count") setUntil(null);
                          }}
                        />
                      ))}
                    </View>
                    {endMode === "until" ? (
                      <>
                        <DateField
                          value={until ?? dueDate ?? today}
                          onChange={(value) => {
                            setUntil(value);
                            setRepeatDirty(true);
                          }}
                          style={inputStyle}
                        />
                        <FormButton
                          label="Remover término"
                          compact
                          onPress={() => {
                            setUntil(null);
                            setEndMode("never");
                            setRepeatDirty(true);
                          }}
                        />
                      </>
                    ) : null}
                    {endMode === "count" ? (
                      <>
                        <TextInput
                          keyboardType="number-pad"
                          value={endCount}
                          onChangeText={(value) => {
                            setEndCount(value.replace(/\D/g, "") || "1");
                            setRepeatDirty(true);
                          }}
                          style={inputStyle}
                          accessibilityLabel="Número de ocorrências"
                        />
                        <ThemedText type="small" themeColor="textSecondary">
                          ocorrências
                        </ThemedText>
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
          </FormSection>
          ) : null}

          <FormSection
            title="Links"
            defaultOpen={links.some((link) => link.url.trim())}
            hint={
              links.some((link) => link.url.trim())
                ? `${links.filter((link) => link.url.trim()).length} link${links.filter((link) => link.url.trim()).length === 1 ? "" : "s"}`
                : undefined
            }
          >
          <Field label="Links">
            {links.map((link, index) => (
              <View key={`link-${index}`} style={styles.linkBlock}>
                <View style={styles.subRow}>
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
                          rowIndex === index ? { ...row, url: value } : row
                        )
                      )
                    }
                  />
                  <FormButton
                    label="Excluir"
                    tone="danger"
                    compact
                    onPress={() =>
                      setLinks((cur) =>
                        cur.length === 1
                          ? [{ url: "", comment: "" }]
                          : cur.filter((_, rowIndex) => rowIndex !== index)
                      )
                    }
                  />
                </View>
                <TextInput
                  placeholder="Comentário (opcional)"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={link.comment}
                  onChangeText={(value) =>
                    setLinks((cur) =>
                      cur.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, comment: value } : row
                      )
                    )
                  }
                />
                {link.url.trim() ? (
                  <FormButton
                    label="Abrir"
                    compact
                    onPress={() => openExternalUrl(link.url)}
                  />
                ) : null}
              </View>
            ))}
            <FormButton
              label="Adicionar link"
              onPress={() =>
                setLinks((cur) => [...cur, { url: "", comment: "" }])
              }
            />
          </Field>
          </FormSection>

          {!isSubtask ? (
          <FormSection
            title="Subtarefas"
            defaultOpen={children.length > 0 || draftSubtasks.length > 0}
            hint={
              children.length + draftSubtasks.length > 0
                ? `${children.length + draftSubtasks.length}`
                : undefined
            }
          >
          <Field label="Subtarefas">
            {children.map((child) => (
              <SubtaskFormRow
                key={child.id}
                task={child}
                parentDueDate={dueDate}
                todayIso={today}
                busy={busySubtaskId === child.id}
                onToggle={() => void toggleSubtask(child)}
                onChangeTitle={(value) =>
                  setChildren((cur) =>
                    cur.map((row) =>
                      row.id === child.id ? { ...row, title: value } : row
                    )
                  )
                }
                onRename={(title) => void renameSubtask(child, title)}
                onOpen={() =>
                  router.push({
                    pathname: "/tasks/form",
                    params: { id: child.id },
                  })
                }
                onDelete={() => removeSaved(child)}
                onDueChange={(nextDue) =>
                  void patchSubtask(child, { due_date: nextDue })
                }
                onPriorityChange={(nextPriority) =>
                  void patchSubtask(child, { priority: nextPriority })
                }
              />
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
                <FormButton
                  label="Excluir"
                  tone="danger"
                  compact
                  onPress={() => removeDraft(index)}
                />
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
          </FormSection>
          ) : null}

          <FormSection
            title="Descrição"
            defaultOpen={description.trim().length > 0}
            hint={description.trim() ? "Preenchida" : undefined}
          >
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
          </FormSection>

          <FormButton
            label={editId ? "Salvar alterações" : "Criar tarefa"}
            tone="primary"
            disabled={saving}
            busy={saving}
            onPress={() => void onSave()}
          />

          {editId ? (
            <FormButton
              label="Excluir tarefa"
              tone="danger"
              disabled={saving}
              onPress={onDelete}
            />
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

function ColorDots({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {CATEGORY_COLORS.map((color) => (
        <Pressable
          key={color}
          onPress={() => onChange(color)}
          style={[
            styles.colorDot,
            { backgroundColor: color },
            value.toLowerCase() === color.toLowerCase() && styles.colorDotOn,
          ]}
        />
      ))}
    </View>
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
  tagChip: { flexDirection: "row", alignItems: "center", gap: 8 },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotOn: { borderColor: "#0B0F1A" },
  linkBlock: { gap: 8 },
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
