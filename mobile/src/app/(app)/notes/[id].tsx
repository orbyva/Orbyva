import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
  deleteNoteApi,
  fetchNoteById,
  updateNoteApi,
} from "@/api/notes/notes";
import { fetchProjects } from "@/api/tasks/projects";
import { ChipBar } from "@/components/ChipBar";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { StringSelectModal } from "@/components/StringSelectModal";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { visibleProjects } from "@/domain/tasks/listView";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";

const SAVE_DELAY_MS = 800;
const NO_PROJECT = "__none__";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function NoteEditorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string }>();
  const noteId = typeof params.id === "string" ? params.id : "";

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadedRef = useRef(false);
  const titleRef = useRef("");
  const contentRef = useRef("");
  const projectRef = useRef<string | null>(null);
  const baselineRef = useRef({
    title: "",
    content: "",
    projectId: null as string | null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const persistRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    if (!noteId) throw new Error("Nota não encontrada.");
    const [note, projectRows] = await Promise.all([
      fetchNoteById(noteId),
      fetchProjects(),
    ]);
    if (!note) throw new Error("Nota não encontrada.");
    setProjects(
      visibleProjects(projectRows).map((project) => ({
        id: project.id,
        name: project.name,
      }))
    );
    if (note.kind === "canvas") {
      Alert.alert(
        "Canvas",
        "Desenho Excalidraw fica no web nesta versão.",
        [{ text: "OK", onPress: () => router.back() }]
      );
      return;
    }
    titleRef.current = note.title;
    contentRef.current = note.content;
    projectRef.current = note.project_id;
    baselineRef.current = {
      title: note.title,
      content: note.content,
      projectId: note.project_id,
    };
    loadedRef.current = true;
    setTitle(note.title);
    setContent(note.content);
    setProjectId(note.project_id);
    setSaveState("saved");
  }, [noteId, router]);

  useEffect(() => {
    navigation.setOptions({ title: "Nota" });
  }, [navigation]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadedRef.current = false;
    void load()
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir a nota."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const persist = useCallback(async () => {
    if (!noteId || !loadedRef.current) return;
    const snapshot = {
      title: titleRef.current,
      content: contentRef.current,
      projectId: projectRef.current,
    };
    if (
      snapshot.title === baselineRef.current.title &&
      snapshot.content === baselineRef.current.content &&
      snapshot.projectId === baselineRef.current.projectId
    ) {
      return;
    }
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    try {
      await updateNoteApi({ id: noteId, ...snapshot });
      baselineRef.current = snapshot;
      setSaveState("saved");
      setError(null);
    } catch (err) {
      setSaveState("error");
      setError(getErrorMessage(err, "Não foi possível salvar a nota."));
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        await persistRef.current();
      }
    }
  }, [noteId]);

  persistRef.current = persist;

  function scheduleSave() {
    if (!loadedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist();
    }, SAVE_DELAY_MS);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void persistRef.current();
    };
  }, []);

  function onTitleChange(value: string) {
    titleRef.current = value;
    setTitle(value);
    scheduleSave();
  }

  function onContentChange(value: string) {
    contentRef.current = value;
    setContent(value);
    scheduleSave();
  }

  function onProjectChange(id: string | null) {
    projectRef.current = id;
    setProjectId(id);
    scheduleSave();
  }

  function onDelete() {
    if (!noteId) return;
    Alert.alert("Excluir nota", "Essa ação não tem volta.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            if (timerRef.current) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
            loadedRef.current = false;
            setDeleting(true);
            try {
              await deleteNoteApi(noteId);
              router.back();
            } catch (err) {
              loadedRef.current = true;
              setError(
                getErrorMessage(err, "Não foi possível excluir a nota.")
              );
              setDeleting(false);
            }
          })();
        },
      },
    ]);
  }

  const inputStyle = {
    color: theme.text,
    borderColor: theme.backgroundSelected,
    backgroundColor: theme.backgroundElement,
  };
  const projectName =
    projectId == null
      ? "Sem projeto"
      : (projects.find((project) => project.id === projectId)?.name ?? "Projeto");

  const statusLabel =
    saveState === "saving"
      ? "Salvando…"
      : saveState === "saved"
        ? "Salvo"
        : saveState === "error"
          ? "Erro ao salvar"
          : "";

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
      >
        <View style={styles.body}>
          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
          {statusLabel ? (
            <ThemedText type="small" themeColor="textSecondary">
              {statusLabel}
            </ThemedText>
          ) : null}
          <Pressable
            onPress={() => setPickerOpen(true)}
            disabled={deleting}
            style={[styles.project, inputStyle]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Projeto
            </ThemedText>
            <ThemedText>{projectName}</ThemedText>
          </Pressable>
          <TextInput
            placeholder="Título"
            placeholderTextColor={theme.textSecondary}
            style={[styles.title, inputStyle]}
            value={title}
            onChangeText={onTitleChange}
            editable={!deleting}
          />
          <ChipBar
            options={[
              { id: "edit", label: "Editar" },
              { id: "preview", label: "Prévia" },
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === "preview" ? (
            <ScrollView
              style={[styles.bodyInput, inputStyle]}
              contentContainerStyle={styles.preview}
            >
              <MarkdownPreview text={content} />
            </ScrollView>
          ) : (
            <TextInput
              multiline
              placeholder="Escreva em markdown…"
              placeholderTextColor={theme.textSecondary}
              style={[styles.bodyInput, inputStyle]}
              value={content}
              onChangeText={onContentChange}
              textAlignVertical="top"
              editable={!deleting}
            />
          )}
          <Pressable disabled={deleting} onPress={onDelete}>
            <ThemedText style={styles.error}>Excluir nota</ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <StringSelectModal
        visible={pickerOpen}
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
        onSelect={(id) => onProjectChange(id === NO_PROJECT ? null : id)}
        onClose={() => setPickerOpen(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  project: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  title: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: "600",
  },
  bodyInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    fontSize: 16,
    lineHeight: 24,
  },
  preview: { paddingVertical: 12, paddingBottom: 24 },
  error: { color: "#E11D48", textAlign: "center" },
});
