import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { deleteNoteFolderApi, fetchNoteFolders } from "@/api/notes/folders";
import { fetchProjects } from "@/api/tasks/projects";
import { fetchTags } from "@/api/tasks/tags";
import { FilterRow, FilterSelect } from "@/components/FilterSelect";
import { NoteFolderTree } from "@/components/NoteFolderTree";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import {
  filterNotes,
  filterNotesByProject,
  NOTE_PROJECT_ALL,
  NOTE_PROJECT_NONE,
  noteExcerpt,
} from "@/domain/notes/listView";
import { notesInFolder, type FolderNav } from "@/domain/notes/folders";
import { visibleProjects } from "@/domain/tasks/listView";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { setNoteFolderNav } from "@/lib/noteFolderNav";
import type { Note, NoteFolder } from "@/types/notes";
import type { Project, Tag } from "@/types/tasks";

export default function NotesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [rows, setRows] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState(NOTE_PROJECT_ALL);
  const [folderNav, setFolderNav] = useState<FolderNav>(null);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [nextNotes, nextFolders, nextProjects, nextTags] = await Promise.all([
      fetchNotes(),
      fetchNoteFolders(),
      fetchProjects(),
      fetchTags(),
    ]);
    setRows(nextNotes);
    setFolders(nextFolders);
    setProjects(nextProjects);
    setTags(nextTags);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar as notas.")
            );
          }
        })
        .finally(() => {
          if (!cancelled) {
            hasLoaded.current = true;
            setLoading(false);
          }
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
  const folderNameById = useMemo(
    () => Object.fromEntries(folders.map((folder) => [folder.id, folder.name])),
    [folders]
  );
  const visible = useMemo(
    () =>
      filterNotes(
        filterNotesByProject(notesInFolder(rows, folderNav), projectFilter),
        search
      ),
    [folderNav, projectFilter, rows, search]
  );

  useEffect(() => {
    setNoteFolderNav(folderNav);
  }, [folderNav]);

  function onFolderNav(next: FolderNav) {
    setFolderNav(next);
  }

  function openNote(note: Note) {
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

  async function handleDeleteFolder(folder: NoteFolder) {
    try {
      await deleteNoteFolderApi(folder.id);
      setRows((prev) =>
        prev.map((note) =>
          note.folder_id === folder.id ? { ...note, folder_id: null } : note
        )
      );
      setFolders((prev) => {
        const parentId = folder.parent_id;
        return prev
          .filter((item) => item.id !== folder.id)
          .map((item) =>
            item.parent_id === folder.id ? { ...item, parent_id: parentId } : item
          );
      });
      if (folderNav === folder.id) onFolderNav(null);
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível excluir a pasta."));
    }
  }

  const emptyTitle =
    rows.length === 0
      ? "Nenhuma nota ainda"
      : visible.length === 0 && search.trim()
        ? "Nenhuma nota encontrada"
        : visible.length === 0
          ? "Esta pasta está vazia"
          : null;
  const emptyCopy =
    rows.length === 0
      ? "Use o + para escrever ou desenhar."
      : visible.length === 0 && search.trim()
        ? `Nada com “${search}” no título nem no conteúdo.`
        : "Crie uma nota aqui — ela nasce nesta pasta.";

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
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
            <FilterRow>
              <FilterSelect
                label="Projeto"
                value={projectFilter}
                options={projectChips}
                onChange={setProjectFilter}
              />
            </FilterRow>
          ) : null}
          <NoteFolderTree
            folders={folders}
            notes={rows}
            projects={projects}
            tags={tags}
            selected={folderNav}
            onSelect={onFolderNav}
            onCreate={(parentId) =>
              router.push(
                parentId
                  ? `/notes/folder-form?parentId=${encodeURIComponent(parentId)}`
                  : "/notes/folder-form"
              )
            }
            onEdit={(folder) =>
              router.push(
                `/notes/folder-form?id=${encodeURIComponent(folder.id)}`
              )
            }
            onDelete={(folder) => void handleDeleteFolder(folder)}
          />
          {emptyTitle ? (
            <View style={styles.empty}>
              <ThemedText type="smallBold">{emptyTitle}</ThemedText>
              <ThemedText themeColor="textSecondary">{emptyCopy}</ThemedText>
            </View>
          ) : (
            visible.map((note) => {
              const excerpt =
                note.kind === "canvas"
                  ? "Desenho"
                  : noteExcerpt(note.content);
              const projectName = note.project_id
                ? projectNameById[note.project_id]
                : null;
              const folderName =
                folderNav == null && note.folder_id
                  ? folderNameById[note.folder_id]
                  : null;
              return (
                <Card key={note.id}>
                  <View style={styles.card}>
                    <View style={styles.cardHead}>
                      <Pressable
                        onPress={() => openNote(note)}
                        onLongPress={() => confirmDelete(note)}
                        style={styles.cardCopy}
                      >
                        <ThemedText type="smallBold" numberOfLines={1}>
                          {note.title}
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDelete(note)}
                        hitSlop={8}
                        style={styles.trash}
                        accessibilityLabel="Excluir nota"
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={theme.danger}
                        />
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={() => openNote(note)}
                      onLongPress={() => confirmDelete(note)}
                    >
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
                        {[folderName, projectName, formatDateBR(note.updated_at)]
                          .filter(Boolean)
                          .join(" · ")}
                      </ThemedText>
                    </Pressable>
                  </View>
                </Card>
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
  card: {
    padding: Spacing.three,
    gap: 4,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  cardCopy: { flex: 1, minWidth: 0 },
  trash: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { gap: Spacing.one, paddingVertical: Spacing.four },
  banner: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
});
