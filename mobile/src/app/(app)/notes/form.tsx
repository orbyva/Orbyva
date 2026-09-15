import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { createNoteApi, fetchNotes } from "@/api/notes/notes";
import { fetchProjects } from "@/api/tasks/projects";
import { CanvasNote } from "@/components/CanvasNote";
import { ChipBar } from "@/components/ChipBar";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { StringSelectModal } from "@/components/StringSelectModal";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { Spacing } from "@/constants/theme";
import { MERMAID_SNIPPET } from "@/domain/notes/mermaidSnippet";
import { insertAt } from "@/domain/notes/markdown";
import { visibleProjects } from "@/domain/tasks/listView";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import type { Note, NoteCanvasData, NoteKind } from "@/types/notes";

const NO_PROJECT = "__none__";

export default function NoteCreateScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const paramProjectId =
    typeof params.projectId === "string" && params.projectId.length > 0
      ? params.projectId
      : null;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<NoteKind>("markdown");
  const [canvasData, setCanvasData] = useState<NoteCanvasData>({ elements: [] });
  const [wikiNotes, setWikiNotes] = useState<Note[]>([]);
  const [projectId, setProjectId] = useState<string | null>(paramProjectId);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: "Nova nota" });
  }, [navigation]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchProjects(), fetchNotes()])
      .then(([rows, notes]) => {
        if (cancelled) return;
        setProjects(
          visibleProjects(rows).map((project) => ({
            id: project.id,
            name: project.name,
          }))
        );
        setWikiNotes(notes);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível carregar os projetos."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const note = await createNoteApi(
        kind === "canvas"
          ? { title, projectId, kind: "canvas", canvasData }
          : { title, content, projectId }
      );
      router.replace(`/notes/${note.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível criar a nota."));
    } finally {
      setSaving(false);
    }
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

  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.body}>
          <Banner message={error} />
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={[styles.project, inputStyle]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Projeto
            </ThemedText>
            <ThemedText>{projectName}</ThemedText>
          </Pressable>
          <TextInput
            autoFocus
            placeholder="Título"
            placeholderTextColor={theme.textSecondary}
            style={[styles.title, inputStyle]}
            value={title}
            onChangeText={setTitle}
          />
          <ChipBar
            options={[
              { id: "markdown", label: "Texto" },
              { id: "canvas", label: "Desenho" },
            ]}
            value={kind}
            onChange={(next) => setKind(next)}
          />
          {kind === "canvas" ? (
            <CanvasNote
              data={canvasData}
              editable
              onChange={setCanvasData}
            />
          ) : (
            <>
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
              <View style={styles.tools}>
                <Pressable
                  onPress={() =>
                    setContent((cur) => insertAt(cur, { start: cur.length, end: cur.length }, "[[").text)
                  }
                  style={[styles.tool, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="smallBold">[[ ]]</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() =>
                    setContent((cur) =>
                      insertAt(
                        cur,
                        { start: cur.length, end: cur.length },
                        `\n\n${MERMAID_SNIPPET}\n`
                      ).text
                    )
                  }
                  style={[styles.tool, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="smallBold">Diagrama</ThemedText>
                </Pressable>
              </View>
            <TextInput
              multiline
              placeholder="Escreva em markdown… Use [[Título]] para linkar outra nota."
              placeholderTextColor={theme.textSecondary}
              style={[styles.bodyInput, inputStyle]}
              value={content}
              onChangeText={setContent}
              textAlignVertical="top"
            />
            </>
          )}
            </>
          )}
          <FormButton
            label="Salvar nota"
            tone="primary"
            disabled={saving}
            busy={saving}
            onPress={() => void onSave()}
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
        onSelect={(id) => setProjectId(id === NO_PROJECT ? null : id)}
        onClose={() => setPickerOpen(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tool: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
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
