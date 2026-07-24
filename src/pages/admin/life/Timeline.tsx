import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell } from "@/components/PageShell";
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
      <PageShell
        title="Timeline"
        description="Tudo que importa — parcelas, manutenções, metas, viagens e hábitos."
      >
        <TableLoadingSkeleton rows={8} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Timeline"
      description="Tudo que importa — parcelas, manutenções, metas, viagens e hábitos."
    >
      <Tabs value={filter} onValueChange={(v) => setFilter(v as TimelineModule | "all")}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="all">Todos</TabsTrigger>
          {ALL_MODULES.map((m) => (
            <TabsTrigger key={m} value={m}>
              {MODULE_LABELS[m]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={filter} className="mt-4 space-y-4 sm:space-y-6">
          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 sm:py-12">
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
    </PageShell>
  );
}
