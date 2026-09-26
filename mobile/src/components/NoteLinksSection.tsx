import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { fetchGoals } from "@/api/goals/goals";
import {
  addNoteLink,
  fetchLinksForNote,
  removeNoteLink,
} from "@/api/notes/noteLinks";
import { fetchProjects } from "@/api/tasks/projects";
import { fetchTasks } from "@/api/tasks/tasks";
import { ChipBar } from "@/components/ChipBar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import {
  NOTE_LINK_PICK_TYPES,
  NOTE_LINK_TYPE_LABEL,
} from "@/domain/notes/noteLinks";
import { visibleProjects } from "@/domain/tasks/listView";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { NoteLink } from "@/types/notes";

export function NoteLinksSection({ noteId }: { noteId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { fail } = useFeedback();
  const [links, setLinks] = useState<NoteLink[]>([]);
  const [pickType, setPickType] = useState<"task" | "project" | "goal">("task");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<
    Record<"task" | "project" | "goal", { id: string; label: string }[]>
  >({
    task: [],
    project: [],
    goal: [],
  });

  const load = useCallback(async () => {
    const [nextLinks, tasks, projects, goals] = await Promise.all([
      fetchLinksForNote(noteId),
      fetchTasks(),
      fetchProjects(),
      fetchGoals(),
    ]);
    setLinks(nextLinks);
    setOptions({
      task: tasks
        .filter((task) => !task.parent_task_id)
        .map((task) => ({ id: task.id, label: task.title })),
      project: visibleProjects(projects).map((project) => ({
        id: project.id,
        label: project.name,
      })),
      goal: goals.map((goal) => ({ id: goal.id, label: goal.title })),
    });
  }, [noteId]);

  useEffect(() => {
    void load().catch((err) => {
      fail(getErrorMessage(err, "Não foi possível carregar os vínculos."));
    });
  }, [fail, load]);

  const available = useMemo(() => {
    const taken = new Set(
      links
        .filter((link) => link.entity_type === pickType)
        .map((link) => link.entity_id)
    );
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return options[pickType].filter((row) => {
      if (taken.has(row.id)) return false;
      if (!needle) return true;
      return row.label.toLocaleLowerCase("pt-BR").includes(needle);
    });
  }, [links, options, pickType, query]);

  async function onPick(entityId: string) {
    const option = options[pickType].find((row) => row.id === entityId);
    if (!option) return;
    try {
      const created = await addNoteLink({
        note_id: noteId,
        entity_type: pickType,
        entity_id: entityId,
        label: option.label,
      });
      setLinks((cur) => [...cur, created]);
      setQuery("");
      setPickerOpen(false);
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível vincular."));
    }
  }

  async function onRemove(link: NoteLink) {
    setLinks((cur) => cur.filter((row) => row.id !== link.id));
    try {
      await removeNoteLink(link.id);
    } catch (err) {
      setLinks((cur) => [...cur, link]);
      fail(getErrorMessage(err, "Não foi possível remover o vínculo."));
    }
  }

  function openLink(link: NoteLink) {
    const id = link.entity_id;
    switch (link.entity_type) {
      case "task":
        router.push({ pathname: "/tasks/form", params: { id } });
        return;
      case "goal":
        router.push({ pathname: "/goals/form", params: { id } });
        return;
      case "habit":
        router.push({ pathname: "/habits/form", params: { id } });
        return;
      case "project":
        router.navigate(`/tasks/projects/${id}`);
        return;
      case "book":
        router.navigate(`/books/${id}`);
        return;
      case "movie":
        router.navigate(`/movies/${id}`);
        return;
      case "album":
        router.navigate(`/music/${id}`);
        return;
      case "trip":
        router.navigate(`/travel/${id}`);
        return;
      case "place":
        router.navigate(`/places/${id}`);
        return;
      case "vehicle":
        router.navigate(`/cars/${id}`);
        return;
    }
  }

  return (
    <View style={styles.stack}>
      {links.length > 0 ? (
        <View style={styles.chips}>
          {links.map((link) => (
            <View
              key={link.id}
              style={[
                styles.chip,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            >
              <Pressable onPress={() => openLink(link)} style={styles.chipCopy}>
                <ThemedText type="small" themeColor="textSecondary">
                  {NOTE_LINK_TYPE_LABEL[link.entity_type]}
                </ThemedText>
                <ThemedText type="smallBold" numberOfLines={1} style={styles.chipLabel}>
                  {link.label || "Referência"}
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => void onRemove(link)} hitSlop={8}>
                <Ionicons name="close" size={14} color={theme.danger} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Nada vinculado ainda.
        </ThemedText>
      )}
      <Pressable
        onPress={() => setPickerOpen(true)}
        style={[
          styles.addBtn,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.backgroundSelected,
          },
        ]}
      >
        <Ionicons name="add" size={18} color={theme.primary} />
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          Vincular
        </ThemedText>
      </Pressable>
      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setQuery("");
          setPickerOpen(false);
        }}
      >
        <ThemedView style={styles.flex}>
          <View style={styles.modalHead}>
            <ThemedText type="smallBold">Vincular a nota</ThemedText>
            <Pressable
              onPress={() => {
                setQuery("");
                setPickerOpen(false);
              }}
              hitSlop={8}
            >
              <ThemedText type="linkPrimary">Fechar</ThemedText>
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            <ChipBar
              options={NOTE_LINK_PICK_TYPES.map((id) => ({
                id,
                label: NOTE_LINK_TYPE_LABEL[id],
              }))}
              value={pickType}
              onChange={(next) => {
                setPickType(next);
                setQuery("");
              }}
            />
            <TextInput
              placeholder={`Buscar ${NOTE_LINK_TYPE_LABEL[pickType].toLowerCase()}`}
              placeholderTextColor={theme.textSecondary}
              value={query}
              onChangeText={setQuery}
              style={[
                styles.search,
                {
                  color: theme.text,
                  borderColor: theme.backgroundSelected,
                  backgroundColor: theme.backgroundElement,
                },
              ]}
            />
            <ScrollView
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
            >
              {available.length === 0 ? (
                <ThemedText themeColor="textSecondary">
                  Nada para vincular neste recorte.
                </ThemedText>
              ) : (
                available.map((opt) => (
                  <Pressable
                    key={opt.id}
                    onPress={() => void onPick(opt.id)}
                    style={[
                      styles.row,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <ThemedText>{opt.label}</ThemedText>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </ThemedView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: Spacing.two },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
  },
  chipCopy: { flexShrink: 1, gap: 1 },
  chipLabel: { maxWidth: 220 },
  addBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  modalBody: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.two },
  search: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  list: { paddingBottom: 48, gap: Spacing.two },
  row: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14 },
});
