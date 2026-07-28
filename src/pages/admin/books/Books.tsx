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

import { deleteBook, fetchBooks } from "@/api/books";
import type { Book, BookRatingFloor, BookStatus } from "@/types/books";
import { BookCard } from "./components/BookCard";
import { BookSearchModal } from "./components/BookSearchModal";
import { BookEditModal } from "./components/BookEditModal";
import { BookDetailDialog } from "./components/BookDetailDialog";
import { BookShareDialog } from "./components/BookShareDialog";
import Pagination from "../finance/components/Pagination";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { getErrorMessage } from "@/lib/errors";
import {
  collectBookAuthors,
  collectBookCategories,
  filterBooksByMeta,
  formatBookRating,
  getReadBooksStats,
} from "@/domain/books";

export default function Books() {
  const [books, setBooks] = useState<Book[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<BookStatus>("to_read");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [ratingFloor, setRatingFloor] = useState<BookRatingFloor>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(36);
  const [totalPages, setTotalPages] = useState(0);

  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  const { toast } = useToast();

  const loadBooks = useCallback(async () => {
    const { data, total } = await fetchBooks(filter, page, pageSize);
    setBooks(data);
    setTotalPages(Math.ceil(total / pageSize));
    setSelectedBook((current) => {
      if (!current) return current;
      return data.find((b) => b.google_id === current.google_id) ?? current;
    });
  }, [filter, page, pageSize]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  async function handleDeleteBook(googleId: string) {
    try {
      await deleteBook(googleId);

      toast({
        title: "Sucesso",
        description: "Livro excluído!",
        duration: 2000,
      });

      await loadBooks();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao excluir."),
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  const categories = useMemo(() => collectBookCategories(books), [books]);
  const authors = useMemo(() => collectBookAuthors(books), [books]);
  const readStats = useMemo(() => getReadBooksStats(books), [books]);

  const filteredBooks = useMemo(() => {
    const byMeta = filterBooksByMeta(books, {
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
  }, [books, searchTerm, categoryFilter, authorFilter, ratingFloor, filter]);

  function openDetail(book: Book) {
    setSelectedBook(book);
    setIsDetailOpen(true);
  }

  const description =
    filter === "read" && readStats.avgRating != null
      ? `Lista de leitura e opiniões · média ${formatBookRating(readStats.avgRating)}/10 em ${readStats.rated} livro${readStats.rated === 1 ? "" : "s"}`
      : "Lista de leitura, opiniões e histórico.";

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
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar título, autor, categoria..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 sm:w-auto">
              <TabsTrigger value="to_read">Para ler</TabsTrigger>
              <TabsTrigger value="reading">Lendo</TabsTrigger>
              <TabsTrigger value="read">Lidos</TabsTrigger>
              <TabsTrigger value="abandoned">Abandonei</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Select value={authorFilter} onValueChange={setAuthorFilter}>
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

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
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
              onValueChange={(v) => setRatingFloor(v as BookRatingFloor)}
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
        {filteredBooks.length ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6">
            {filteredBooks.map((book) => (
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
              searchTerm ||
              categoryFilter !== "all" ||
              authorFilter !== "all" ||
              ratingFloor !== "all"
                ? "Tente outro filtro ou termo de busca."
                : "Busque no Google Books e monte sua lista."
            }
            action={
              searchTerm ||
              categoryFilter !== "all" ||
              authorFilter !== "all" ||
              ratingFloor !== "all" ? (
                undefined
              ) : (
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
            onEdit={() => setIsEditOpen(true)}
            onShare={() => setIsShareOpen(true)}
            onDelete={() => void handleDeleteBook(selectedBook.google_id)}
          />
          <BookEditModal
            book={selectedBook}
            open={isEditOpen}
            onOpenChange={setIsEditOpen}
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
        totalPages={totalPages}
        onSetPage={setPage}
        onSetPageSize={setPageSize}
      />
    </PageShell>
  );
}
