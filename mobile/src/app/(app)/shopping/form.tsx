import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
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
import { ChipBar } from "@/components/ChipBar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, FormSection, Input } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

const NO_CATEGORY = "__none__";

export default function ShoppingFormScreen() {
  const theme = useTheme();
  const { fail } = useFeedback();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string; categoryId?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;
  const paramCategoryId =
    typeof params.categoryId === "string" && params.categoryId.length > 0
      ? params.categoryId
      : null;

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
        } else if (paramCategoryId) {
          setCategoryId(paramCategoryId);
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
  }, [editId, paramCategoryId]);

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
      fail("Informe o nome do item.");
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
      fail(
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
              fail(
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
      fail("Este item já tem uma tarefa.");
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
      fail(
        getErrorMessage(err, "Não foi possível criar a tarefa deste item.")
      );
    } finally {
      setSaving(false);
    }
  }


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
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Banner message={error} />
          <View style={styles.field}>
            <ThemedText type="small" themeColor="mutedForeground">
              Item *
            </ThemedText>
            <Input
              autoFocus={!editId}
              placeholder="Ex: Leite, pão, detergente"
              value={title}
              onChangeText={setTitle}
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="mutedForeground">
              Categoria
            </ThemedText>
            <ChipBar
              options={[
                { id: NO_CATEGORY, label: "Sem categoria" },
                ...categories.map((category) => ({
                  id: category.id,
                  label: category.name,
                })),
              ]}
              value={categoryId}
              onChange={(id) => {
                setCategoryId(id);
                setNewCategory("");
              }}
            />
          </View>
          <FormSection
            title="Detalhes"
            defaultOpen={Boolean(
              quantity.trim() ||
                unit.trim() ||
                description.trim() ||
                providerLink.trim() ||
                newCategory.trim()
            )}
            hint="Quantidade, unidade, descrição e link"
          >
          <View style={styles.row}>
            <View style={[styles.field, styles.flex]}>
              <ThemedText type="small" themeColor="mutedForeground">
                Quantidade
              </ThemedText>
              <Input
                keyboardType="decimal-pad"
                placeholder="2"
                value={quantity}
                onChangeText={setQuantity}
              />
            </View>
            <View style={[styles.field, styles.flex]}>
              <ThemedText type="small" themeColor="mutedForeground">
                Unidade
              </ThemedText>
              <Input
                placeholder="kg, un, pct"
                value={unit}
                onChangeText={setUnit}
              />
            </View>
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="mutedForeground">
              Nova categoria
            </ThemedText>
            <Input
              placeholder="Opcional — cria e usa nesta hora"
              value={newCategory}
              onChangeText={(value) => {
                setNewCategory(value);
                if (value.trim()) setCategoryId(NO_CATEGORY);
              }}
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="mutedForeground">
              Descrição
            </ThemedText>
            <Input
              multiline
              placeholder="Opcional"
              style={styles.area}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="small" themeColor="mutedForeground">
              Link
            </ThemedText>
            <Input
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://"
              value={providerLink}
              onChangeText={setProviderLink}
            />
          </View>
          </FormSection>
          <Button
            label={editId ? "Salvar alterações" : "Adicionar"}
            disabled={saving}
            loading={saving}
            onPress={() => void onSave()}
            size="lg"
          />
          {editId && !linkedTaskId ? (
            <Button
              label="Criar tarefa"
              disabled={saving}
              onPress={() => void onConvert()}
              variant="outline"
            />
          ) : null}
          {linkedTaskId ? (
            <Button
              label="Abrir tarefa ligada"
              onPress={() =>
                router.push({
                  pathname: "/tasks/form",
                  params: { id: linkedTaskId },
                })
              }
              variant="outline"
            />
          ) : null}
          {editId ? (
            <Button
              label="Excluir item"
              disabled={saving}
              onPress={onDelete}
              variant="destructive"
            />
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
  area: { minHeight: 96, paddingTop: 12 },
});
