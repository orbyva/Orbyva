import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { deleteBook, fetchAllBooks, updateBook } from "@/api/books/books";
import { ChipBar } from "@/components/ChipBar";
import { ChoiceChip } from "@/components/ChoiceChip";
import { CatalogMediaCard } from "@/components/CatalogMediaCard";
import { FilterSelect } from "@/components/FilterSelect";
import { InsightsStrip } from "@/components/InsightsStrip";
import { ReviewSheet } from "@/components/ReviewSheet";
import { SearchField } from "@/components/SearchField";
import { SurpriseChip } from "@/components/SurpriseChip";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import {
  BOOK_STATUS_LABELS,
  bookStatusUpdate,
  collectBookCategories,
  filterBooksByMeta,
  formatAuthors,
  formatBookmark,
  getBookLibraryStats,
  pickRandomToReadBook,
} from "@/domain/books";
import { CATALOG_SORT_OPTIONS, sortBooks } from "@/domain/entertainment/sort";
import { getTodayIso } from "@/domain/timeline";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Book, BookRatingFloor, BookStatus } from "@/types/books";

const STATUS_CHIPS: { id: BookStatus; label: string }[] = [
  { id: "to_read", label: BOOK_STATUS_LABELS.to_read },
  { id: "reading", label: BOOK_STATUS_LABELS.reading },
  { id: "read", label: BOOK_STATUS_LABELS.read },
  { id: "abandoned", label: BOOK_STATUS_LABELS.abandoned },
];
const RATING_CHIPS: { id: BookRatingFloor; label: string }[] = [
  { id: "all", label: "Qualquer nota" },
  { id: "6", label: "6+" },
  { id: "7", label: "7+" },
  { id: "8", label: "8+" },
  { id: "9", label: "9+" },
];

export default function BooksScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { fail } = useFeedback();
  const { bottomInset } = useAppShell();
  const [books, setBooks] = useState<Book[]>([]);
  const [status, setStatus] = useState<BookStatus>("to_read");
  const [category, setCategory] = useState("all");
  const [ratingFloor, setRatingFloor] = useState<BookRatingFloor>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<(typeof CATALOG_SORT_OPTIONS)[number]["id"]>(
    "default"
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewBook, setReviewBook] = useState<Book | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    setBooks(await fetchAllBooks());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar os livros."));
          }
        })
        .finally(() => {
          if (!cancelled) {
            hasLoaded.current = true;
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setRefreshing(false);
    }
  }

  const stats = useMemo(() => getBookLibraryStats(books), [books]);
  const statusBooks = useMemo(
    () => books.filter((book) => book.status === status),
    [books, status]
  );
  const categories = useMemo(
    () => collectBookCategories(statusBooks),
    [statusBooks]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = filterBooksByMeta(statusBooks, {
      category,
      minRating: status === "read" ? ratingFloor : "all",
    });
    if (favoritesOnly) list = list.filter((book) => book.is_favorite === true);
    if (q) {
      list = list.filter(
        (book) =>
          book.title.toLowerCase().includes(q) ||
          book.authors.some((author) => author.toLowerCase().includes(q))
      );
    }
    return sortBooks(list, sort, status);
  }, [category, favoritesOnly, ratingFloor, search, sort, status, statusBooks]);

  async function markRead(
    book: Book,
    extras: { rating: number | null; recommend: boolean }
  ) {
    setBusyId(book.google_id);
    try {
      await updateBook({
        ...bookStatusUpdate(book, "read", getTodayIso()),
        rating: extras.rating,
        would_recommend: extras.recommend,
      });
      setBooks((cur) =>
        cur.map((row) =>
          row.google_id === book.google_id
            ? {
                ...row,
                status: "read",
                rating: extras.rating,
                would_recommend: extras.recommend,
              }
            : row
        )
      );
      setReviewBook(null);
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar o status."));
    } finally {
      setBusyId(null);
    }
  }

  function openBook(id: string) {
    router.push({ pathname: "/books/[id]", params: { id } });
  }

  function confirmDelete(book: Book) {
    Alert.alert("Excluir livro", book.title, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void deleteBook(book.google_id)
            .then(() =>
              setBooks((cur) =>
                cur.filter((row) => row.google_id !== book.google_id)
              )
            )
            .catch((err) =>
              fail(getErrorMessage(err, "Não foi possível excluir."))
            );
        },
      },
    ]);
  }

  function surprise() {
    const pick = pickRandomToReadBook(books);
    if (!pick) {
      fail("Nada na fila para ler.");
      return;
    }
    openBook(pick.google_id);
  }

  const pagesLabel =
    stats.pagesRead >= 1000
      ? `${(stats.pagesRead / 1000).toFixed(stats.pagesRead % 1000 === 0 ? 0 : 1).replace(".", ",")} mil`
      : stats.pagesRead;

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
      {loading && books.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
            />
          }
        >
          <InsightsStrip
            items={[
              { label: "lidos", value: stats.read },
              { label: "páginas", value: pagesLabel },
              { label: "este ano", value: stats.thisYear },
              { label: "na lista", value: stats.toRead },
            ]}
          />
          <ChipBar options={STATUS_CHIPS} value={status} onChange={setStatus} />
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar título ou autor"
          />
          <View style={styles.filters}>
            {categories.length > 0 ? (
              <FilterSelect
                label="Categoria"
                value={category}
                options={[
                  { id: "all", label: "Todas as categorias" },
                  ...categories.map((id) => ({ id, label: id })),
                ]}
                onChange={setCategory}
              />
            ) : null}
            {status === "read" ? (
              <FilterSelect
                label="Nota"
                value={ratingFloor}
                options={RATING_CHIPS}
                onChange={(id) => setRatingFloor(id as BookRatingFloor)}
              />
            ) : null}
            <FilterSelect
              label="Ordenar"
              value={sort}
              options={CATALOG_SORT_OPTIONS}
              onChange={(id) =>
                setSort(id as (typeof CATALOG_SORT_OPTIONS)[number]["id"])
              }
            />
            <ChoiceChip
              label={favoritesOnly ? "♥ Favoritos" : "Favoritos"}
              active={favoritesOnly}
              onPress={() => setFavoritesOnly((cur) => !cur)}
            />
            <SurpriseChip onPress={surprise} />
          </View>
          {visible.length === 0 ? (
            <ThemedText themeColor="mutedForeground">
              Nenhum livro neste filtro.
            </ThemedText>
          ) : (
            visible.map((book) => (
              <CatalogMediaCard
                key={book.google_id}
                coverUri={book.cover_url}
                fallback={book.title}
                title={book.title}
                favorite={book.is_favorite === true}
                rating={book.rating != null ? String(book.rating) : null}
                meta={[
                  formatAuthors(book.authors),
                  book.published_year,
                  formatBookmark(book),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                actionLabel={
                  book.status !== "read" && book.status !== "abandoned"
                    ? "Marcar como Lido"
                    : null
                }
                onAction={
                  busyId === book.google_id
                    ? undefined
                    : () => setReviewBook(book)
                }
                onDelete={() => confirmDelete(book)}
                onPress={() => openBook(book.google_id)}
              />
            ))
          )}
        </ScrollView>
      )}
      <ReviewSheet
        visible={reviewBook != null}
        title="Avaliar livro"
        itemTitle={reviewBook?.title ?? ""}
        itemSubtitle={
          reviewBook
            ? [formatAuthors(reviewBook.authors), reviewBook.published_year]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        coverUri={reviewBook?.cover_url}
        confirmLabel="Marcar como Lido"
        busy={reviewBook != null && busyId === reviewBook.google_id}
        onClose={() => setReviewBook(null)}
        onConfirm={(result) => {
          if (!reviewBook) return;
          return markRead(reviewBook, result);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
  list: { padding: Spacing.four, gap: Spacing.three },
  filters: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
});
