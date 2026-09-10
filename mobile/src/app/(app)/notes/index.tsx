import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { deleteNoteApi, fetchNotes } from "@/api/notes/notes";
import { fetchProjects } from "@/api/tasks/projects";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import {
  filterNotes,
  filterNotesByProject,
  NOTE_PROJECT_ALL,
  NOTE_PROJECT_NONE,
  noteExcerpt,
} from "@/domain/notes/listView";
import { visibleProjects } from "@/domain/tasks/listView";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { Note } from "@/types/notes";
import type { Project } from "@/types/tasks";

export default function NotesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [rows, setRows] = useState<Note[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState(NOTE_PROJECT_ALL);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [nextNotes, nextProjects] = await Promise.all([
      fetchNotes(),
      fetchProjects(),
    ]);
    setRows(nextNotes);
    setProjects(nextProjects);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar as notas.")
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setRefreshing(false);
    }
  }

  const projectChips = useMemo(
    () => [
      { id: NOTE_PROJECT_ALL, label: "Todos" },
      { id: NOTE_PROJECT_NONE, label: "Sem projeto" },
      ...visibleProjects(projects).map((project) => ({
        id: project.id,
        label: project.name,
      })),
    ],
    [projects]
  );
  const projectNameById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.name])),
    [projects]
  );
  const visible = useMemo(
    () => filterNotes(filterNotesByProject(rows, projectFilter), search),
    [projectFilter, rows, search]
  );

  function openNote(note: Note) {
    if (note.kind === "canvas") {
      Alert.alert(
        "Canvas",
        "Desenho Excalidraw fica no web nesta versão. Abra a nota no computador para editar."
      );
      return;
    }
    router.navigate(`/notes/${note.id}`);
  }

  function confirmDelete(note: Note) {
    Alert.alert("Excluir nota", note.title, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteNoteApi(note.id);
              setRows((cur) => cur.filter((row) => row.id !== note.id));
            } catch (err) {
              setError(
                getErrorMessage(err, "Não foi possível excluir a nota.")
              );
            }
          })();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.flex}>
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: bottomInset + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
            />
          }
        >
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar notas"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.search,
              {
                color: theme.text,
                borderColor: theme.backgroundSelected,
                backgroundColor: theme.backgroundElement,
              },
            ]}
          />
          {projectChips.length > 2 ? (
            <View style={styles.chips}>
              {projectChips.map((chip) => (
                <Pressable
                  key={chip.id}
                  onPress={() => setProjectFilter(chip.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    projectFilter === chip.id && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{chip.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
          {visible.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type="smallBold">Nenhuma nota ainda</ThemedText>
              <ThemedText themeColor="textSecondary">
                Use o + para escrever em markdown simples.
              </ThemedText>
            </View>
          ) : (
            visible.map((note) => {
              const excerpt =
                note.kind === "canvas"
                  ? "Canvas · só no web"
                  : noteExcerpt(note.content);
              const projectName = note.project_id
                ? projectNameById[note.project_id]
                : null;
              return (
                <Pressable
                  key={note.id}
                  onPress={() => openNote(note)}
                  onLongPress={() => confirmDelete(note)}
                  style={[
                    styles.card,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {note.title}
                  </ThemedText>
                  {excerpt ? (
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      numberOfLines={2}
                    >
                      {excerpt}
                    </ThemedText>
                  ) : null}
                  <ThemedText type="small" themeColor="textSecondary">
                    {[projectName, formatDateBR(note.updated_at)]
                      .filter(Boolean)
                      .join(" · ")}
                  </ThemedText>
                  <Pressable onPress={() => confirmDelete(note)} hitSlop={8}>
                    <ThemedText type="small" style={styles.delete}>
                      Excluir
                    </ThemedText>
                  </Pressable>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  search: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: Spacing.one,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  card: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: 4,
  },
  empty: { gap: Spacing.one, paddingVertical: Spacing.four },
  delete: { color: "#E11D48" },
  error: {
    color: "#E11D48",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
});
