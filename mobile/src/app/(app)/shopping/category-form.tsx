import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
  createShoppingCategoryApi,
  deleteShoppingCategoryApi,
  fetchShoppingCategories,
  updateShoppingCategoryApi,
} from "@/api/shopping/items";
import { fetchProjects } from "@/api/tasks/projects";
import { StringSelectModal } from "@/components/StringSelectModal";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { Spacing } from "@/constants/theme";
import { CATEGORY_COLORS } from "@/domain/dimensions/listView";
import { visibleProjects } from "@/domain/tasks/listView";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";

const NO_PROJECT = "__none__";

export default function ShoppingCategoryFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: editId ? "Editar categoria" : "Nova categoria",
    });
  }, [editId, navigation]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const [projectRows, categoryRows] = await Promise.all([
          fetchProjects(),
          fetchShoppingCategories(),
        ]);
        if (cancelled) return;
        setProjects(
          visibleProjects(projectRows).map((project) => ({
            id: project.id,
            name: project.name,
          }))
        );
        if (editId) {
          const category = categoryRows.find((row) => row.id === editId);
          if (!category) throw new Error("Categoria não encontrada.");
          setName(category.name);
          setProjectId(category.project_id ?? null);
          setColor(category.color || CATEGORY_COLORS[0]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            getErrorMessage(err, "Não foi possível abrir a categoria.")
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  async function onSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe o nome da categoria.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editId) {
        await updateShoppingCategoryApi({
          id: editId,
          name: trimmed,
          projectId,
          color,
        });
      } else {
        await createShoppingCategoryApi({ name: trimmed, projectId, color });
      }
      router.back();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          editId
            ? "Não foi possível salvar a categoria."
            : "Não foi possível criar a categoria."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert(
      "Excluir categoria",
      "Os itens desta categoria também são excluídos.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                await deleteShoppingCategoryApi(editId);
                router.back();
              } catch (err) {
                setError(
                  getErrorMessage(
                    err,
                    "Não foi possível excluir a categoria."
                  )
                );
                setSaving(false);
              }
            })();
          },
        },
      ]
    );
  }

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];
  const projectName =
    projectId == null
      ? "Sem projeto"
      : (projects.find((project) => project.id === projectId)?.name ?? "Projeto");

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
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Nome *
            </ThemedText>
            <TextInput
              autoFocus={!editId}
              placeholder="Ex: Mercado, Farmácia"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={name}
              onChangeText={setName}
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Projeto
            </ThemedText>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={inputStyle}
            >
              <ThemedText>{projectName}</ThemedText>
            </Pressable>
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Cor
            </ThemedText>
            <View style={styles.colors}>
              {CATEGORY_COLORS.map((swatch) => (
                <Pressable
                  key={swatch}
                  onPress={() => setColor(swatch)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: swatch },
                    color.toLowerCase() === swatch.toLowerCase() &&
                      styles.colorDotOn,
                  ]}
                />
              ))}
            </View>
          </View>
          <FormButton
            label={editId ? "Salvar alterações" : "Criar categoria"}
            tone="primary"
            disabled={saving}
            busy={saving}
            onPress={() => void onSave()}
          />
          {editId ? (
            <FormButton
              label="Excluir categoria"
              tone="danger"
              disabled={saving}
              onPress={onDelete}
            />
          ) : null}
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
        onSelect={(id) => setProjectId(id === NO_PROJECT ? null : id)}
        onClose={() => setPickerOpen(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  field: { gap: 8 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: "center",
    fontSize: 16,
  },
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
  error: { color: "#E11D48", textAlign: "center" },
  colors: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotOn: { borderColor: "#0B0F1A" },
});
