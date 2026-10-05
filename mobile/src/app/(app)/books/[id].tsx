import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchBookById, updateBook } from "@/api/books/books";
import {
  createBookNote,
  deleteBookNote,
  fetchBookNotes,
} from "@/api/books/notes";
import { CoverThumb } from "@/components/CoverThumb";
import { ReviewSheet } from "@/components/ReviewSheet";
import { OpinionShareSheet } from "@/components/share/OpinionShareSheet";
import { StoryShareCard } from "@/components/share/StoryShareCard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, Input, ModuleSection } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import {
  BOOK_STATUS_LABELS,
  bookStatusUpdate,
  formatAuthors,
  formatBookRating,
  formatBookmark,
  getBookRatingLabel,
  getLatestReadDate,
} from "@/domain/books";
import { buildBookShareText, usableCoverUri } from "@/domain/share";
import { getTodayIso } from "@/domain/timeline";
import { useAppShell } from "@/hooks/use-app-shell";
import { useModuleColors, useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { Book, BookNote, BookStatus } from "@/types/books";

export default function BookDetailScreen() {
  const theme = useTheme();
  const moduleColors = useModuleColors();
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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


  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 24 }]}
      >
        <Banner message={error} />
        <View style={styles.hero}>
          <CoverThumb uri={book.cover_url} fallback={book.title} variant="hero" />
          <View style={styles.heroCopy}>
            <View style={styles.titleRow}>
              <ThemedText type="smallBold" style={styles.title}>
                {book.title}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  book.is_favorite ? "Remover dos favoritos" : "Favoritar"
                }
                disabled={busy}
                hitSlop={8}
                onPress={() => void patch({ is_favorite: !book.is_favorite })}
              >
                <Ionicons
                  name={book.is_favorite ? "heart" : "heart-outline"}
                  size={22}
                  color={book.is_favorite ? theme.destructive : theme.mutedForeground}
                />
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="mutedForeground">
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
        {book.status === "reading" ? (
          <View style={styles.footerActions}>
            <Button
              label="Terminei"
              disabled={busy}
              onPress={() => setReviewOpen(true)}
              size="lg"
            />
            <Button
              label="Abandonei"
              disabled={busy}
              onPress={() => void setStatus("abandoned")}
              variant="destructive"
            />
          </View>
        ) : null}
        {book.description ? (
          <ThemedText type="small" themeColor="mutedForeground">
            {book.description}
          </ThemedText>
        ) : null}
        {book.notes ? <ThemedText type="small">{book.notes}</ThemedText> : null}
        {book.status === "read" ? (
          <ThemedText type="small" themeColor="mutedForeground">
            {book.would_recommend === false ? "Não recomendaria" : "Recomendaria"}
          </ThemedText>
        ) : null}

        <ModuleSection title="Notas de leitura" icon="create-outline" tint={moduleColors.entertainment}>
          <Input
            placeholder="Página (opcional)"
            keyboardType="number-pad"
            value={notePage}
            onChangeText={(value) => setNotePage(value.replace(/\D/g, ""))}
          />
          <Input
            placeholder="Comentário"
            style={styles.multiline}
            multiline
            value={noteBody}
            onChangeText={setNoteBody}
          />
          <Button
            label="Adicionar nota"
            disabled={busy}
            onPress={() => void addNote()}
            variant="outline"
          />
          {notes.length === 0 ? (
            <ThemedText type="small" themeColor="mutedForeground">
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

        <View style={styles.footerActions}>
          {book.status === "to_read" ? (
            <Button
              label="Começar"
              disabled={busy}
              onPress={() => void setStatus("reading")}
              size="lg"
            />
          ) : null}
          {book.status === "abandoned" ? (
            <Button
              label="Retomar"
              disabled={busy}
              onPress={() => void setStatus("reading")}
              size="lg"
            />
          ) : null}
          <Button
            label="Editar"
            onPress={() =>
              router.push({ pathname: "/books/form", params: { id: book.google_id } })
            }
            variant={book.status === "read" ? "default" : "outline"}
          />
          {book.status === "read" ? (
            <Button
              label="Compartilhar"
              onPress={() => setShareOpen(true)}
              variant="outline"
            />
          ) : null}
        </View>
      </ScrollView>
      <ReviewSheet
        visible={reviewOpen}
        title="Avaliar livro"
        itemTitle={book.title}
        itemSubtitle={[formatAuthors(book.authors), book.published_year]
          .filter(Boolean)
          .join(" · ")}
        coverUri={book.cover_url}
        confirmLabel="Marcar como Lido"
        busy={busy}
        onClose={() => setReviewOpen(false)}
        onConfirm={async (result) => {
          await patch({
            ...bookStatusUpdate(book, "read", getTodayIso()),
            rating: result.rating,
            would_recommend: result.recommend,
          });
          setReviewOpen(false);
        }}
      />
      {book.status === "read" ? (
        <OpinionShareSheet
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          title={book.title}
          hasNotes={Boolean(book.notes?.trim())}
          message={(includeNotes) => buildBookShareText(book, { includeNotes })}
          renderCard={({ includeNotes }) => {
            const latest = getLatestReadDate(book.read_dates);
            return (
              <StoryShareCard
                coverUri={usableCoverUri(book.cover_url)}
                coverVariant="book"
                fallbackEmoji="📖"
                fallbackCaption="LIVRO"
                kicker={latest ? `LIDO  ·  ${formatDateBR(latest)}` : "LIDO"}
                title={book.title}
                subtitle={formatAuthors(book.authors)}
                score={
                  book.rating != null && book.rating > 0
                    ? `${formatBookRating(book.rating)}/10`
                    : null
                }
                scoreLabel={
                  book.rating != null && book.rating > 0
                    ? getBookRatingLabel(book.rating)
                    : null
                }
                recommend={book.would_recommend !== false}
                notes={includeNotes ? book.notes?.trim() : null}
              />
            );
          }}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three },
  hero: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  heroCopy: { flex: 1, gap: 6, paddingTop: 4 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  title: { flex: 1 },
  footerActions: { gap: 8 },
  multiline: { minHeight: 80, paddingTop: 10, textAlignVertical: "top" },
});
