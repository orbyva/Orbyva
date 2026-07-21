import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { TripFormDialog } from "@/components/TripFormDialog";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { enrichTrip, fetchTrips } from "@/api/travel";
import { TRIP_STATUS_LABELS } from "@/domain/travel";
import type { TripWithChecklist } from "@/types/travel";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";

function TripCard({ trip }: { trip: TripWithChecklist }) {
  return (
    <Link to={`/travel/${trip.id}`}>
      <article
        className={cn(
          "rounded-xl border bg-card p-5 hover:border-primary/30 transition-colors h-full",
          trip.status === "ongoing" && "border-success/40 bg-success/5"
        )}
      >
        <div className="flex justify-between gap-2">
          <div>
            <Badge variant="outline" className="mb-2 text-[10px]">
              {TRIP_STATUS_LABELS[trip.status]}
            </Badge>
            <h3 className="font-semibold">{trip.title}</h3>
            {trip.destination && (
              <p className="text-sm text-muted-foreground">{trip.destination}</p>
            )}
          </div>
          {trip.daysUntilStart != null && trip.daysUntilStart >= 0 && (
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-primary">{trip.daysUntilStart}</p>
              <p className="text-[10px] text-muted-foreground">dias</p>
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {formatDateBR(trip.start_date)} → {formatDateBR(trip.end_date)}
        </p>
        {trip.budget != null && (
          <p className="mt-1 text-xs">
            Orçamento: {formatBRL(trip.budget)}
            {trip.spent != null && trip.spent > 0 && ` · Gasto: ${formatBRL(trip.spent)}`}
          </p>
        )}
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
      const enriched = raw.map((t) => enrichTrip(t, []));
      setTrips(enriched);
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const activeTrips = trips.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled"
  );
  const completedTrips = trips.filter((t) => t.status === "completed");

  return (
    <PageShell
      title="Viagens"
      description="Planeje, acompanhe gastos, roteiro e avalie lugares visitados."
      actions={<Button onClick={() => setOpen(true)}>Nova viagem</Button>}
    >
      {loading ? (
        <TableLoadingSkeleton rows={6} />
      ) : trips.length === 0 ? (
        <EmptyState icon={Plane} title="Nenhuma viagem" description="Planeje sua próxima viagem." action={<Button onClick={() => setOpen(true)}>Nova viagem</Button>} />
      ) : (
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">Ativas ({activeTrips.length})</TabsTrigger>
            <TabsTrigger value="completed">Concluídas ({completedTrips.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">
            {activeTrips.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma viagem ativa.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {activeTrips.map((trip) => <TripCard key={trip.id} trip={trip} />)}
              </div>
            )}
          </TabsContent>
          <TabsContent value="completed" className="mt-4">
            {completedTrips.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma viagem concluída.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {completedTrips.map((trip) => <TripCard key={trip.id} trip={trip} />)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <TripFormDialog open={open} onOpenChange={setOpen} onSaved={load} />
    </PageShell>
  );
}
