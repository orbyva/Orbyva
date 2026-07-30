import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { TripFormDialog } from "@/components/TripFormDialog";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { enrichTrip, fetchChecklistsForTrips, fetchTrips } from "@/api/travel";
import { TRIP_STATUS_LABELS } from "@/domain/travel";
import type { TripWithChecklist } from "@/types/travel";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";

function TripCard({ trip }: { trip: TripWithChecklist }) {
  const checklistDone = trip.checklist.filter((c) => c.done).length;
  const checklistTotal = trip.checklist.length;

  return (
    <Link to={`/travel/${trip.id}`}>
      <article
        className={cn(
          "h-full rounded-xl border bg-card p-3.5 transition-colors hover:border-primary/30 sm:p-5",
          trip.status === "ongoing" && "border-success/40 bg-success/5"
        )}
      >
        <div className="flex justify-between gap-2">
          <div>
            <Badge variant="outline" className="mb-2 text-[10px]">
              {TRIP_STATUS_LABELS[trip.status]}
            </Badge>
            <h3 className="font-semibold">{trip.title}</h3>
            {trip.destination ? (
              <p className="text-sm text-muted-foreground">{trip.destination}</p>
            ) : null}
          </div>
          {trip.daysUntilStart != null && trip.daysUntilStart >= 0 ? (
            <div className="shrink-0 text-right">
              <p className="text-xl font-bold text-primary sm:text-2xl">
                {trip.daysUntilStart}
              </p>
              <p className="text-[10px] text-muted-foreground">dias</p>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {formatDateBR(trip.start_date)} → {formatDateBR(trip.end_date)}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {trip.budget != null ? (
            <span>
              Orçamento {formatBRL(trip.budget)}
              {trip.spent != null && trip.spent > 0
                ? ` · Gasto ${formatBRL(trip.spent)}`
                : ""}
            </span>
          ) : trip.spent != null && trip.spent > 0 ? (
            <span>Gasto {formatBRL(trip.spent)}</span>
          ) : null}
          {checklistTotal > 0 ? (
            <span>
              Checklist {checklistDone}/{checklistTotal}
              {trip.checklistProgress != null
                ? ` · ${trip.checklistProgress}%`
                : ""}
            </span>
          ) : null}
        </div>
        {checklistTotal > 0 ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/80"
              style={{ width: `${trip.checklistProgress ?? 0}%` }}
            />
          </div>
        ) : null}
      </article>
    </Link>
  );
}

export default function Travel() {
  const [trips, setTrips] = useState<TripWithChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const raw = await fetchTrips();
      const items = await fetchChecklistsForTrips(raw.map((t) => t.id));
      const enriched = raw.map((t) =>
        enrichTrip(
          t,
          items.filter((i) => i.trip_id === t.id)
        )
      );
      setTrips(enriched);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar as viagens."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeTrips = trips.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled"
  );
  const completedTrips = trips.filter((t) => t.status === "completed");

  return (
    <PageShell
      title="Viagens"
      description="Planeje, acompanhe gastos, roteiro e lugares para visitar."
      actions={
        <>
          <ModuleGuideButton moduleId="travel" />
          <Button onClick={() => setOpen(true)}>Nova viagem</Button>
        </>
      }
    >
      <ModuleGuide moduleId="travel" />
      {loading ? (
        <TableLoadingSkeleton rows={6} />
      ) : trips.length === 0 ? (
        <EmptyState
          icon={Plane}
          title="Nenhuma viagem"
          description="Planeje sua próxima viagem."
          action={
            <Button onClick={() => setOpen(true)}>Nova viagem</Button>
          }
        />
      ) : (
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">
              Ativas ({activeTrips.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Concluídas ({completedTrips.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">
            {activeTrips.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma viagem ativa.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {activeTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="completed" className="mt-4">
            {completedTrips.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma viagem concluída.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {completedTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <TripFormDialog open={open} onOpenChange={setOpen} onSaved={load} />
    </PageShell>
  );
}
