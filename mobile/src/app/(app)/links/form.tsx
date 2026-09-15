import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  createContentLink,
  deleteContentLink,
  fetchContentLinkById,
  updateContentLink,
} from "@/api/links/links";
import { createTagApi, fetchTags } from "@/api/tasks/tags";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { Spacing } from "@/constants/theme";
import {
  isValidContentLinkUrl,
  LINK_STATUS_LABELS,
  LINK_TYPE_LABELS,
  normalizeContentLinkUrl,
  suggestContentLinkType,
} from "@/domain/contentLinks";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { ContentLinkStatus, ContentLinkType } from "@/types/contentLinks";
import type { Tag } from "@/types/tasks";

const TYPE_CHIPS = (Object.keys(LINK_TYPE_LABELS) as ContentLinkType[]).map(
  (id) => ({ id, label: LINK_TYPE_LABELS[id] })
);
const STATUS_CHIPS = (Object.keys(LINK_STATUS_LABELS) as ContentLinkStatus[]).map(
  (id) => ({ id, label: LINK_STATUS_LABELS[id] })
);

export default function LinkFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [loading, setLoading] = useState(Boolean(editId));
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ContentLinkType>("article");
  const [status, setStatus] = useState<ContentLinkStatus>("to_consume");
  const [notes, setNotes] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar link" : "Novo link" });
  }, [editId, navigation]);

  useEffect(() => {
    let cancelled = false;
    void fetchTags()
      .then((rows) => {
        if (!cancelled) setTags(rows);
      })
      .catch(() => {
        /* tags opcionais */
      });
    if (!editId) {
      return () => {
        cancelled = true;
      };
    }
    void fetchContentLinkById(editId)
      .then((link) => {
        if (cancelled) return;
        if (!link) {
          setError("Link não encontrado.");
          return;
        }
        setTitle(link.title);
        setUrl(link.url);
        setType(link.type);
        setStatus(link.status);
        setNotes(link.notes ?? "");
        setFavorite(link.is_favorite);
        setTagIds(link.tag_ids ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir o link."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

  function onChangeUrl(next: string) {
    setUrl(next);
    const suggested = suggestContentLinkType(next);
    if (suggested) setType(suggested);
  }

  async function onSave() {
    const trimmedTitle = title.trim();
    const normalized = normalizeContentLinkUrl(url);
    if (!trimmedTitle) {
      fail("Informe o título.");
      return;
    }
    if (!isValidContentLinkUrl(normalized)) {
      fail("Informe uma URL válida.");
      return;
    }
    setSaving(true);
    setError(null);
    const fields = {
      title: trimmedTitle,
      url: normalized,
      type,
      status,
      notes: notes.trim() || null,
      is_favorite: favorite,
      tag_ids: tagIds,
    };
    try {
      if (editId) {
        await updateContentLink({
          id: editId,
          ...fields,
        });
      } else {
        await createContentLink(fields);
      }
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar o link."));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert("Excluir link", title || "Esse link", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deleteContentLink(editId);
              router.back();
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir o link."));
              setSaving(false);
            }
          })();
        },
      },
    ]);
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
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Banner message={error} />
          <Field label="Título" required>
            <TextInput
              autoFocus={!editId}
              placeholder="Como você vai reconhecer"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={title}
              onChangeText={setTitle}
            />
          </Field>
          <Field label="URL" required>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={url}
              onChangeText={onChangeUrl}
            />
          </Field>
          <Field label="Tipo">
            <View style={styles.chips}>
              {TYPE_CHIPS.map((chip) => (
                <Pressable
                  key={chip.id}
                  onPress={() => setType(chip.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    type === chip.id && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{chip.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label="Status">
            <View style={styles.chips}>
              {STATUS_CHIPS.map((chip) => (
                <Pressable
                  key={chip.id}
                  onPress={() => setStatus(chip.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    status === chip.id && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{chip.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label="Notas">
            <TextInput
              placeholder="Opcional"
              placeholderTextColor={theme.textSecondary}
              style={[inputStyle, styles.multiline]}
              multiline
              value={notes}
              onChangeText={setNotes}
            />
          </Field>
          <Pressable
            onPress={() => setFavorite((cur) => !cur)}
            style={[
              styles.chip,
              { backgroundColor: theme.backgroundElement, alignSelf: "flex-start" },
              favorite && { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="smallBold">
              {favorite ? "♥ Favorito" : "Marcar favorito"}
            </ThemedText>
          </Pressable>
          <Field label="Tags">
            <View style={styles.chips}>
              {tags.map((tag) => (
                <Pressable
                  key={tag.id}
                  onPress={() =>
                    setTagIds((cur) =>
                      cur.includes(tag.id)
                        ? cur.filter((id) => id !== tag.id)
                        : [...cur, tag.id]
                    )
                  }
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    tagIds.includes(tag.id) && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{tag.name}</ThemedText>
                </Pressable>
              ))}
            </View>
            <TextInput
              placeholder="Nova tag"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={newTag}
              onChangeText={setNewTag}
              onSubmitEditing={() => {
                const trimmed = newTag.trim();
                if (!trimmed) return;
                setNewTag("");
                const existing = tags.find(
                  (tag) =>
                    tag.name.toLocaleLowerCase("pt-BR") ===
                    trimmed.toLocaleLowerCase("pt-BR")
                );
                if (existing) {
                  setTagIds((cur) =>
                    cur.includes(existing.id) ? cur : [...cur, existing.id]
                  );
                  return;
                }
                void createTagApi(trimmed)
                  .then((created) => {
                    setTags((cur) =>
                      [...cur, created].sort((a, b) =>
                        a.name.localeCompare(b.name, "pt-BR")
                      )
                    );
                    setTagIds((cur) => [...cur, created.id]);
                  })
                  .catch((err) =>
                    fail(getErrorMessage(err, "Não foi possível criar a tag."))
                  );
              }}
            />
          </Field>
          {editId && isValidContentLinkUrl(url) ? (
            <FormButton
              label="Abrir no navegador"
              onPress={() => void Linking.openURL(normalizeContentLinkUrl(url))}
            />
          ) : null}
          <FormButton
            label={editId ? "Salvar alterações" : "Adicionar"}
            tone="primary"
            disabled={saving}
            busy={saving}
            onPress={() => void onSave()}
          />
          {editId ? (
            <FormButton
              label="Excluir link"
              tone="danger"
              disabled={saving}
              onPress={onDelete}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
        {required ? " *" : ""}
      </ThemedText>
      {children}
    </View>
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
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
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
});
