import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Target,
  Flame,
  Plane,
  MapPin,
  AlertTriangle,
  Wallet,
  CalendarDays,
  Clapperboard,
  Share2,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { TimelineList } from "@/components/TimelineList";
import { FirstTxChecklist } from "@/components/FirstTxChecklist";
import { ShareImageDialog } from "@/components/ShareImageDialog";
import {
  fetchLifeDashboardSummary,
  fetchTimelineItems,
  getUpcomingTimeline,
} from "@/api/timeline";
import type { LifeDashboardSummary, TimelineItem } from "@/types/timeline";
import { formatBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { BRAND } from "@/lib/brand";
import { track } from "@/lib/analytics";
import {
  dismissMonthShareNudge,
  isMonthShareNudgeDismissed,
} from "@/lib/monthShareNudge";
import {
  generateMonthSpendShareImage,
  monthLabel,
  shareMonthSpendNative,
} from "@/lib/monthSpendShare";
import {
  isNavigatorOffline,
  loadOfflineSnapshot,
  saveOfflineSnapshot,
} from "@/lib/offlineCache";

type HubCache = {
  summary: LifeDashboardSummary;
  upcoming: TimelineItem[];
};

const HUB_CACHE_KEY = "life_hub";

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
  const [shareOpen, setShareOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [sum, timeline] = await Promise.all([
          fetchLifeDashboardSummary(),
          fetchTimelineItems(30, 7),
        ]);
        const upcomingItems = getUpcomingTimeline(timeline, 7);
        const withAlerts: LifeDashboardSummary = {
          ...sum,
          overdueAlerts: timeline.filter((t) => t.status === "overdue").length,
          upcomingAlerts: timeline.filter(
            (t) => t.status === "upcoming" || t.status === "today"
          ).length,
        };
        setSummary(withAlerts);
        setUpcoming(upcomingItems);
        setFromCache(false);
        saveOfflineSnapshot<HubCache>(HUB_CACHE_KEY, {
          summary: withAlerts,
          upcoming: upcomingItems,
        });
      } catch (error) {
        const cached = loadOfflineSnapshot<HubCache>(HUB_CACHE_KEY);
        if (cached && isNavigatorOffline()) {
          setSummary(cached.data.summary);
          setUpcoming(cached.data.upcoming);
          setFromCache(true);
          toast({
            title: "Modo offline",
            description: "Exibindo o último hub salvo neste dispositivo.",
            duration: 3000,
          });
        } else {
          toast({
            title: "Erro",
            description: getErrorMessage(error, "Falha ao carregar dashboard."),
            variant: "destructive",
          });
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toast]);

  useEffect(() => {
    if (!user?.id || !summary) return;
    const hasFinance =
      summary.balance != null && summary.expenseTotal != null;
    setShowNudge(
      hasFinance && !isMonthShareNudgeDismissed(user.id)
    );
  }, [user?.id, summary]);

  const openShare = useCallback(() => {
    track("share_month_open", { source: "home" });
    setShareOpen(true);
  }, []);

  const dismissNudge = useCallback(() => {
    if (user?.id) dismissMonthShareNudge(user.id);
    setShowNudge(false);
  }, [user?.id]);

  if (loading) {
    return (
      <PageShell title="Início" description={BRAND.tagline}>
        <TableLoadingSkeleton rows={6} />
      </PageShell>
    );
  }

  const s = summary!;
  const receita =
    s.balance != null && s.expenseTotal != null
      ? s.balance + s.expenseTotal
      : null;
  const despesa = s.expenseTotal ?? null;

  return (
    <PageShell
      title="Início"
      description={BRAND.shortDescription}
      actions={
        <Button variant="outline" asChild>
          <Link to="/timeline">
            <CalendarDays className="mr-2 h-4 w-4" />
            Ver timeline completa
          </Link>
        </Button>
      }
    >
      <FirstTxChecklist />

      {fromCache ? (
        <p className="text-xs text-muted-foreground">
          Dados do último acesso offline neste dispositivo.
        </p>
      ) : null}

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

      {showNudge && receita != null && despesa != null ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">
              Resumo de {monthLabel(year, month)}
            </p>
            <p className="text-sm text-muted-foreground">
              Saldo {formatBRL(s.balance ?? 0)} · compartilhe o mês no life OS
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={openShare}>
              <Share2 className="mr-2 h-4 w-4" />
              Compartilhar
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label="Dispensar"
              onClick={dismissNudge}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          title="Para assistir"
          value={String(s.moviesToWatch)}
          subtitle="Fila do cinema"
          icon={Clapperboard}
          href="/movies"
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
          { label: "Filmes", href: "/movies" },
          { label: "Hábitos", href: "/habits" },
          { label: "Lugares", href: "/places" },
          { label: "Metas", href: "/goals" },
          { label: "Veículos", href: "/car" },
          { label: "Viagens", href: "/travel" },
          { label: "Finanças", href: "/finance/dashboard" },
        ].map((link) => (
          <Button key={link.href} variant="outline" className="justify-start" asChild>
            <Link to={link.href}>{link.label}</Link>
          </Button>
        ))}
      </section>

      {receita != null && despesa != null ? (
        <ShareImageDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          title={`Compartilhar ${monthLabel(year, month)}`}
          generateImage={() =>
            generateMonthSpendShareImage({
              year,
              month,
              receita,
              despesa,
            })
          }
          share={async (blob) => {
            const result = await shareMonthSpendNative(
              { year, month, receita, despesa },
              blob
            );
            if (result !== "cancelled") {
              track("share_month_done", { result, source: "home" });
              if (user?.id) dismissMonthShareNudge(user.id);
              setShowNudge(false);
            }
            return result;
          }}
        />
      ) : null}
    </PageShell>
  );
}
