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
  fetchBookCatalogDetails,
  searchBookCatalog,
  type BookSearchHit,
} from "@/api/books/catalog";
import {
  createBook,
  deleteBook,
  fetchBookById,
  updateBook,
} from "@/api/books/books";
import { CatalogSearch } from "@/components/CatalogSearch";
import { ChoiceChip } from "@/components/ChoiceChip";
import { DateField } from "@/components/DateField";
import { RecommendField } from "@/components/RecommendField";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, Field, Input } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { appendActivityDate } from "@/domain/entertainment/insights";
import {
  BOOK_STATUS_LABELS,
  formatAuthors,
  newManualBookId,
} from "@/domain/books";
import { getTodayIso } from "@/domain/timeline";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Book, BookStatus } from "@/types/books";

const STATUS_CHIPS = (Object.keys(BOOK_STATUS_LABELS) as BookStatus[]).map(
  (id) => ({ id, label: BOOK_STATUS_LABELS[id] })
);

export default function BookFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [loading, setLoading] = useState(Boolean(editId));
  const [picking, setPicking] = useState(false);
  const [manual, setManual] = useState(Boolean(editId));
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [year, setYear] = useState("");
  const [status, setStatus] = useState<BookStatus>("to_read");
  const [rating, setRating] = useState("");
  const [notes, setNotes] = useState("");
  const [currentPage, setCurrentPage] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [publisher, setPublisher] = useState<string | null>(null);
  const [isbn13, setIsbn13] = useState<string | null>(null);
  const [scoreGoogle, setScoreGoogle] = useState<number | null>(null);
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [readDates, setReadDates] = useState<string[]>([]);
  const [activityDate, setActivityDate] = useState(getTodayIso());
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar livro" : "Novo livro" });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void fetchBookById(editId)
      .then((book) => {
        if (cancelled) return;
        if (!book) {
          setError("Livro não encontrado.");
          return;
        }
        applyBook(book);
      })
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
  }, [editId]);

  function applyBook(book: Book) {
    setTitle(book.title);
    setAuthors(book.authors.join(", "));
    setYear(book.published_year ? String(book.published_year) : "");
    setStatus(book.status);
    setRating(book.rating != null ? String(book.rating) : "");
    setNotes(book.notes ?? "");
    setCurrentPage(book.current_page != null ? String(book.current_page) : "");
    setCover(book.cover_url ?? null);
    setDescription(book.description ?? null);
    setCategories(book.categories ?? []);
    setPageCount(book.page_count ?? null);
    setPublisher(book.publisher ?? null);
    setIsbn13(book.isbn13 ?? null);
    setScoreGoogle(book.score_google ?? null);
    setCatalogId(book.google_id);
    setReadDates((book.read_dates ?? []).map((d) => String(d).slice(0, 10)));
    setActivityDate(
      (book.read_dates ?? []).map((d) => String(d).slice(0, 10)).at(-1) ??
        getTodayIso()
    );
    setWouldRecommend(book.would_recommend !== false);
    setManual(true);
  }

  async function onPickHit(hit: BookSearchHit) {
    setPicking(true);
    setError(null);
    try {
      const details = await fetchBookCatalogDetails(hit.google_id);
      if (details) {
        applyBook(details);
        return;
      }
      setTitle(hit.title);
      setAuthors(formatAuthors(hit.authors) === "Autor desconhecido" ? "" : hit.authors.join(", "));
      setYear(hit.published_year ? String(hit.published_year) : "");
      setCover(hit.cover_url);
      setCatalogId(hit.google_id);
      setManual(true);
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível abrir o livro do catálogo."));
    } finally {
      setPicking(false);
    }
  }


  async function onSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      fail("Informe o título.");
      return;
    }
    const parsedYear = Number.parseInt(year, 10);
    const parsedRating = Number.parseFloat(rating.replace(",", "."));
    const parsedPage = Number.parseInt(currentPage, 10);
    const dates =
      status === "read" ? appendActivityDate(readDates, activityDate) : readDates;
    setSaving(true);
    setError(null);
    const payload = {
      google_id: editId ?? catalogId ?? newManualBookId(),
      title: trimmed,
      authors: authors
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      published_year: Number.isFinite(parsedYear) ? parsedYear : null,
      cover_url: cover,
      categories,
      description,
      page_count: pageCount,
      publisher,
      isbn13,
      status,
      current_page:
        status === "reading" && Number.isFinite(parsedPage) ? parsedPage : null,
      rating: Number.isFinite(parsedRating)
        ? Math.min(10, Math.max(0, parsedRating))
        : null,
      notes: notes.trim() || null,
      would_recommend: wouldRecommend,
      read_dates: dates,
      score_google: scoreGoogle,
    };
    try {
      if (editId) {
        await updateBook(payload);
      } else {
        await createBook(payload);
      }
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar o livro."));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert("Excluir livro", title || "Esse livro", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deleteBook(editId);
              router.back();
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir o livro."));
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
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Banner message={error} />
          {!editId ? (
            <>
              <CatalogSearch
                placeholder="Buscar no catálogo"
                enabled
                unavailableHint=""
                search={searchBookCatalog}
                toView={(hit) => ({
                  key: hit.google_id,
                  title: hit.title,
                  subtitle: [formatAuthors(hit.authors), hit.published_year]
                    .filter(Boolean)
                    .join(" · "),
                  cover: hit.cover_url,
                })}
                onSelect={(hit) => void onPickHit(hit)}
              />
              {!manual ? (
                <Button
                  label="Cadastrar na mão"
                  onPress={() => setManual(true)}
                  variant="outline"
                />
              ) : null}
            </>
          ) : null}
          {picking ? <ActivityIndicator color={theme.primary} /> : null}
          {manual ? (
            <>
              <Field label="Título" required>
                <Input
                  autoFocus={!editId && !catalogId}
                  placeholder="Nome do livro"
                  value={title}
                  onChangeText={setTitle}
                />
              </Field>
              <Field label="Autores">
                <Input
                  placeholder="Separados por vírgula"
                  value={authors}
                  onChangeText={setAuthors}
                />
              </Field>
              <Field label="Ano">
                <Input
                  keyboardType="number-pad"
                  placeholder="2024"
                  value={year}
                  onChangeText={(value) => setYear(value.replace(/\D/g, "").slice(0, 4))}
                />
              </Field>
              <Field label="Status">
                <View style={styles.chips}>
                  {STATUS_CHIPS.map((chip) => (
                    <ChoiceChip
                      key={chip.id}
                      label={chip.label}
                      active={status === chip.id}
                      onPress={() => setStatus(chip.id)}
                    />
                  ))}
                </View>
              </Field>
              {status === "reading" ? (
                <Field label="Página atual">
                  <Input
                    keyboardType="number-pad"
                    placeholder="Opcional"
                    value={currentPage}
                    onChangeText={(value) => setCurrentPage(value.replace(/\D/g, ""))}
                  />
                </Field>
              ) : null}
              <Field label="Nota (0–10)">
                <Input
                  keyboardType="decimal-pad"
                  placeholder="Opcional"
                  value={rating}
                  onChangeText={setRating}
                />
              </Field>
              {status === "read" ? (
                <Field label="Data em que leu">
                  <DateField
                    value={activityDate}
                    onChange={setActivityDate}
                  />
                </Field>
              ) : null}
              {status === "read" || status === "abandoned" ? (
                <RecommendField
                  value={wouldRecommend}
                  onChange={setWouldRecommend}
                />
              ) : null}
              <Field label="Notas">
                <Input
                  placeholder="Opcional"
                  style={styles.multiline}
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                />
              </Field>
              <Button
                label={editId ? "Salvar alterações" : "Adicionar"}
                disabled={saving}
                loading={saving}
                onPress={() => void onSave()}
                size="lg"
              />
          {editId ? (
            <Button
              label="Excluir livro"
              disabled={saving}
              onPress={onDelete}
              variant="destructive"
            />
          ) : null}
            </>
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
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
