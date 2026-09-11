import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
import { StringSelectModal } from "@/components/StringSelectModal";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import {
  NOTE_LINK_PICK_TYPES,
  NOTE_LINK_TYPE_LABEL,
} from "@/domain/notes/noteLinks";
import { visibleProjects } from "@/domain/tasks/listView";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { NoteLink, NoteLinkEntityType } from "@/types/notes";

export function NoteLinksSection({ noteId }: { noteId: string }) {
  const router = useRouter();
  const { fail } = useFeedback();
  const [links, setLinks] = useState<NoteLink[]>([]);
  const [pickType, setPickType] = useState<"task" | "project" | "goal">("task");
  const [pickerOpen, setPickerOpen] = useState(false);
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
  }, [load]);

  const available = useMemo(() => {
    const taken = new Set(
      links
        .filter((link) => link.entity_type === pickType)
        .map((link) => link.entity_id)
    );
    return options[pickType].filter((row) => !taken.has(row.id));
  }, [links, options, pickType]);

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
      <ThemedText type="small" themeColor="textSecondary">
        Vínculos
      </ThemedText>
      {links.length > 0 ? (
        <View style={styles.chips}>
          {links.map((link) => (
            <View key={link.id} style={styles.chip}>
              <Pressable onPress={() => openLink(link)} style={styles.chipCopy}>
                <ThemedText type="smallBold">
                  {NOTE_LINK_TYPE_LABEL[link.entity_type]}
                </ThemedText>
                <ThemedText type="small" numberOfLines={1} style={styles.chipLabel}>
                  {link.label || "Referência"}
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => void onRemove(link)} hitSlop={8}>
                <ThemedText type="small" themeColor="danger">
                  ×
                </ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <ChipBar
        options={NOTE_LINK_PICK_TYPES.map((id) => ({
          id,
          label: NOTE_LINK_TYPE_LABEL[id],
        }))}
        value={pickType}
        onChange={setPickType}
      />
      <Pressable onPress={() => setPickerOpen(true)}>
        <ThemedText type="linkPrimary">Vincular {NOTE_LINK_TYPE_LABEL[pickType].toLowerCase()}</ThemedText>
      </Pressable>
      <StringSelectModal
        visible={pickerOpen}
        title={`Vincular ${NOTE_LINK_TYPE_LABEL[pickType].toLowerCase()}`}
        searchable={available.length > 8}
        selectedId={null}
        options={available}
        onSelect={(id) => {
          void onPick(id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
  },
  chipCopy: { flexShrink: 1, gap: 2 },
  chipLabel: { maxWidth: 220 },
});
