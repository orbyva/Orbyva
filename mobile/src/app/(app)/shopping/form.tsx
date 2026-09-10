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
  createShoppingItemApi,
  createTaskFromShoppingItemApi,
  deleteShoppingItemApi,
  fetchShoppingCategories,
  fetchShoppingItemById,
  fetchTaskLinksForItems,
  updateShoppingItemApi,
} from "@/api/shopping/items";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

const NO_CATEGORY = "__none__";

export default function ShoppingFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [providerLink, setProviderLink] = useState("");
  const [categories, setCategories] = useState<ShoppingCategory[]>([]);
  const [categoryId, setCategoryId] = useState(NO_CATEGORY);
  const [newCategory, setNewCategory] = useState("");
  const [existing, setExisting] = useState<ShoppingItem | null>(null);
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar item" : "Novo item" });
  }, [editId, navigation]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const rows = await fetchShoppingCategories();
        if (cancelled) return;
        setCategories(rows);
        if (editId) {
          const item = await fetchShoppingItemById(editId);
          if (!item) throw new Error("Item não encontrado.");
          if (cancelled) return;
          setExisting(item);
          setTitle(item.title);
          setQuantity(item.quantity != null ? String(item.quantity) : "");
          setUnit(item.unit ?? "");
          setDescription(item.description ?? "");
          setProviderLink(item.provider_link ?? "");
          setCategoryId(item.shopping_category_id ?? NO_CATEGORY);
          const links = await fetchTaskLinksForItems([item.id]);
          if (!cancelled) setLinkedTaskId(links.get(item.id) ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir o item."));
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

  function parsedQuantity(): number | null {
    const trimmed = quantity.trim().replace(",", ".");
    if (!trimmed) return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  }

  async function resolveCategoryId(): Promise<string | null> {
    const createdName = newCategory.trim();
    if (createdName) {
      const created = await createShoppingCategoryApi({ name: createdName });
      return created.id;
    }
    return categoryId === NO_CATEGORY ? null : categoryId;
  }

  async function onSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Informe o nome do item.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const nextCategoryId = await resolveCategoryId();
      if (editId) {
        await updateShoppingItemApi({
          id: editId,
          title: trimmed,
          categoryId: nextCategoryId,
          quantity: parsedQuantity(),
          unit: unit.trim() || null,
          description: description.trim(),
          providerLink: providerLink.trim() || null,
        });
      } else {
        await createShoppingItemApi({
          title: trimmed,
          categoryId: nextCategoryId,
          quantity: parsedQuantity(),
          unit: unit.trim() || null,
          description: description.trim(),
          providerLink: providerLink.trim() || null,
        });
      }
      router.back();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          editId
            ? "Não foi possível salvar o item."
            : "Não foi possível adicionar o item."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert("Excluir item", "Essa ação não tem volta.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deleteShoppingItemApi(editId);
              router.back();
            } catch (err) {
              setError(
                getErrorMessage(err, "Não foi possível excluir o item.")
              );
              setSaving(false);
            }
          })();
        },
      },
    ]);
  }

  async function onConvert() {
    if (!existing) return;
    if (linkedTaskId) {
      setError("Este item já tem uma tarefa.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const category =
        categories.find((row) => row.id === existing.shopping_category_id) ??
        null;
      await createTaskFromShoppingItemApi(existing, category);
      router.back();
    } catch (err) {
      setError(
        getErrorMessage(err, "Não foi possível criar a tarefa deste item.")
      );
    } finally {
      setSaving(false);
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
          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Item *
            </ThemedText>
            <TextInput
              autoFocus={!editId}
              placeholder="Ex: Leite, pão, detergente"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={title}
              onChangeText={setTitle}
            />
          </View>
          <View style={styles.row}>
            <View style={[styles.field, styles.flex]}>
              <ThemedText type="small" themeColor="textSecondary">
                Quantidade
              </ThemedText>
              <TextInput
                keyboardType="decimal-pad"
                placeholder="2"
                placeholderTextColor={theme.textSecondary}
                style={inputStyle}
                value={quantity}
                onChangeText={setQuantity}
              />
            </View>
            <View style={[styles.field, styles.flex]}>
              <ThemedText type="small" themeColor="textSecondary">
                Unidade
              </ThemedText>
              <TextInput
                placeholder="kg, un, pct"
                placeholderTextColor={theme.textSecondary}
                style={inputStyle}
                value={unit}
                onChangeText={setUnit}
              />
            </View>
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Categoria
            </ThemedText>
            <View style={styles.chips}>
              <Pressable
                onPress={() => setCategoryId(NO_CATEGORY)}
                style={[
                  styles.chip,
                  { backgroundColor: theme.backgroundElement },
                  categoryId === NO_CATEGORY && {
                    backgroundColor: theme.backgroundSelected,
                  },
                ]}
              >
                <ThemedText type="smallBold">Sem categoria</ThemedText>
              </Pressable>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => {
                    setCategoryId(category.id);
                    setNewCategory("");
                  }}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    categoryId === category.id && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{category.name}</ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Nova categoria
            </ThemedText>
            <TextInput
              placeholder="Opcional — cria e usa nesta hora"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={newCategory}
              onChangeText={(value) => {
                setNewCategory(value);
                if (value.trim()) setCategoryId(NO_CATEGORY);
              }}
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Descrição
            </ThemedText>
            <TextInput
              multiline
              placeholder="Opcional"
              placeholderTextColor={theme.textSecondary}
              style={[inputStyle, styles.area]}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Link
            </ThemedText>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={providerLink}
              onChangeText={setProviderLink}
            />
          </View>
          <Pressable
            disabled={saving}
            onPress={() => void onSave()}
            style={[styles.primary, { backgroundColor: theme.primary }]}
          >
            {saving ? (
              <ActivityIndicator color="#0B0F1A" />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryLabel}>
                {editId ? "Salvar alterações" : "Adicionar"}
              </ThemedText>
            )}
          </Pressable>
          {editId && !linkedTaskId ? (
            <Pressable disabled={saving} onPress={() => void onConvert()}>
              <ThemedText type="linkPrimary">Criar tarefa</ThemedText>
            </Pressable>
          ) : null}
          {linkedTaskId ? (
            <ThemedText type="small" themeColor="textSecondary">
              Já existe uma tarefa ligada a este item.
            </ThemedText>
          ) : null}
          {editId ? (
            <Pressable disabled={saving} onPress={onDelete}>
              <ThemedText style={styles.error}>Excluir item</ThemedText>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  field: { gap: 8 },
  row: { flexDirection: "row", gap: 12 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  area: { minHeight: 96, paddingTop: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
});
