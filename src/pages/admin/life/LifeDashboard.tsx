import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Target,
  Flame,
  Plane,
  MapPin,
  AlertTriangle,
  Wallet,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { TimelineList } from "@/components/TimelineList";
import {
  fetchLifeDashboardSummary,
  fetchTimelineItems,
  getUpcomingTimeline,
} from "@/api/timeline";
import type { LifeDashboardSummary, TimelineItem } from "@/types/timeline";
import { formatBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  href,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: typeof Target;
  href?: string;
}) {
  const content = (
    <Card className="p-4 hover:border-primary/30 transition-colors">
      <CardHeader className="p-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <p className="text-2xl font-bold">{value}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );

  return href ? <Link to={href}>{content}</Link> : content;
}

export default function LifeDashboard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<LifeDashboardSummary | null>(null);
  const [upcoming, setUpcoming] = useState<TimelineItem[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [sum, timeline] = await Promise.all([
          fetchLifeDashboardSummary(),
          fetchTimelineItems(30, 7),
        ]);
        setSummary(sum);
        setUpcoming(getUpcomingTimeline(timeline, 7));
      } catch (error) {
        toast({
          title: "Erro",
          description: getErrorMessage(error, "Falha ao carregar dashboard."),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toast]);

  if (loading) {
    return (
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <TableLoadingSkeleton rows={6} />
      </main>
    );
  }

  const s = summary!;

  return (
    <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Início</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral da sua vida — finanças, metas, hábitos e mais.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/timeline">
            <CalendarDays className="mr-2 h-4 w-4" />
            Ver timeline completa
          </Link>
        </Button>
      </section>

      {(s.overdueAlerts > 0 || s.upcomingAlerts > 0) && (
        <section className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" />
            Alertas
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {s.overdueAlerts > 0 && (
              <span className="text-destructive font-medium">
                {s.overdueAlerts} atrasado{s.overdueAlerts > 1 ? "s" : ""}
              </span>
            )}
            {s.overdueAlerts > 0 && s.upcomingAlerts > 0 && " · "}
            {s.upcomingAlerts > 0 && (
              <span>{s.upcomingAlerts} nos próximos dias</span>
            )}
          </p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          title="Metas ativas"
          value={String(s.activeGoals)}
          icon={Target}
          href="/goals"
        />
        <SummaryCard
          title="Hábitos hoje"
          value={`${s.habitsTodayDone}/${s.habitsTodayTotal}`}
          subtitle={
            s.habitsTodayTotal > 0
              ? `${Math.round((s.habitsTodayDone / s.habitsTodayTotal) * 100)}% concluído`
              : "Nenhum hábito cadastrado"
          }
          icon={Flame}
          href="/habits"
        />
        <SummaryCard
          title="Lugares visitados"
          value={String(s.totalPlaces)}
          subtitle="Restaurantes, cafés e passeios"
          icon={MapPin}
          href="/places"
        />
        <SummaryCard
          title="Viagens próximas"
          value={String(s.upcomingTrips)}
          icon={Plane}
          href="/travel"
        />
        <SummaryCard
          title="Saldo do mês"
          value={s.balance != null ? formatBRL(s.balance) : "—"}
          subtitle={
            s.expenseTotal != null
              ? `Despesas: ${formatBRL(s.expenseTotal)}`
              : undefined
          }
          icon={Wallet}
          href="/finance/dashboard"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Próximos 7 dias</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/timeline">Ver tudo →</Link>
          </Button>
        </div>
        <TimelineList items={upcoming} compact />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Casa", href: "/home" },
          { label: "Filmes", href: "/movies" },
          { label: "Hábitos", href: "/habits" },
          { label: "Lugares", href: "/places" },
          { label: "Metas", href: "/goals" },
          { label: "Carro", href: "/car" },
          { label: "Viagens", href: "/travel" },
          { label: "Finanças", href: "/finance/dashboard" },
        ].map((link) => (
          <Button key={link.href} variant="outline" className="justify-start" asChild>
            <Link to={link.href}>{link.label}</Link>
          </Button>
        ))}
      </section>
    </main>
  );
}
