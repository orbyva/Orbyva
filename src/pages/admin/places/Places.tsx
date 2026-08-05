import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapPin, Search } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { PlaceCard } from "@/components/PlaceCard";
import { PlaceDetailDialog } from "@/components/PlaceDetailDialog";
import { PlaceFormDialog } from "@/components/PlaceFormDialog";
import { PageShell } from "@/components/PageShell";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { deletePlace, fetchPlaces } from "@/api/places";
import { fetchTrips } from "@/api/travel";
import {
  filterPlaces,
  getAverageRating,
  type PlaceRatingFilter,
  type PlaceRecommendFilter,
  type PlaceTripFilter,
} from "@/domain/places";
import type { PlaceFilter, PlaceStatus, PlaceVisit } from "@/types/places";
import type { Trip } from "@/types/travel";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

const CATEGORY_FILTERS: { id: PlaceFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "local", label: "Locais" },
  { id: "trip", label: "Em viagens" },
  { id: "restaurant", label: "Restaurantes" },
  { id: "cafe", label: "Cafés" },
  { id: "bar", label: "Bares" },
  { id: "attraction", label: "Passeios" },
  { id: "hotel", label: "Hotéis" },
  { id: "park", label: "Parques" },
  { id: "museum", label: "Museus" },
  { id: "shop", label: "Lojas" },
  { id: "other", label: "Outros" },
];

export default function Places() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [places, setPlaces] = useState<PlaceVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<PlaceStatus>("to_visit");
  const [category, setCategory] = useState<PlaceFilter>("all");
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<PlaceRatingFilter>("all");
  const [recommendFilter, setRecommendFilter] =
    useState<PlaceRecommendFilter>("all");
  const [tripFilter, setTripFilter] = useState<PlaceTripFilter>("all");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selected, setSelected] = useState<PlaceVisit | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState<PlaceVisit | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [placesData, tripsData] = await Promise.all([
        fetchPlaces(),
        fetchTrips(),
      ]);
      setPlaces(placesData);
      setTrips(tripsData);
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error, "Não foi possível atualizar o lugar."), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setCreateOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const filtered = useMemo(
    () =>
      filterPlaces(places, {
        category,
        search,
        rating: statusFilter === "visited" ? ratingFilter : "all",
        recommend: statusFilter === "visited" ? recommendFilter : "all",
        trip: tripFilter,
        status: statusFilter,
      }),
    [
      places,
      category,
      search,
      ratingFilter,
      recommendFilter,
      tripFilter,
      statusFilter,
    ]
  );

  const tripsWithPlaces = useMemo(() => {
    const ids = new Set(
      places.map((p) => p.trip_id).filter((id): id is string => !!id)
    );
    return trips
      .filter((t) => ids.has(t.id))
      .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  }, [places, trips]);

  const visitedPlaces = useMemo(
    () => places.filter((p) => (p.status ?? "visited") === "visited"),
    [places]
  );
  const avgRating = getAverageRating(visitedPlaces);
  const recommendCount = visitedPlaces.filter(
    (p) => p.would_recommend !== false
  ).length;
  const recommendPct =
    visitedPlaces.length > 0
      ? Math.round((recommendCount / visitedPlaces.length) * 100)
      : null;
  const hasActiveFilters =
    category !== "all" ||
    search.trim().length > 0 ||
    ratingFilter !== "all" ||
    recommendFilter !== "all" ||
    tripFilter !== "all";

  async function handleDelete(id: string) {
    try {
      await deletePlace(id);
      toast({ title: "Lugar excluído", duration: 2000 });
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error, "Não foi possível atualizar o lugar."), variant: "destructive" });
    }
  }

  function clearFilters() {
    setCategory("all");
    setSearch("");
    setRatingFilter("all");
    setRecommendFilter("all");
    setTripFilter("all");
  }

  return (
    <PageShell
      title="Lugares"
      description={
        avgRating != null
          ? `Lista e avaliações — na cidade ou em viagens. Média: ${avgRating}★${
              recommendPct != null ? ` · ${recommendPct}% recomendaria` : ""
            }`
          : "Monte a lista Para visitar e avalie o que já conheceu."
      }
      actions={
        <>
          <ModuleGuideButton moduleId="places" />
          <PlaceFormDialog
            onSaved={load}
            defaultStatus={statusFilter}
            open={createOpen}
            onOpenChange={setCreateOpen}
            showTrigger
          />
        </>
      }
    >
      <ModuleGuide moduleId="places" />
      <Tabs
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v as PlaceStatus)}
      >
        <TabsList>
          <TabsTrigger value="to_visit">Para visitar</TabsTrigger>
          <TabsTrigger value="visited">Visitados</TabsTrigger>
        </TabsList>
      </Tabs>

      <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, endereço ou comentário..."
            className="pl-9"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {statusFilter === "visited" ? (
            <>
              <Select
                value={ratingFilter}
                onValueChange={(v) => setRatingFilter(v as PlaceRatingFilter)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nota mínima" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer nota</SelectItem>
                  <SelectItem value="3">3★ ou mais</SelectItem>
                  <SelectItem value="4">4★ ou mais</SelectItem>
                  <SelectItem value="5">5★ apenas</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={recommendFilter}
                onValueChange={(v) =>
                  setRecommendFilter(v as PlaceRecommendFilter)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Recomendação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="yes">Recomendaria</SelectItem>
                  <SelectItem value="no">Não recomendaria</SelectItem>
                </SelectContent>
              </Select>
            </>
          ) : null}

          <Select
            value={tripFilter}
            onValueChange={(v) => setTripFilter(v as PlaceTripFilter)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Viagem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as viagens</SelectItem>
              <SelectItem value="local">Passeio local</SelectItem>
              {tripsWithPlaces.map((trip) => (
                <SelectItem key={trip.id} value={trip.id}>
                  {trip.title}
                  {trip.destination ? ` · ${trip.destination}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={category} onValueChange={(v) => setCategory(v as PlaceFilter)}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            {CATEGORY_FILTERS.map((f) => (
              <TabsTrigger key={f.id} value={f.id}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {hasActiveFilters && (
          <p className="text-xs text-muted-foreground">
            {filtered.length} de {places.length} lugares
            {" · "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
          </p>
        )}
      </section>

      {loading ? (
        <TableLoadingSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={
            hasActiveFilters
              ? "Nenhum lugar encontrado"
              : statusFilter === "to_visit"
                ? "Nada na lista ainda"
                : "Nenhum lugar visitado"
          }
          description={
            hasActiveFilters
              ? "Tente outro termo ou remova alguns filtros."
              : statusFilter === "to_visit"
                ? "Salve restaurantes, cafés e passeios que você quer conhecer."
                : "Avalie um restaurante, café ou passeio que você visitou."
          }
          action={
            hasActiveFilters ? undefined : (
              <PlaceFormDialog onSaved={load} defaultStatus={statusFilter} />
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              onClick={() => {
                setSelected(place);
                setDetailOpen(true);
              }}
              onDelete={() => handleDelete(place.id)}
            />
          ))}
        </div>
      )}

      <PlaceDetailDialog
        place={selected}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelected(null);
        }}
        isSharedTrip={(selected?.opinionSummary?.totalOpinions ?? 0) > 1}
        onEdit={() => {
          if (!selected) return;
          setEditing(selected);
          setEditOpen(true);
        }}
        onDelete={() => selected && handleDelete(selected.id)}
      />

      {editing && (
        <PlaceFormDialog
          place={editing}
          open={editOpen}
          onOpenChange={(o) => { setEditOpen(o); if (!o) setEditing(null); }}
          onSaved={() => { setEditing(null); setEditOpen(false); load(); }}
        />
      )}
    </PageShell>
  );
}
