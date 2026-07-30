import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Heart, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { deleteAlbum, fetchAllAlbums, updateAlbum } from "@/api/albums";
import type { Album, AlbumRatingFloor, AlbumStatus } from "@/types/music";
import { AlbumCard } from "./components/AlbumCard";
import { AlbumSearchModal } from "./components/AlbumSearchModal";
import { AlbumEditModal } from "./components/AlbumEditModal";
import { AlbumDetailDialog } from "./components/AlbumDetailDialog";
import { AlbumShareDialog } from "./components/AlbumShareDialog";
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
  ALBUM_TYPE_LABELS,
  collectAlbumArtists,
  collectAlbumTypes,
  filterAlbumsByMeta,
  formatAlbumRating,
  getAlbumLibraryStats,
  pickRandomToListenAlbum,
} from "@/domain/music";
import {
  CATALOG_SORT_OPTIONS,
  sortAlbums,
  type CatalogSort,
} from "@/domain/entertainment/sort";
import { cn } from "@/lib/utils";

const albumsCatalogCache = createMemoryCache<Album[]>();

export default function Music() {
  const fetchAll = useCallback(() => fetchAllAlbums(), []);
  const { items: allAlbums, reload, replace } = useCachedCatalog(
    albumsCatalogCache,
    fetchAll
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<AlbumStatus>("to_listen");
  const [artistFilter, setArtistFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [ratingFloor, setRatingFloor] = useState<AlbumRatingFloor>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<CatalogSort>("default");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(36);

  const [selected, setSelected] = useState<Album | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  const { toast } = useToast();

  const loadAlbums = useCallback(() => reload(true), [reload]);

  const statusAlbums = useMemo(
    () => allAlbums.filter((a) => a.status === filter),
    [allAlbums, filter]
  );

  const artists = useMemo(
    () => collectAlbumArtists(statusAlbums),
    [statusAlbums]
  );
  const types = useMemo(() => collectAlbumTypes(statusAlbums), [statusAlbums]);
  const libraryStats = useMemo(
    () => getAlbumLibraryStats(allAlbums),
    [allAlbums]
  );

  const insightStats = useMemo(
    () => [
      { label: "ouvidos", value: libraryStats.listened },
      { label: "este ano", value: libraryStats.thisYear },
      { label: "na fila", value: libraryStats.toListen },
      { label: "favoritos", value: libraryStats.favorites },
    ],
    [libraryStats]
  );

  const filtered = useMemo(() => {
    const byMeta = filterAlbumsByMeta(statusAlbums, {
      artist: artistFilter,
      albumType: typeFilter,
      minRating: filter === "listened" ? ratingFloor : "all",
    });
    const q = searchTerm.trim().toLowerCase();
    const searched = !q
      ? byMeta
      : byMeta.filter((album) => {
          const haystack = [album.title, album.notes, ...(album.artists ?? [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });
    const byFavorite = favoritesOnly
      ? searched.filter((a) => a.is_favorite === true)
      : searched;
    return sortAlbums(byFavorite, sort, filter);
  }, [
    statusAlbums,
    searchTerm,
    artistFilter,
    typeFilter,
    ratingFloor,
    favoritesOnly,
    filter,
    sort,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageAlbums = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setSelected((current) => {
      if (!current) return current;
      return (
        allAlbums.find((a) => a.musicbrainz_id === current.musicbrainz_id) ??
        current
      );
    });
  }, [allAlbums]);

  async function handleDelete(id: string) {
    try {
      await deleteAlbum(id);
      replace((prev) => prev.filter((a) => a.musicbrainz_id !== id));
      toast({
        title: "Sucesso",
        description: "Álbum excluído!",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao excluir."),
        variant: "destructive",
      });
    }
  }

  async function handleToggleFavorite(id: string, next: boolean) {
    const previous = allAlbums.find((a) => a.musicbrainz_id === id)?.is_favorite;
    replace((prev) =>
      prev.map((a) =>
        a.musicbrainz_id === id ? { ...a, is_favorite: next } : a
      )
    );
    setSelected((cur) =>
      cur?.musicbrainz_id === id ? { ...cur, is_favorite: next } : cur
    );
    try {
      await updateAlbum({ musicbrainz_id: id, is_favorite: next });
    } catch (error) {
      replace((prev) =>
        prev.map((a) =>
          a.musicbrainz_id === id
            ? { ...a, is_favorite: previous === true }
            : a
        )
      );
      setSelected((cur) =>
        cur?.musicbrainz_id === id
          ? { ...cur, is_favorite: previous === true }
          : cur
      );
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao atualizar favorito."),
        variant: "destructive",
      });
    }
  }

  function openDetail(album: Album) {
    setSelected(album);
    setIsDetailOpen(true);
  }

  function handleSurprise() {
    const pick = pickRandomToListenAlbum(allAlbums);
    if (!pick) {
      toast({
        title: "Fila vazia",
        description: "Adicione álbuns em Para ouvir para surpreender.",
        duration: 2500,
      });
      return;
    }
    openDetail(pick);
  }

  const description =
    libraryStats.avgRating != null
      ? `Álbuns e opiniões · média ${formatAlbumRating(libraryStats.avgRating)}/10 em ${libraryStats.rated} álbum${libraryStats.rated === 1 ? "" : "s"}`
      : "Álbuns, EPs e o que você ouviu.";

  const hasFilters =
    searchTerm ||
    artistFilter !== "all" ||
    typeFilter !== "all" ||
    ratingFloor !== "all" ||
    favoritesOnly;

  return (
    <PageShell
      title="Música"
      description={description}
      actions={
        <>
          <ModuleGuideButton moduleId="music" />
          <AlbumSearchModal onAlbumAdded={loadAlbums} />
        </>
      }
    >
      <ModuleGuide moduleId="music" />
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
              placeholder="Buscar álbum, artista..."
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
              setFilter(val as AlbumStatus);
              setPage(1);
              setArtistFilter("all");
              setTypeFilter("all");
              setRatingFloor("all");
            }}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid w-full grid-cols-2 sm:w-auto">
              <TabsTrigger value="to_listen">Para ouvir</TabsTrigger>
              <TabsTrigger value="listened">Ouvidos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={artistFilter}
            onValueChange={(v) => {
              setArtistFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Artista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os artistas</SelectItem>
              {artists.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {ALBUM_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filter === "listened" ? (
            <Select
              value={ratingFloor}
              onValueChange={(v) => {
                setRatingFloor(v as AlbumRatingFloor);
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

          <Button
            type="button"
            variant={favoritesOnly ? "default" : "outline"}
            className="w-full sm:w-auto"
            onClick={() => {
              setFavoritesOnly((v) => !v);
              setPage(1);
            }}
            aria-pressed={favoritesOnly}
          >
            <Heart
              className={cn(
                "mr-2 h-4 w-4",
                favoritesOnly && "fill-current"
              )}
            />
            Favoritos
          </Button>
        </div>
      </section>

      <section className="rounded-xl border p-3 sm:p-4">
        <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {filtered.length === 1
              ? "1 item"
              : `${filtered.length} itens`}
          </p>
          <Select
            value={sort}
            onValueChange={(v) => {
              setSort(v as CatalogSort);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[220px]" aria-label="Ordenar">
              <ArrowUpDown className="mr-2 h-4 w-4 shrink-0 opacity-60" />
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              {CATALOG_SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {pageAlbums.length ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6">
            {pageAlbums.map((album) => (
              <AlbumCard
                key={album.musicbrainz_id}
                album={album}
                onClick={() => {
                  setSelected(album);
                  setIsDetailOpen(true);
                }}
                onDelete={handleDelete}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhum álbum encontrado"
            description={
              hasFilters
                ? "Tente outro filtro ou termo de busca."
                : "Busque no catálogo ou adicione manualmente."
            }
            action={
              hasFilters ? undefined : (
                <AlbumSearchModal onAlbumAdded={loadAlbums} />
              )
            }
          />
        )}
      </section>

      {selected && (
        <>
          <AlbumDetailDialog
            album={selected}
            open={isDetailOpen}
            onOpenChange={setIsDetailOpen}
            onEdit={() => setIsEditOpen(true)}
            onShare={() => setIsShareOpen(true)}
            onDelete={() => void handleDelete(selected.musicbrainz_id)}
            onAlbumUpdated={async () => {
              await loadAlbums();
            }}
            onAlbumPatch={(patch) => {
              const id = selected.musicbrainz_id;
              setSelected((prev) => (prev ? { ...prev, ...patch } : prev));
              replace((prev) => {
                const idx = prev.findIndex((a) => a.musicbrainz_id === id);
                if (idx >= 0) {
                  return prev.map((a) =>
                    a.musicbrainz_id === id ? { ...a, ...patch } : a
                  );
                }
                return [{ ...selected, ...patch }, ...prev];
              });
            }}
          />
          <AlbumEditModal
            album={selected}
            open={isEditOpen}
            onOpenChange={setIsEditOpen}
            onAlbumUpdated={async () => {
              await loadAlbums();
            }}
          />
          <AlbumShareDialog
            album={selected}
            open={isShareOpen}
            onOpenChange={setIsShareOpen}
          />
        </>
      )}

      <Pagination
        pageSizes={[6, 12, 36, 60]}
        page={page}
        pageSize={pageSize}
        totalPages={filtered.length === 0 ? 0 : totalPages}
        onSetPage={setPage}
        onSetPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </PageShell>
  );
}
