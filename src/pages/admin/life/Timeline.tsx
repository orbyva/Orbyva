import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { TimelineList } from "@/components/TimelineList";
import {
  fetchTimelineItems,
  groupTimelineByDate,
  MODULE_LABELS,
} from "@/api/timeline";
import type { TimelineItem, TimelineModule } from "@/types/timeline";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";

const ALL_MODULES: TimelineModule[] = [
  "finance",
  "car",
  "travel",
  "goals",
  "habits",
  "places",
];

export default function Timeline() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [filter, setFilter] = useState<TimelineModule | "all">("all");
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await fetchTimelineItems(90, 30);
        setItems(data);
      } catch (error) {
        toast({
          title: "Erro",
          description: getErrorMessage(error, "Falha ao carregar timeline."),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toast]);

  const filtered = useMemo(
    () =>
      filter === "all" ? items : items.filter((i) => i.module === filter),
    [items, filter]
  );

  const grouped = useMemo(
    () => groupTimelineByDate(filtered),
    [filtered]
  );

  if (loading) {
    return (
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <TableLoadingSkeleton rows={8} />
      </main>
    );
  }

  return (
    <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Timeline</h1>
        <p className="text-sm text-muted-foreground">
          Tudo que importa — parcelas, manutenções, metas, viagens e hábitos.
        </p>
      </section>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as TimelineModule | "all")}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="all">Todos</TabsTrigger>
          {ALL_MODULES.map((m) => (
            <TabsTrigger key={m} value={m}>
              {MODULE_LABELS[m]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={filter} className="mt-4 space-y-6">
          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Nenhum evento encontrado.
            </p>
          ) : (
            grouped.map((group) => (
              <section key={group.date}>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                  {group.dateLabel}
                </h2>
                <TimelineList items={group.items} />
              </section>
            ))
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
