import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { fetchNotesLinkedTo, fetchTaskMentions, type MentionRow } from "@/api/notes/mentions";
import { MentionList } from "@/components/notes/MentionList";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";

/**
 * "Referenciada em" (notas e tarefas com a marca desta tarefa) + notas ligadas por `note_link`.
 * Sem nada para mostrar, não renderiza: o formulário de tarefa já é comprido.
 */
export function TaskMentionsSection({ taskId }: { taskId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const [notes, setNotes] = useState<MentionRow[]>([]);
  const [tasks, setTasks] = useState<MentionRow[]>([]);
  const [linked, setLinked] = useState<MentionRow[]>([]);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetchTaskMentions(taskId).catch(() => ({ notes: [], tasks: [] })),
      fetchNotesLinkedTo("task", taskId).catch(() => []),
    ]).then(([mentions, linkedNotes]) => {
      if (!alive) return;
      setNotes(mentions.notes);
      setTasks(mentions.tasks);
      setLinked(linkedNotes.map((note) => ({ id: note.id, title: note.title })));
    });
    return () => {
      alive = false;
    };
  }, [taskId]);

  if (notes.length === 0 && tasks.length === 0 && linked.length === 0) return null;

  const openNote = (id: string) => router.push(`/notes/${id}`);
  return (
    <View style={[styles.section, { borderTopColor: theme.border }]}>
      {notes.length > 0 || tasks.length > 0 ? (
        <View style={styles.head}>
          <Ionicons name="return-up-back-outline" size={14} color={theme.mutedForeground} />
          <ThemedText type="small" themeColor="mutedForeground">
            REFERENCIADA EM
          </ThemedText>
        </View>
      ) : null}
      <MentionList caption="Notas" icon="document-text-outline" rows={notes} onOpen={openNote} />
      <MentionList
        caption="Tarefas"
        icon="checkbox-outline"
        rows={tasks}
        onOpen={(id) => router.push({ pathname: "/tasks/form", params: { id } })}
      />
      <MentionList
        caption="Notas ligadas a esta tarefa"
        icon="link-outline"
        rows={linked}
        onOpen={openNote}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: "row", alignItems: "center", gap: 4 },
});
