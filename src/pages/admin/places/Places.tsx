import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { PlaceCard } from "@/components/PlaceCard";
import { PlaceFormDialog } from "@/components/PlaceFormDialog";
import { PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";
import { deletePlace, fetchPlaces } from "@/api/places";
import { getAverageRating } from "@/domain/places";
import type { PlaceFilter, PlaceVisit } from "@/types/places";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";

const FILTERS: { id: PlaceFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "local", label: "Locais" },
  { id: "trip", label: "Em viagens" },
  { id: "restaurant", label: "Restaurantes" },
  { id: "cafe", label: "Cafés" },
  { id: "bar", label: "Bares" },
  { id: "attraction", label: "Passeios" },
];

export default function Places() {
  const [places, setPlaces] = useState<PlaceVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PlaceFilter>("all");
  const [editing, setEditing] = useState<PlaceVisit | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setPlaces(await fetchPlaces());
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return places.filter((p) => {
      if (filter === "all") return true;
      if (filter === "local") return !p.trip_id;
      if (filter === "trip") return !!p.trip_id;
      return p.type === filter;
    });
  }, [places, filter]);

  const avgRating = getAverageRating(places);

  async function handleDelete(id: string) {
    try {
      await deletePlace(id);
      toast({ title: "Lugar excluído", duration: 2000 });
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  return (
    <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lugares</h1>
          <p className="text-sm text-muted-foreground">
            Avalie restaurantes, cafés e passeios — na cidade ou em viagens.
            {avgRating != null && (
              <span className="ml-1 font-medium text-foreground">
                Média: {avgRating}★
              </span>
            )}
          </p>
        </div>
        <div className={PAGE_HEADER_ACTIONS_CLASS}>
          <PlaceFormDialog onSaved={load} />
        </div>
      </section>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as PlaceFilter)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.id} value={f.id}>{f.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={filter} className="mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="Nenhum lugar registrado"
              description="Avalie um restaurante, café ou passeio que você visitou."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((place) => (
                <div key={place.id} className="relative group">
                  <PlaceCard
                    place={place}
                    onClick={() => { setEditing(place); setEditOpen(true); }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-destructive text-xs h-7"
                    onClick={() => handleDelete(place.id)}
                  >
                    Excluir
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {editing && (
        <PlaceFormDialog
          place={editing}
          open={editOpen}
          onOpenChange={(o) => { setEditOpen(o); if (!o) setEditing(null); }}
          onSaved={() => { setEditing(null); setEditOpen(false); load(); }}
        />
      )}
    </main>
  );
}
