import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
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
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
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

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

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
      status === "read" ? appendActivityDate(readDates, getTodayIso()) : readDates;
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
      would_recommend: true,
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
                <Pressable onPress={() => setManual(true)}>
                  <ThemedText type="small" style={{ color: theme.primary }}>
                    Cadastrar na mão
                  </ThemedText>
                </Pressable>
              ) : null}
            </>
          ) : null}
          {picking ? <ActivityIndicator color={theme.primary} /> : null}
          {manual ? (
            <>
              <Field label="Título" required>
                <TextInput
                  autoFocus={!editId && !catalogId}
                  placeholder="Nome do livro"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={title}
                  onChangeText={setTitle}
                />
              </Field>
              <Field label="Autores">
                <TextInput
                  placeholder="Separados por vírgula"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={authors}
                  onChangeText={setAuthors}
                />
              </Field>
              <Field label="Ano">
                <TextInput
                  keyboardType="number-pad"
                  placeholder="2024"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={year}
                  onChangeText={(value) => setYear(value.replace(/\D/g, "").slice(0, 4))}
                />
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
              {status === "reading" ? (
                <Field label="Página atual">
                  <TextInput
                    keyboardType="number-pad"
                    placeholder="Opcional"
                    placeholderTextColor={theme.textSecondary}
                    style={inputStyle}
                    value={currentPage}
                    onChangeText={(value) => setCurrentPage(value.replace(/\D/g, ""))}
                  />
                </Field>
              ) : null}
              <Field label="Nota (0–10)">
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Opcional"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={rating}
                  onChangeText={setRating}
                />
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
              {editId ? (
                <Pressable disabled={saving} onPress={onDelete}>
                  <ThemedText themeColor="danger">Excluir livro</ThemedText>
                </Pressable>
              ) : null}
            </>
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
