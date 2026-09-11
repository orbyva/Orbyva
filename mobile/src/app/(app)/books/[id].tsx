import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
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

import { fetchBookById, updateBook } from "@/api/books/books";
import {
  createBookNote,
  deleteBookNote,
  fetchBookNotes,
} from "@/api/books/notes";
import { CoverThumb } from "@/components/CoverThumb";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { ModuleSection } from "@/components/ui/ModuleSection";
import { Spacing } from "@/constants/theme";
import {
  BOOK_STATUS_LABELS,
  bookStatusUpdate,
  formatAuthors,
  formatBookmark,
} from "@/domain/books";
import { getTodayIso } from "@/domain/timeline";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Book, BookNote, BookStatus } from "@/types/books";

export default function BookDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const { bottomInset } = useAppShell();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const [book, setBook] = useState<Book | null>(null);
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [notePage, setNotePage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const row = await fetchBookById(id);
    setBook(row);
    navigation.setOptions({ title: row?.title ?? "Livro" });
    if (!row) {
      setError("Livro não encontrado.");
      return;
    }
    setNotes(await fetchBookNotes(row.google_id).catch(() => []));
  }, [id, navigation]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível abrir o livro."));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  async function patch(next: Partial<Book>) {
    if (!book) return;
    setBusy(true);
    try {
      await updateBook({ google_id: book.google_id, ...next });
      setBook({ ...book, ...next });
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: BookStatus) {
    if (!book) return;
    await patch(bookStatusUpdate(book, status, getTodayIso()));
  }

  async function addNote() {
    if (!book || !noteBody.trim()) return;
    const page = Number.parseInt(notePage, 10);
    setBusy(true);
    try {
      const created = await createBookNote({
        google_id: book.google_id,
        body: noteBody.trim(),
        page: Number.isFinite(page) ? page : null,
      });
      setNotes((cur) => [created, ...cur]);
      setNoteBody("");
      setNotePage("");
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar a nota."));
    } finally {
      setBusy(false);
    }
  }

  function removeNote(note: BookNote) {
    Alert.alert("Excluir nota", "Essa ação não tem volta.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteBookNote(note.id);
              setNotes((cur) => cur.filter((row) => row.id !== note.id));
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir a nota."));
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

  if (!book) {
    return (
      <ThemedView style={styles.body}>
        <Banner message={error} />
      </ThemedView>
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

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 24 }]}
      >
        <Banner message={error} />
        <View style={styles.hero}>
          <CoverThumb uri={book.cover_url} fallback={book.title} variant="hero" />
          <View style={styles.heroCopy}>
            <ThemedText type="smallBold">{book.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[
                formatAuthors(book.authors),
                book.published_year,
                BOOK_STATUS_LABELS[book.status],
                formatBookmark(book),
              ]
                .filter(Boolean)
                .join(" · ")}
            </ThemedText>
          </View>
        </View>
        <View style={styles.actions}>
          {book.status === "to_read" ? (
            <Pressable disabled={busy} onPress={() => void setStatus("reading")}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Começar a ler
              </ThemedText>
            </Pressable>
          ) : null}
          {book.status !== "read" ? (
            <Pressable disabled={busy} onPress={() => void setStatus("read")}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Marcar lido
              </ThemedText>
            </Pressable>
          ) : null}
          {book.status !== "abandoned" ? (
            <Pressable disabled={busy} onPress={() => void setStatus("abandoned")}>
              <ThemedText type="small" themeColor="textSecondary">
                Abandonar
              </ThemedText>
            </Pressable>
          ) : (
            <Pressable disabled={busy} onPress={() => void setStatus("reading")}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Retomar
              </ThemedText>
            </Pressable>
          )}
        </View>
        <View style={styles.actions}>
          <Pressable
            disabled={busy}
            onPress={() => void patch({ is_favorite: !book.is_favorite })}
          >
            <ThemedText type="smallBold">
              {book.is_favorite ? "♥ Favorito" : "Marcar favorito"}
            </ThemedText>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => void patch({ would_recommend: book.would_recommend === false })}
          >
            <ThemedText type="small" themeColor="textSecondary">
              {book.would_recommend === false ? "Não recomendaria" : "Recomendaria"}
            </ThemedText>
          </Pressable>
        </View>
        {book.description ? (
          <ThemedText type="small" themeColor="textSecondary">
            {book.description}
          </ThemedText>
        ) : null}
        {book.notes ? <ThemedText type="small">{book.notes}</ThemedText> : null}

        <ModuleSection title="Notas de leitura" icon="create-outline" tint="#F59E0B">
          <TextInput
            placeholder="Página (opcional)"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            style={inputStyle}
            value={notePage}
            onChangeText={(value) => setNotePage(value.replace(/\D/g, ""))}
          />
          <TextInput
            placeholder="Comentário"
            placeholderTextColor={theme.textSecondary}
            style={[inputStyle, styles.multiline]}
            multiline
            value={noteBody}
            onChangeText={setNoteBody}
          />
          <Pressable disabled={busy} onPress={() => void addNote()}>
            <ThemedText type="small" style={{ color: theme.primary }}>
              Adicionar nota
            </ThemedText>
          </Pressable>
          {notes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Nenhuma nota ainda.
            </ThemedText>
          ) : (
            notes.map((note) => (
              <Pressable key={note.id} onLongPress={() => removeNote(note)}>
                <ThemedText type="small">
                  {note.page != null ? `Pág. ${note.page} · ` : ""}
                  {note.body}
                </ThemedText>
              </Pressable>
            ))
          )}
        </ModuleSection>

        <Pressable
          onPress={() =>
            router.push({ pathname: "/books/form", params: { id: book.google_id } })
          }
        >
          <ThemedText type="small" style={{ color: theme.primary }}>
            Editar
          </ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three },
  hero: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  heroCopy: { flex: 1, gap: 6, paddingTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  multiline: { minHeight: 80, paddingTop: 10, textAlignVertical: "top" },
});
