import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  createNoteApi,
  deleteNoteApi,
  fetchNoteById,
  fetchNotes,
  updateNoteApi,
} from "@/api/notes/notes";
import { fetchProjects } from "@/api/tasks/projects";
import { CanvasNote } from "@/components/CanvasNote";
import { ChipBar } from "@/components/ChipBar";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { NoteLinksSection } from "@/components/NoteLinksSection";
import { StringSelectModal } from "@/components/StringSelectModal";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { FormSection } from "@/components/ui/FormSection";
import { Spacing } from "@/constants/theme";
import { MERMAID_SNIPPET } from "@/domain/notes/mermaidSnippet";
import { insertAt, prefixLines, wrapInline } from "@/domain/notes/markdown";
import { visibleProjects } from "@/domain/tasks/listView";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import type { Note, NoteCanvasData } from "@/types/notes";

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
  const [kind, setKind] = useState<"markdown" | "canvas">("markdown");
  const [canvasData, setCanvasData] = useState<NoteCanvasData>({ elements: [] });
  const [wikiNotes, setWikiNotes] = useState<Note[]>([]);
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
  const canvasRef = useRef<NoteCanvasData>({ elements: [] });
  const projectRef = useRef<string | null>(null);
  const baselineRef = useRef({
    title: "",
    content: "",
    canvasData: { elements: [] } as NoteCanvasData,
    projectId: null as string | null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const persistRef = useRef<() => Promise<void>>(async () => {});
  const selectionRef = useRef({ start: 0, end: 0 });

  const load = useCallback(async () => {
    if (!noteId) throw new Error("Nota não encontrada.");
    const [note, projectRows, notes] = await Promise.all([
      fetchNoteById(noteId),
      fetchProjects(),
      fetchNotes(),
    ]);
    if (!note) throw new Error("Nota não encontrada.");
    setProjects(
      visibleProjects(projectRows).map((project) => ({
        id: project.id,
        name: project.name,
      }))
    );
    setWikiNotes(notes);
    const canvas = note.canvas_data ?? { elements: [] };
    titleRef.current = note.title;
    contentRef.current = note.content;
    canvasRef.current = canvas;
    projectRef.current = note.project_id;
    baselineRef.current = {
      title: note.title,
      content: note.content,
      canvasData: canvas,
      projectId: note.project_id,
    };
    loadedRef.current = true;
    setKind(note.kind);
    setTitle(note.title);
    setContent(note.content);
    setCanvasData(canvas);
    setProjectId(note.project_id);
    setSaveState("saved");
  }, [noteId]);

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
      canvasData: canvasRef.current,
      projectId: projectRef.current,
    };
    if (
      snapshot.title === baselineRef.current.title &&
      snapshot.content === baselineRef.current.content &&
      JSON.stringify(snapshot.canvasData) ===
        JSON.stringify(baselineRef.current.canvasData) &&
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
      await updateNoteApi({
        id: noteId,
        title: snapshot.title,
        content: snapshot.content,
        projectId: snapshot.projectId,
        canvasData: snapshot.canvasData,
      });
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

  function onCanvasChange(next: NoteCanvasData) {
    canvasRef.current = next;
    setCanvasData(next);
    scheduleSave();
  }

  function applyWrap(left: string, right?: string) {
    const next = wrapInline(contentRef.current, selectionRef.current, left, right);
    onContentChange(next.text);
  }

  function applyPrefix(prefix: string) {
    const next = prefixLines(contentRef.current, selectionRef.current, prefix);
    onContentChange(next.text);
  }

  function applyInsert(insertion: string) {
    const next = insertAt(contentRef.current, selectionRef.current, insertion);
    onContentChange(next.text);
    selectionRef.current = { start: next.start, end: next.end };
  }

  async function onShare() {
    const body = [titleRef.current.trim(), contentRef.current.trim()]
      .filter(Boolean)
      .join("\n\n");
    if (!body) {
      Alert.alert("Nota vazia", "Escreva algo para compartilhar.");
      return;
    }
    try {
      await persist();
      await Share.share(
        Platform.OS === "ios"
          ? { title: titleRef.current.trim() || "Nota", message: body }
          : { message: body, title: titleRef.current.trim() || "Nota" }
      );
    } catch {
      // usuário cancelou
    }
  }

  const onDelete = useCallback(() => {
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
  }, [noteId, router]);

  useEffect(() => {
    navigation.setOptions({
      title: "Nota",
      headerRight: () => (
        <Pressable onPress={onDelete} disabled={deleting} hitSlop={10}>
          <Ionicons name="trash-outline" size={20} color={theme.danger} />
        </Pressable>
      ),
    });
  }, [deleting, navigation, onDelete, theme.danger]);

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
          <Banner message={error} />
          {statusLabel ? (
            <ThemedText type="small" themeColor="textSecondary">
              {statusLabel}
            </ThemedText>
          ) : null}
          <FormSection
            title="Projeto e vínculos"
            hint={projectName}
            defaultOpen={false}
          >
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
            {noteId ? <NoteLinksSection noteId={noteId} /> : null}
          </FormSection>
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
          {kind === "canvas" ? (
            <CanvasNote
              data={canvasData}
              editable={mode === "edit" && !deleting}
              onChange={onCanvasChange}
            />
          ) : mode === "preview" ? (
            <ScrollView
              style={[styles.bodyInput, inputStyle]}
              contentContainerStyle={styles.preview}
            >
              <MarkdownPreview
                text={content}
                wiki={{
                  notes: wikiNotes,
                  onOpen: (id) => router.push(`/notes/${id}`),
                  onCreate: (wikiTitle) => {
                    void createNoteApi({ title: wikiTitle, content: "" }).then(
                      (note) => router.push(`/notes/${note.id}`)
                    );
                  },
                }}
              />
            </ScrollView>
          ) : (
            <>
              <View style={styles.toolbar}>
                <Pressable
                  onPressIn={() => applyWrap("**")}
                  style={[styles.tool, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="smallBold">N</ThemedText>
                </Pressable>
                <Pressable
                  onPressIn={() => applyWrap("*")}
                  style={[styles.tool, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="smallBold">I</ThemedText>
                </Pressable>
                <Pressable
                  onPressIn={() => applyPrefix("- ")}
                  style={[styles.tool, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="smallBold">Lista</ThemedText>
                </Pressable>
                <Pressable
                  onPressIn={() => applyPrefix("- [ ] ")}
                  style={[styles.tool, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="smallBold">Check</ThemedText>
                </Pressable>
                <Pressable
                  onPressIn={() => applyWrap("[[", "]]")}
                  style={[styles.tool, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="smallBold">[[ ]]</ThemedText>
                </Pressable>
                <Pressable
                  onPressIn={() => applyInsert(`\n\n${MERMAID_SNIPPET}\n`)}
                  style={[styles.tool, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="smallBold">Diagrama</ThemedText>
                </Pressable>
              </View>
              <TextInput
                multiline
                placeholder="Escreva em markdown…"
                placeholderTextColor={theme.textSecondary}
                style={[styles.bodyInput, inputStyle]}
                value={content}
                onChangeText={onContentChange}
                onSelectionChange={(event) => {
                  selectionRef.current = event.nativeEvent.selection;
                }}
                textAlignVertical="top"
                editable={!deleting}
              />
            </>
          )}
          <FormButton
            label="Compartilhar"
            disabled={deleting}
            onPress={() => void onShare()}
          />
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
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tool: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  error: { color: "#E11D48", textAlign: "center" },
});
