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

import { deleteAlbum, fetchAllAlbums } from "@/api/albums";
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
  getLatestListenedDate,
  getListenedAlbumsStats,
} from "@/domain/music";

const albumsCatalogCache = createMemoryCache<Album[]>();

function sortAlbumsForStatus(list: Album[], status: AlbumStatus): Album[] {
  const copy = [...list];
  if (status === "listened") {
    copy.sort((a, b) => {
      const da = getLatestListenedDate(a.listened_dates) ?? "";
      const db = getLatestListenedDate(b.listened_dates) ?? "";
      return db.localeCompare(da);
    });
  } else {
    copy.sort((a, b) => (b.release_year ?? 0) - (a.release_year ?? 0));
  }
  return copy;
}

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(36);

  const [selected, setSelected] = useState<Album | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  const { toast } = useToast();

  const loadAlbums = useCallback(() => reload(true), [reload]);

  const statusAlbums = useMemo(
    () =>
      sortAlbumsForStatus(
        allAlbums.filter((a) => a.status === filter),
        filter
      ),
    [allAlbums, filter]
  );

  const artists = useMemo(
    () => collectAlbumArtists(statusAlbums),
    [statusAlbums]
  );
  const types = useMemo(() => collectAlbumTypes(statusAlbums), [statusAlbums]);
  const listenedStats = useMemo(
    () => getListenedAlbumsStats(statusAlbums),
    [statusAlbums]
  );

  const filtered = useMemo(() => {
    const byMeta = filterAlbumsByMeta(statusAlbums, {
      artist: artistFilter,
      albumType: typeFilter,
      minRating: filter === "listened" ? ratingFloor : "all",
    });
    const q = searchTerm.trim().toLowerCase();
    if (!q) return byMeta;
    return byMeta.filter((album) => {
      const haystack = [album.title, album.notes, ...(album.artists ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    statusAlbums,
    searchTerm,
    artistFilter,
    typeFilter,
    ratingFloor,
    filter,
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

  const description =
    filter === "listened" && listenedStats.avgRating != null
      ? `Álbuns e opiniões · média ${formatAlbumRating(listenedStats.avgRating)}/10 em ${listenedStats.rated} álbum${listenedStats.rated === 1 ? "" : "s"}`
      : "Álbuns, EPs e o que você ouviu.";

  const hasFilters =
    searchTerm ||
    artistFilter !== "all" ||
    typeFilter !== "all" ||
    ratingFloor !== "all";

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
        </div>
      </section>

      <section className="rounded-xl border p-3 sm:p-4">
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
