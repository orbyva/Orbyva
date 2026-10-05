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
  View,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import {
  createNoteApi,
  deleteNoteApi,
  fetchNoteById,
  fetchNotes,
  updateNoteApi,
} from "@/api/notes/notes";
import { fetchNoteFolders } from "@/api/notes/folders";
import { fetchProjects } from "@/api/tasks/projects";
import { CanvasNote } from "@/components/CanvasNote";
import { ChipBar } from "@/components/ChipBar";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { NoteFolderPicker } from "@/components/NoteFolderPicker";
import { NoteLinksSection } from "@/components/NoteLinksSection";
import { NoteBacklinksSection } from "@/components/notes/NoteBacklinksSection";
import { StringSelectModal } from "@/components/StringSelectModal";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, FormSection, Input } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { MERMAID_SNIPPET } from "@/domain/notes/mermaidSnippet";
import { insertAt, prefixLines, wrapInline } from "@/domain/notes/markdown";
import { folderNavForNote } from "@/domain/notes/folders";
import { buildNotePrintHtml } from "@/domain/notes/printNote";
import { visibleProjects } from "@/domain/tasks/listView";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import { useFeedback } from "@/hooks/use-toast";
import { setNoteFolderNav } from "@/lib/noteFolderNav";
import type { Note, NoteCanvasData, NoteFolder } from "@/types/notes";

const SAVE_DELAY_MS = 800;
const NO_PROJECT = "__none__";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function NoteEditorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ id?: string }>();
  const noteId = typeof params.id === "string" ? params.id : "";

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<"markdown" | "canvas">("markdown");
  const [canvasData, setCanvasData] = useState<NoteCanvasData>({ elements: [] });
  const [wikiNotes, setWikiNotes] = useState<Note[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
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
  const folderRef = useRef<string | null>(null);
  const baselineRef = useRef({
    title: "",
    content: "",
    canvasData: { elements: [] } as NoteCanvasData,
    projectId: null as string | null,
    folderId: null as string | null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const persistRef = useRef<() => Promise<void>>(async () => {});
  const selectionRef = useRef({ start: 0, end: 0 });

  const load = useCallback(async () => {
    if (!noteId) throw new Error("Nota não encontrada.");
    const [note, projectRows, notes, folderRows] = await Promise.all([
      fetchNoteById(noteId),
      fetchProjects(),
      fetchNotes(),
      fetchNoteFolders(),
    ]);
    if (!note) throw new Error("Nota não encontrada.");
    setProjects(
      visibleProjects(projectRows).map((project) => ({
        id: project.id,
        name: project.name,
      }))
    );
    setWikiNotes(notes);
    setFolders(folderRows);
    const canvas = note.canvas_data ?? { elements: [] };
    titleRef.current = note.title;
    contentRef.current = note.content;
    canvasRef.current = canvas;
    projectRef.current = note.project_id;
    folderRef.current = note.folder_id;
    baselineRef.current = {
      title: note.title,
      content: note.content,
      canvasData: canvas,
      projectId: note.project_id,
      folderId: note.folder_id,
    };
    loadedRef.current = true;
    setKind(note.kind);
    setTitle(note.title);
    setContent(note.content);
    setCanvasData(canvas);
    setProjectId(note.project_id);
    setFolderId(note.folder_id);
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
      folderId: folderRef.current,
    };
    if (
      snapshot.title === baselineRef.current.title &&
      snapshot.content === baselineRef.current.content &&
      JSON.stringify(snapshot.canvasData) ===
        JSON.stringify(baselineRef.current.canvasData) &&
      snapshot.projectId === baselineRef.current.projectId &&
      snapshot.folderId === baselineRef.current.folderId
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
        folderId: snapshot.folderId,
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

  function onFolderChange(id: string | null) {
    folderRef.current = id;
    setFolderId(id);
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

  async function onExportPdf() {
    const title = titleRef.current.trim() || "Nota";
    const body = contentRef.current;
    if (!title && !body.trim()) {
      Alert.alert("Nota vazia", "Escreva algo para exportar.");
      return;
    }
    try {
      await persist();
      const html = buildNotePrintHtml(title, body);
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: "Exportar PDF",
        });
      } else {
        await Print.printAsync({ html });
      }
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível exportar o PDF."));
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
          <Ionicons name="trash-outline" size={20} color={theme.destructive} />
        </Pressable>
      ),
    });
  }, [deleting, navigation, onDelete, theme.destructive]);

  const inputStyle = {
    color: theme.foreground,
    borderColor: theme.border,
    backgroundColor: theme.muted,
  };
  const projectName =
    projectId == null
      ? "Sem projeto"
      : (projects.find((project) => project.id === projectId)?.name ?? "Projeto");
  const folderName =
    folderId == null
      ? "Sem pasta"
      : (folders.find((folder) => folder.id === folderId)?.name ?? "Pasta");

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
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Banner message={error} />
          {statusLabel ? (
            <ThemedText type="small" themeColor="mutedForeground">
              {statusLabel}
            </ThemedText>
          ) : null}
          <Pressable
            onPress={() => {
              setNoteFolderNav(folderNavForNote(folderId));
              router.replace("/notes");
            }}
            disabled={deleting}
            style={[styles.folderChip, inputStyle]}
            accessibilityRole="button"
            accessibilityLabel={`Abrir lista na pasta ${folderName}`}
          >
            <Ionicons
              name="folder-outline"
              size={16}
              color={theme.mutedForeground}
            />
            <ThemedText type="small" numberOfLines={1} style={styles.folderChipLabel}>
              {folderName}
            </ThemedText>
            <Ionicons
              name="chevron-forward"
              size={14}
              color={theme.mutedForeground}
            />
          </Pressable>
          <FormSection
            title="Projeto e vínculos"
            hint={`${folderName} · ${projectName}`}
            defaultOpen={false}
          >
            <Pressable
              onPress={() => setPickerOpen(true)}
              disabled={deleting}
              style={[styles.project, inputStyle]}
            >
              <ThemedText type="small" themeColor="mutedForeground">
                Projeto
              </ThemedText>
              <ThemedText>{projectName}</ThemedText>
            </Pressable>
            <NoteFolderPicker
              folders={folders}
              value={folderId}
              onChange={onFolderChange}
              disabled={deleting}
              style={[styles.project, inputStyle]}
            />
            {noteId ? <NoteLinksSection noteId={noteId} /> : null}
          </FormSection>
          <Input
            placeholder="Título"
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
            <View style={[styles.bodyInput, inputStyle, styles.previewBox]}>
              <MarkdownPreview
                text={content}
                wiki={{
                  notes: wikiNotes,
                  onOpen: (id) => router.push(`/notes/${id}`),
                  onCreate: (wikiTitle) => {
                    void createNoteApi({ title: wikiTitle, content: "", folderId: null }).then(
                      (note) => router.push(`/notes/${note.id}`)
                    );
                  },
                }}
              />
            </View>
          ) : (
            <>
              <View style={styles.toolbar}>
                <Pressable
                  onPressIn={() => applyWrap("**")}
                  style={[styles.tool, { backgroundColor: theme.muted }]}
                >
                  <ThemedText type="smallBold">N</ThemedText>
                </Pressable>
                <Pressable
                  onPressIn={() => applyWrap("*")}
                  style={[styles.tool, { backgroundColor: theme.muted }]}
                >
                  <ThemedText type="smallBold">I</ThemedText>
                </Pressable>
                <Pressable
                  onPressIn={() => applyPrefix("- ")}
                  style={[styles.tool, { backgroundColor: theme.muted }]}
                >
                  <ThemedText type="smallBold">Lista</ThemedText>
                </Pressable>
                <Pressable
                  onPressIn={() => applyPrefix("- [ ] ")}
                  style={[styles.tool, { backgroundColor: theme.muted }]}
                >
                  <ThemedText type="smallBold">Check</ThemedText>
                </Pressable>
                <Pressable
                  onPressIn={() => applyWrap("[[", "]]")}
                  style={[styles.tool, { backgroundColor: theme.muted }]}
                >
                  <ThemedText type="smallBold">[[ ]]</ThemedText>
                </Pressable>
                <Pressable
                  onPressIn={() => applyInsert(`\n\n${MERMAID_SNIPPET}\n`)}
                  style={[styles.tool, { backgroundColor: theme.muted }]}
                >
                  <ThemedText type="smallBold">Diagrama</ThemedText>
                </Pressable>
              </View>
              <Input
                multiline
                placeholder="Escreva em markdown…"
                style={[styles.bodyInput, inputStyle]}
                value={content}
                onChangeText={onContentChange}
                onSelectionChange={(event) => {
                  selectionRef.current = event.nativeEvent.selection;
                }}
                textAlignVertical="top"
                editable={!deleting}
                scrollEnabled={false}
              />
            </>
          )}
          <View style={styles.actions}>
            <Button
              label="Exportar PDF"
              disabled={deleting || kind === "canvas"}
              onPress={() => void onExportPdf()}
              variant="outline"
              style={{ flex: 1 }}
            />
            <Button
              label="Compartilhar"
              disabled={deleting}
              onPress={() => void onShare()}
              size="lg"
              style={{ flex: 1 }}
            />
          </View>
          {noteId ? <NoteBacklinksSection noteId={noteId} title={title} /> : null}
        </ScrollView>
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
    flexGrow: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  project: {
    minHeight: 48,
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  folderChip: {
    minHeight: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  folderChipLabel: { flexShrink: 1 },
  title: {
    minHeight: 44,
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    ...TypeScale.heading,
  },
  bodyInput: {
    minHeight: 280,
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    ...TypeScale.body,
  },
  previewBox: { paddingVertical: 12 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tool: {
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actions: { flexDirection: "row", gap: Spacing.two, marginTop: Spacing.two },
});
