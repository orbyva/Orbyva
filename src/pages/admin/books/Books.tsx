import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { deleteBook, fetchAllBooks } from "@/api/books";
import type { Book, BookRatingFloor, BookStatus } from "@/types/books";
import { BookCard } from "./components/BookCard";
import { BookSearchModal } from "./components/BookSearchModal";
import { BookEditModal, type BookEditIntent } from "./components/BookEditModal";
import { BookDetailDialog } from "./components/BookDetailDialog";
import { BookShareDialog } from "./components/BookShareDialog";
import Pagination from "../finance/components/Pagination";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { EntertainmentInsightsStrip } from "@/components/EntertainmentInsightsStrip";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { getErrorMessage } from "@/lib/errors";
import { createMemoryCache } from "@/lib/memoryCache";
import { useCachedCatalog } from "@/hooks/useCachedCatalog";
import {
  collectBookAuthors,
  collectBookCategories,
  filterBooksByMeta,
  formatBookRating,
  getBookLibraryStats,
  getLatestReadDate,
  pickRandomToReadBook,
} from "@/domain/books";

const booksCatalogCache = createMemoryCache<Book[]>();

function sortBooksForStatus(list: Book[], status: BookStatus): Book[] {
  const copy = [...list];
  if (status === "read") {
    copy.sort((a, b) => {
      const da = getLatestReadDate(a.read_dates) ?? "";
      const db = getLatestReadDate(b.read_dates) ?? "";
      return db.localeCompare(da);
    });
  } else if (status === "reading") {
    copy.sort((a, b) => (b.current_page ?? 0) - (a.current_page ?? 0));
  } else {
    copy.sort((a, b) => (b.published_year ?? 0) - (a.published_year ?? 0));
  }
  return copy;
}

export default function Books() {
  const fetchAll = useCallback(() => fetchAllBooks(), []);
  const { items: allBooks, reload, replace } = useCachedCatalog(
    booksCatalogCache,
    fetchAll
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<BookStatus>("to_read");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [ratingFloor, setRatingFloor] = useState<BookRatingFloor>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(36);

  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editIntent, setEditIntent] = useState<BookEditIntent | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);

  const { toast } = useToast();

  const loadBooks = useCallback(() => reload(true), [reload]);

  const statusBooks = useMemo(
    () =>
      sortBooksForStatus(
        allBooks.filter((b) => b.status === filter),
        filter
      ),
    [allBooks, filter]
  );

  const categories = useMemo(
    () => collectBookCategories(statusBooks),
    [statusBooks]
  );
  const authors = useMemo(() => collectBookAuthors(statusBooks), [statusBooks]);
  const libraryStats = useMemo(
    () => getBookLibraryStats(allBooks),
    [allBooks]
  );

  const insightStats = useMemo(() => {
    const pages =
      libraryStats.pagesRead >= 1000
        ? `${(libraryStats.pagesRead / 1000).toFixed(libraryStats.pagesRead % 1000 === 0 ? 0 : 1).replace(".", ",")} mil`
        : libraryStats.pagesRead;
    return [
      { label: "lidos", value: libraryStats.read },
      { label: "páginas", value: pages },
      { label: "este ano", value: libraryStats.thisYear },
      { label: "na lista", value: libraryStats.toRead },
    ];
  }, [libraryStats]);

  const filteredBooks = useMemo(() => {
    const byMeta = filterBooksByMeta(statusBooks, {
      category: categoryFilter,
      author: authorFilter,
      minRating: filter === "read" ? ratingFloor : "all",
    });
    const q = searchTerm.trim().toLowerCase();
    if (!q) return byMeta;
    return byMeta.filter((book) => {
      const haystack = [
        book.title,
        book.notes,
        book.publisher,
        ...(book.authors ?? []),
        ...(book.categories ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    statusBooks,
    searchTerm,
    categoryFilter,
    authorFilter,
    ratingFloor,
    filter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / pageSize));
  const pageBooks = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredBooks.slice(start, start + pageSize);
  }, [filteredBooks, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setSelectedBook((current) => {
      if (!current) return current;
      return (
        allBooks.find((b) => b.google_id === current.google_id) ?? current
      );
    });
  }, [allBooks]);

  async function handleDeleteBook(googleId: string) {
    try {
      await deleteBook(googleId);
      replace((prev) => prev.filter((b) => b.google_id !== googleId));
      toast({
        title: "Sucesso",
        description: "Livro excluído!",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao excluir."),
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  function openDetail(book: Book) {
    setSelectedBook(book);
    setIsDetailOpen(true);
  }

  function handleSurprise() {
    const pick = pickRandomToReadBook(allBooks);
    if (!pick) {
      toast({
        title: "Lista vazia",
        description: "Adicione livros em Para ler para surpreender.",
        duration: 2500,
      });
      return;
    }
    openDetail(pick);
  }

  const description =
    libraryStats.avgRating != null
      ? `Lista de leitura e opiniões · média ${formatBookRating(libraryStats.avgRating)}/10 em ${libraryStats.rated} livro${libraryStats.rated === 1 ? "" : "s"}`
      : "Lista de leitura, opiniões e histórico.";

  const hasClientFilters =
    searchTerm ||
    categoryFilter !== "all" ||
    authorFilter !== "all" ||
    ratingFloor !== "all";

  return (
    <PageShell
      title="Livros"
      description={description}
      actions={
        <>
          <ModuleGuideButton moduleId="books" />
          <BookSearchModal onBookAdded={loadBooks} />
        </>
      }
    >
      <ModuleGuide moduleId="books" />
      <EntertainmentInsightsStrip
        stats={insightStats}
        onSurprise={handleSurprise}
      />
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar título, autor, categoria..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <Tabs
            value={filter}
            onValueChange={(val) => {
              setFilter(val as BookStatus);
              setPage(1);
              setCategoryFilter("all");
              setAuthorFilter("all");
              setRatingFloor("all");
            }}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 sm:w-auto">
              <TabsTrigger value="to_read">Para ler</TabsTrigger>
              <TabsTrigger value="reading">Lendo</TabsTrigger>
              <TabsTrigger value="read">Lidos</TabsTrigger>
              <TabsTrigger value="abandoned">Abandonei</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={authorFilter}
            onValueChange={(v) => {
              setAuthorFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Autor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os autores</SelectItem>
              {authors.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={categoryFilter}
            onValueChange={(v) => {
              setCategoryFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filter === "read" ? (
            <Select
              value={ratingFloor}
              onValueChange={(v) => {
                setRatingFloor(v as BookRatingFloor);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Nota mínima" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer nota</SelectItem>
                <SelectItem value="6">6+ Bom</SelectItem>
                <SelectItem value="7">7+ Muito bom</SelectItem>
                <SelectItem value="8">8+ Excelente</SelectItem>
                <SelectItem value="9">9+ Obra-prima</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border p-3 sm:p-4">
        {pageBooks.length ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6">
            {pageBooks.map((book) => (
              <BookCard
                key={book.google_id}
                book={book}
                onClick={() => openDetail(book)}
                onDelete={handleDeleteBook}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhum livro encontrado"
            description={
              hasClientFilters
                ? "Tente outro filtro ou termo de busca."
                : "Busque no Google Books e monte sua lista."
            }
            action={
              hasClientFilters ? undefined : (
                <BookSearchModal onBookAdded={loadBooks} />
              )
            }
          />
        )}
      </section>

      {selectedBook && (
        <>
          <BookDetailDialog
            book={selectedBook}
            open={isDetailOpen}
            onOpenChange={setIsDetailOpen}
            onEdit={(intent) => {
              setEditIntent(intent ?? null);
              setIsEditOpen(true);
            }}
            onShare={() => setIsShareOpen(true)}
            onDelete={() => void handleDeleteBook(selectedBook.google_id)}
            onBookPatch={(patch) => {
              const id = selectedBook.google_id;
              setSelectedBook((prev) =>
                prev ? { ...prev, ...patch } : prev
              );
              replace((prev) => {
                const idx = prev.findIndex((b) => b.google_id === id);
                if (idx >= 0) {
                  return prev.map((b) =>
                    b.google_id === id ? { ...b, ...patch } : b
                  );
                }
                return [{ ...selectedBook, ...patch }, ...prev];
              });
            }}
          />
          <BookEditModal
            book={selectedBook}
            open={isEditOpen}
            onOpenChange={(open) => {
              setIsEditOpen(open);
              if (!open) setEditIntent(null);
            }}
            initialIntent={editIntent}
            onBookUpdated={async () => {
              await loadBooks();
            }}
          />
          <BookShareDialog
            book={selectedBook}
            open={isShareOpen}
            onOpenChange={setIsShareOpen}
          />
        </>
      )}

      <Pagination
        pageSizes={[6, 12, 36, 60]}
        page={page}
        pageSize={pageSize}
        totalPages={filteredBooks.length === 0 ? 0 : totalPages}
        onSetPage={setPage}
        onSetPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </PageShell>
  );
}
