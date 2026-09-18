import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";

import {
  createNoteFolderApi,
  deleteNoteFolderApi,
  fetchNoteFolders,
  updateNoteFolderApi,
} from "@/api/notes/folders";
import { createTagApi, fetchTags } from "@/api/tasks/tags";
import { fetchProjects } from "@/api/tasks/projects";
import { StringSelectModal } from "@/components/StringSelectModal";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { Spacing } from "@/constants/theme";
import { CATEGORY_COLORS } from "@/domain/dimensions/listView";
import {
  folderDepthLimitMessage,
  canMoveFolder,
  canNestUnder,
  flattenFolderTree,
} from "@/domain/notes/folders";
import { visibleProjects } from "@/domain/tasks/listView";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import type { NoteFolder } from "@/types/notes";
import type { Tag } from "@/types/tasks";

const ROOT = "__root__";
const NO_PROJECT = "__none__";
const NO_TAG = "__none__";

type Picker = "parent" | "project" | "tag" | null;

export default function NoteFolderFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string; parentId?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;
  const defaultParentId =
    typeof params.parentId === "string" && params.parentId.length > 0
      ? params.parentId
      : null;

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(defaultParentId);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tagId, setTagId] = useState<string | null>(null);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [picker, setPicker] = useState<Picker>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: editId ? "Editar pasta" : "Nova pasta",
    });
  }, [editId, navigation]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchNoteFolders(), fetchProjects(), fetchTags()])
      .then(([folderRows, projectRows, tagRows]) => {
        if (cancelled) return;
        setFolders(folderRows);
        setProjects(
          visibleProjects(projectRows).map((project) => ({
            id: project.id,
            name: project.name,
          }))
        );
        setTags(tagRows);
        if (editId) {
          const folder = folderRows.find((row) => row.id === editId);
          if (!folder) throw new Error("Pasta não encontrada.");
          setName(folder.name);
          setParentId(folder.parent_id);
          setProjectId(folder.project_id);
          setTagId(folder.tag_id);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir a pasta."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const parentOptions = useMemo(() => {
    const rows = flattenFolderTree(folders).filter(({ folder }) => {
      if (editId && folder.id === editId) return false;
      if (editId) return canMoveFolder(folders, editId, folder.id);
      return canNestUnder(folders, folder.id);
    });
    return [
      { id: ROOT, label: "Raiz" },
      ...rows.map(({ folder, depth }) => ({
        id: folder.id,
        label: `${"— ".repeat(depth - 1)}${folder.name}`,
      })),
    ];
  }, [editId, folders]);

  async function onSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe o nome da pasta.");
      return;
    }
    if (editId) {
      if (!canMoveFolder(folders, editId, parentId)) {
        setError(folderDepthLimitMessage("move"));
        return;
      }
    } else if (!canNestUnder(folders, parentId)) {
      setError(folderDepthLimitMessage("create"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editId) {
        await updateNoteFolderApi({
          id: editId,
          name: trimmed,
          parent_id: parentId,
          project_id: projectId,
          tag_id: tagId,
        });
      } else {
        await createNoteFolderApi({
          name: trimmed,
          parent_id: parentId,
          project_id: projectId,
          tag_id: tagId,
        });
      }
      router.back();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          editId
            ? "Não foi possível salvar a pasta."
            : "Não foi possível criar a pasta."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert(`Excluir a pasta ${name.trim() || "esta pasta"}?`, "As notas desta pasta vão para Sem pasta. Subpastas sobem um nível.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deleteNoteFolderApi(editId);
              router.back();
            } catch (err) {
              setError(
                getErrorMessage(err, "Não foi possível excluir a pasta.")
              );
              setSaving(false);
            }
          })();
        },
      },
    ]);
  }

  async function onCreateTag() {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    const existing = tags.find(
      (tag) =>
        tag.name.toLocaleLowerCase("pt-BR") ===
        trimmed.toLocaleLowerCase("pt-BR")
    );
    if (existing) {
      setTagId(existing.id);
      setNewTag("");
      return;
    }
    try {
      const color =
        CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
      const created = await createTagApi(trimmed, color);
      setTags((cur) =>
        [...cur, created].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      );
      setTagId(created.id);
      setNewTag("");
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível criar a etiqueta."));
    }
  }

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];
  const parentLabel =
    parentId == null
      ? "Raiz"
      : (folders.find((folder) => folder.id === parentId)?.name ?? "Pasta");
  const projectLabel =
    projectId == null
      ? "Sem projeto"
      : (projects.find((project) => project.id === projectId)?.name ?? "Projeto");
  const tagLabel =
    tagId == null
      ? "Sem etiqueta"
      : (tags.find((tag) => tag.id === tagId)?.name ?? "Etiqueta");

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
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Banner message={error} />
          <TextInput
            autoFocus={!editId}
            placeholder="Nome da pasta"
            placeholderTextColor={theme.textSecondary}
            style={inputStyle}
            value={name}
            onChangeText={setName}
          />
          <Pressable onPress={() => setPicker("parent")} style={inputStyle}>
            <ThemedText type="small" themeColor="textSecondary">
              Dentro de
            </ThemedText>
            <ThemedText>{parentLabel}</ThemedText>
          </Pressable>
          <Pressable onPress={() => setPicker("project")} style={inputStyle}>
            <ThemedText type="small" themeColor="textSecondary">
              Projeto
            </ThemedText>
            <ThemedText>{projectLabel}</ThemedText>
          </Pressable>
          <Pressable onPress={() => setPicker("tag")} style={inputStyle}>
            <ThemedText type="small" themeColor="textSecondary">
              Etiqueta
            </ThemedText>
            <ThemedText>{tagLabel}</ThemedText>
          </Pressable>
          <TextInput
            placeholder="Nova etiqueta"
            placeholderTextColor={theme.textSecondary}
            style={inputStyle}
            value={newTag}
            onChangeText={setNewTag}
            onSubmitEditing={() => void onCreateTag()}
            returnKeyType="done"
          />
          <FormButton
            label={editId ? "Salvar pasta" : "Criar pasta"}
            tone="primary"
            disabled={saving}
            busy={saving}
            onPress={() => void onSave()}
          />
          {editId ? (
            <FormButton
              label="Excluir pasta"
              tone="danger"
              disabled={saving}
              onPress={onDelete}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <StringSelectModal
        visible={picker === "parent"}
        title="Dentro de"
        selectedId={parentId ?? ROOT}
        options={parentOptions}
        onSelect={(id) => setParentId(id === ROOT ? null : id)}
        onClose={() => setPicker(null)}
        searchable={parentOptions.length > 8}
      />
      <StringSelectModal
        visible={picker === "project"}
        title="Projeto"
        selectedId={projectId ?? NO_PROJECT}
        options={[
          { id: NO_PROJECT, label: "Sem projeto" },
          ...projects.map((project) => ({
            id: project.id,
            label: project.name,
          })),
        ]}
        onSelect={(id) => setProjectId(id === NO_PROJECT ? null : id)}
        onClose={() => setPicker(null)}
        searchable={projects.length > 8}
      />
      <StringSelectModal
        visible={picker === "tag"}
        title="Etiqueta"
        selectedId={tagId ?? NO_TAG}
        options={[
          { id: NO_TAG, label: "Sem etiqueta" },
          ...tags.map((tag) => ({ id: tag.id, label: tag.name })),
        ]}
        onSelect={(id) => setTagId(id === NO_TAG ? null : id)}
        onClose={() => setPicker(null)}
        searchable={tags.length > 8}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: {
    padding: Spacing.four,
    gap: Spacing.two,
    paddingBottom: 40,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
    fontSize: 16,
  },
});
