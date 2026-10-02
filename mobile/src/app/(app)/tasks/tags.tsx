import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { deleteTagApi, fetchTagUsage, fetchTags, updateTagApi } from "@/api/tasks/tags";
import { ColorDots } from "@/components/ColorDots";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Card } from "@/components/ui/Card";
import { FormButton } from "@/components/ui/FormButton";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Tag } from "@/types/tasks";

export default function TagsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { ok, fail } = useFeedback();
  const [tags, setTags] = useState<Tag[]>([]);
  const [usage, setUsage] = useState<Map<string, number>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#94a3b8");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tagList, counts] = await Promise.all([fetchTags(), fetchTagUsage()]);
      setTags(tagList);
      setUsage(counts);
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível carregar as tags."));
    } finally {
      setLoading(false);
    }
  }, [fail]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function openEdit(tag: Tag) {
    setEditingId(tag.id);
    setName(tag.name);
    setColor(tag.color);
  }

  async function save() {
    if (!editingId || !name.trim()) return;
    setSaving(true);
    try {
      await updateTagApi({ id: editingId, name: name.trim(), color });
      ok("Tag salva!");
      setEditingId(null);
      await load();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar a tag."));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(tag: Tag) {
    Alert.alert(
      "Excluir esta tag?",
      "As tarefas e projetos continuam existindo, só perdem o vínculo com esta tag.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void deleteTagApi(tag.id)
              .then(async () => {
                ok("Tag excluída");
                if (editingId === tag.id) setEditingId(null);
                await load();
              })
              .catch((err) =>
                fail(getErrorMessage(err, "Não foi possível excluir a tag."))
              );
          },
        },
      ]
    );
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
      <ScrollView contentContainerStyle={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">
          Nome, cor e onde cada tag está em uso. Tags novas são criadas direto no formulário da
          tarefa.
        </ThemedText>
        <FormButton
          label="Ícones de link"
          compact
          onPress={() => router.push("/tasks/link-icons")}
        />
        {tags.length === 0 ? (
          <Card style={styles.card}>
            <ThemedText type="smallBold">Nenhuma tag ainda</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Digite um nome novo no campo de tags do formulário da tarefa e confirme.
            </ThemedText>
          </Card>
        ) : (
          tags.map((tag) => {
            const editing = editingId === tag.id;
            return (
              <Card key={tag.id} style={styles.card}>
                <View style={styles.row}>
                  <View style={[styles.swatch, { backgroundColor: tag.color }]} />
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
                    {tag.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {usage.get(tag.id) ?? 0} em uso
                  </ThemedText>
                  <Pressable
                    accessibilityLabel={`Editar ${tag.name}`}
                    hitSlop={8}
                    onPress={() => (editing ? setEditingId(null) : openEdit(tag))}
                  >
                    <Ionicons name="pencil-outline" size={18} color={theme.textSecondary} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Excluir ${tag.name}`}
                    hitSlop={8}
                    onPress={() => confirmDelete(tag)}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.danger} />
                  </Pressable>
                </View>
                {editing ? (
                  <View style={styles.edit}>
                    <TextInput
                      placeholder="Nome"
                      placeholderTextColor={theme.textSecondary}
                      value={name}
                      onChangeText={setName}
                      style={[
                        styles.input,
                        {
                          color: theme.text,
                          borderColor: theme.backgroundSelected,
                          backgroundColor: theme.backgroundElement,
                        },
                      ]}
                    />
                    <ColorDots value={color} onChange={setColor} />
                    <View style={styles.row}>
                      <FormButton
                        label="Salvar alterações"
                        tone="primary"
                        compact
                        flex
                        busy={saving}
                        disabled={!name.trim()}
                        onPress={() => void save()}
                      />
                      <FormButton
                        label="Cancelar"
                        compact
                        flex
                        onPress={() => setEditingId(null)}
                      />
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  card: { gap: 10, padding: Spacing.three },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  swatch: { width: 16, height: 16, borderRadius: 8 },
  edit: { gap: 10 },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
});
