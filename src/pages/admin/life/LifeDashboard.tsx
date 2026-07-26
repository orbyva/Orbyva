import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  Car,
  CheckCircle2,
  Clapperboard,
  CreditCard,
  MapPin,
  PiggyBank,
  Plane,
  Plus,
  Share2,
  Star,
  Target,
  Wallet,
  X,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import {
  fetchLifeDashboardSummary,
  fetchTimelineItems,
  getUpcomingTimeline,
  MODULE_LABELS,
} from "@/api/timeline";
import { fetchAppAlerts, type AppAlert } from "@/api/alerts";
import {
  fetchHabits,
  fetchAllHabitLogs,
} from "@/api/habits";
import {
  fetchLatestTransactionAt,
  fetchMonthlyBudgetSummary,
  fetchValueByNatureForMonth,
} from "@/api/finance";
import {
  fetchRecurringTransactions,
  getRecurringDueAlerts,
} from "@/api/recurring";
import { fetchMovies } from "@/api/movies";
import type { LifeDashboardSummary, TimelineItem } from "@/types/timeline";
import type { Habit, HabitLog } from "@/types/habits";
import type { MonthlyBudgetSummary } from "@/types/finance";
import type { RecurringDueAlert } from "@/types/recurring";
import type { Movie } from "@/types/movies";
import { isCompletedToday } from "@/domain/habits";
import { formatMovieRating } from "@/domain/movies";
import { formatBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import {
  formatMomTrend,
  previousYearMonth,
} from "@/domain/finance/insights";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { BRAND } from "@/lib/brand";
import { track } from "@/lib/analytics";
import {
  dismissMonthShareNudge,
  isMonthShareNudgeDismissed,
} from "@/lib/monthShareNudge";
import {
  daysSinceIsoDate,
  dismissLedgerStaleNudge,
  isLedgerStaleNudgeDismissed,
} from "@/lib/ledgerStickiness";
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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { FirstTxChecklist } from "@/components/FirstTxChecklist";
import { ShareImageDialog } from "@/components/ShareImageDialog";

const HOME_MODULES = [
  {
    label: "Finanças",
    subtitle: "Livro-caixa",
    href: "/finance/dashboard",
    icon: Wallet,
    tone: "bg-primary/10 text-primary",
  },
  {
    label: "Hábitos",
    subtitle: "Rotina do dia",
    href: "/habits",
    icon: CheckCircle2,
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    label: "Metas",
    subtitle: "Progresso longo prazo",
    href: "/goals",
    icon: Target,
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    label: "Viagens",
    subtitle: "Planeje e viva",
    href: "/travel",
    icon: Plane,
    tone: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  },
  {
    label: "Lugares",
    subtitle: "Onde você esteve",
    href: "/places",
    icon: MapPin,
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  {
    label: "Cinema",
    subtitle: "Filmes e séries",
    href: "/movies",
    icon: Clapperboard,
    tone: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400",
  },
  {
    label: "Veículos",
    subtitle: "Tudo do seu carro",
    href: "/car",
    icon: Car,
    tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
] as const;

const MODULE_DOT: Record<string, string> = {
  finance: "bg-primary",
  car: "bg-[hsl(var(--car))]",
  travel: "bg-[hsl(var(--travel))]",
  goals: "bg-emerald-500",
  habits: "bg-violet-500",
  places: "bg-sky-500",
  cinema: "bg-[hsl(var(--cinema))]",
};

function daysUntilIso(isoDate: string, from = new Date()): number {
  const target = new Date(`${isoDate}T12:00:00`);
  const start = new Date(from);
  start.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

function formatShortDate(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

type HubCache = {
  summary: LifeDashboardSummary;
  upcoming: TimelineItem[];
  alerts: AppAlert[];
};

const HUB_CACHE_KEY = "life_hub_v2";

function hubCacheKey(userId: string | undefined): string {
  return userId ? `${HUB_CACHE_KEY}:${userId}` : HUB_CACHE_KEY;
}

function todayHeading(d = new Date()): string {
  const raw = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function firstNameFromUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null): string | null {
  const meta = user?.user_metadata ?? {};
  const raw =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.given_name === "string" && meta.given_name) ||
    (user?.email ? user.email.split("@")[0] : "") ||
    "";
  const first = raw.trim().split(/\s+/)[0] ?? "";
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function severityAccent(severity: AppAlert["severity"]): string {
  if (severity === "danger") {
    return "border-destructive/25 bg-destructive/[0.06]";
  }
  if (severity === "warning") {
    return "border-amber-500/25 bg-amber-500/[0.06]";
  }
  return "border-border bg-card";
}

function severityIcon(severity: AppAlert["severity"]): string {
  if (severity === "danger") return "text-destructive";
  if (severity === "warning") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function budgetMonthIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export default function LifeDashboard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<LifeDashboardSummary | null>(null);
  const [upcoming, setUpcoming] = useState<TimelineItem[]>([]);
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [lastMovie, setLastMovie] = useState<Movie | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [budgetRows, setBudgetRows] = useState<MonthlyBudgetSummary[]>([]);
  const [recurringAlerts, setRecurringAlerts] = useState<RecurringDueAlert[]>(
    []
  );
  const [daysWithoutTx, setDaysWithoutTx] = useState<number | null>(null);
  const [showStaleNudge, setShowStaleNudge] = useState(false);
  const [momDespesa, setMomDespesa] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  useEffect(() => {
    track("ledger_open", { source: "home" });
  }, []);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [
          sum,
          timeline,
          appAlerts,
          habitsBundle,
          budgets,
          recurring,
          latestAt,
          watchedPage,
          prevMonthTotals,
        ] = await Promise.all([
          fetchLifeDashboardSummary(),
          fetchTimelineItems(30, 7),
          fetchAppAlerts(),
          Promise.all([fetchHabits(), fetchAllHabitLogs()]),
          fetchMonthlyBudgetSummary(budgetMonthIso()).catch(() => []),
          fetchRecurringTransactions().catch(() => []),
          fetchLatestTransactionAt().catch(() => null),
          fetchMovies("watched", 1, 1).catch(() => ({ data: [], total: 0 })),
          (() => {
            const prev = previousYearMonth(year, month);
            return fetchValueByNatureForMonth(prev.year, prev.month).catch(
              () => null
            );
          })(),
        ]);
        const upcomingItems = getUpcomingTimeline(timeline, 7);
        const withAlerts: LifeDashboardSummary = {
          ...sum,
          overdueAlerts: timeline.filter((t) => t.status === "overdue").length,
          upcomingAlerts: timeline.filter(
            (t) => t.status === "upcoming" || t.status === "today"
          ).length,
        };
        const [h, l] = habitsBundle;
        setSummary(withAlerts);
        const prevYm = previousYearMonth(year, month);
        setMomDespesa(
          formatMomTrend(
            withAlerts.expenseTotal ?? 0,
            prevMonthTotals?.despesa_total,
            prevYm.month
          )
        );
        setUpcoming(upcomingItems);
        setAlerts(appAlerts.slice(0, 6));
        setHabits(h);
        setHabitLogs(l);
        setBudgetRows(budgets);
        setRecurringAlerts(getRecurringDueAlerts(recurring).slice(0, 3));
        setLastMovie(watchedPage.data[0] ?? null);
        const days = daysSinceIsoDate(latestAt);
        setDaysWithoutTx(days);
        if (days != null && days >= 3) {
          track("day_without_tx", { days });
        }
        setFromCache(false);
        saveOfflineSnapshot<HubCache>(hubCacheKey(user?.id), {
          summary: withAlerts,
          upcoming: upcomingItems,
          alerts: appAlerts.slice(0, 6),
        });
      } catch (error) {
        const cached = loadOfflineSnapshot<HubCache>(hubCacheKey(user?.id));
        if (cached && isNavigatorOffline()) {
          setSummary(cached.data.summary);
          setUpcoming(cached.data.upcoming);
          setAlerts(cached.data.alerts ?? []);
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
    void load();
  }, [toast, user?.id, year, month]);

  useEffect(() => {
    if (!user?.id || !summary) return;
    const hasFinance =
      summary.balance != null && summary.expenseTotal != null;
    setShowNudge(hasFinance && !isMonthShareNudgeDismissed(user.id));
  }, [user?.id, summary]);

  useEffect(() => {
    if (!user?.id) return;
    if (daysWithoutTx == null || daysWithoutTx < 3) {
      setShowStaleNudge(false);
      return;
    }
    setShowStaleNudge(!isLedgerStaleNudgeDismissed(user.id));
  }, [user?.id, daysWithoutTx]);

  const openShare = useCallback(() => {
    track("share_month_open", { source: "home" });
    setShareOpen(true);
  }, []);

  const dismissNudge = useCallback(() => {
    if (user?.id) dismissMonthShareNudge(user.id);
    setShowNudge(false);
  }, [user?.id]);

  const dismissStale = useCallback(() => {
    if (user?.id) dismissLedgerStaleNudge(user.id);
    setShowStaleNudge(false);
  }, [user?.id]);

  const habitsDone = useMemo(
    () =>
      habits.filter((h) =>
        isCompletedToday(habitLogs.filter((l) => l.habit_id === h.id))
      ).length,
    [habits, habitLogs]
  );

  const nextTrip = useMemo(
    () => upcoming.find((i) => i.module === "travel") ?? null,
    [upcoming]
  );

  const nextPayment = recurringAlerts[0] ?? null;

  const expenseBudgets = useMemo(
    () =>
      budgetRows.filter((b) =>
        /despesa/i.test(b.nature_name || "")
      ),
    [budgetRows]
  );

  const budgetHighlight = useMemo(() => {
    if (expenseBudgets.length === 0) return null;
    const worst = [...expenseBudgets].sort(
      (a, b) => (b.percentage_used ?? 0) - (a.percentage_used ?? 0)
    )[0];
    const planned = expenseBudgets.reduce(
      (s, b) => s + Number(b.planned_value || 0),
      0
    );
    const spent = expenseBudgets.reduce(
      (s, b) => s + Number(b.spent_value || 0),
      0
    );
    return { worst, planned, spent, pct: planned > 0 ? (spent / planned) * 100 : 0 };
  }, [expenseBudgets]);

  const priorityAlerts = useMemo(() => {
    const rank: Record<AppAlert["severity"], number> = {
      danger: 0,
      warning: 1,
      info: 2,
      success: 3,
    };
    // Home: urgência primeiro — success/info não competem com o que precisa de ação
    return [...alerts]
      .filter((a) => a.severity === "danger" || a.severity === "warning")
      .sort((a, b) => (rank[a.severity] ?? 2) - (rank[b.severity] ?? 2))
      .slice(0, 2);
  }, [alerts]);

  const urgentAlertExtra = useMemo(() => {
    const urgent = alerts.filter(
      (a) => a.severity === "danger" || a.severity === "warning"
    ).length;
    return Math.max(0, urgent - 2);
  }, [alerts]);

  const firstName = firstNameFromUser(user);

  if (loading) {
    return (
      <PageShell hideHeader className="space-y-4 pb-20 md:pb-6">
        <div className="space-y-1">
          <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-56 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-52 animate-pulse rounded-3xl bg-muted" />
        <TableLoadingSkeleton rows={5} />
      </PageShell>
    );
  }

  const s = summary!;
  const receita =
    s.balance != null && s.expenseTotal != null
      ? s.balance + s.expenseTotal
      : null;
  const despesa = s.expenseTotal ?? null;
  const balancePositive = (s.balance ?? 0) >= 0;
  const tripCountdown = nextTrip ? daysUntilIso(nextTrip.date) : null;

  return (
    <PageShell
      hideHeader
      className="relative space-y-4 pb-20 sm:space-y-6 md:pb-8 lg:space-y-7"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-6 h-72 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.14),_transparent_65%)]"
      />

      {/* Saudação */}
      <header className="relative flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            {BRAND.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight leading-none sm:text-[2.05rem]">
            {firstName ? `Olá, ${firstName}!` : "Olá"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{todayHeading()}</p>
        </div>
        <Button size="sm" className="shrink-0 shadow-sm" asChild>
          <Link
            to="/finance/transactions?new=1"
            onClick={() => track("quick_add_open", { source: "home" })}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Despesa
          </Link>
        </Button>
      </header>

      <FirstTxChecklist />

      {fromCache ? (
        <p className="relative text-xs text-muted-foreground">
          Dados do último acesso offline neste dispositivo.
        </p>
      ) : null}

      {/* Herói unificado — compacto */}
      <section className="relative overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-md">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/12"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-14 left-1/4 h-32 w-32 rounded-full bg-black/15"
        />

        <div className="relative px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/70">
                Ledger · {monthLabel(year, month)}
              </p>
              <p className="mt-1.5 text-xs text-primary-foreground/70">
                Saldo do mês
              </p>
              <p
                className={cn(
                  "mt-0.5 text-xl font-semibold tabular-nums tracking-tight sm:text-3xl",
                  !balancePositive && "text-primary-foreground/90"
                )}
              >
                {s.balance != null ? formatBRL(s.balance) : "—"}
              </p>
              {momDespesa ? (
                <p className="mt-1 text-[11px] text-primary-foreground/75">
                  Despesa {momDespesa}
                </p>
              ) : null}
            </div>
            <Link
              to="/finance/dashboard"
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-primary-foreground/90 transition-colors hover:bg-white/15"
            >
              Finanças
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/15 pt-3 sm:max-w-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-primary-foreground/60">
                Receitas
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {receita != null ? formatBRL(receita) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-primary-foreground/60">
                Despesas
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {despesa != null ? formatBRL(despesa) : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="relative grid gap-px border-t border-white/15 bg-white/10 sm:grid-cols-2">
          <Link
            to="/finance/budget"
            className="bg-black/10 px-4 py-3 transition-colors hover:bg-black/15"
          >
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground/65">
              <PiggyBank className="h-3 w-3" />
              Orçamento
            </p>
            {budgetHighlight ? (
              <>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatBRL(budgetHighlight.spent)}
                  <span className="font-normal text-primary-foreground/65">
                    {" "}
                    / {formatBRL(budgetHighlight.planned)}
                  </span>
                </p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/20">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      budgetHighlight.pct >= 100
                        ? "bg-rose-300"
                        : budgetHighlight.pct >= 80
                          ? "bg-amber-300"
                          : "bg-white"
                    )}
                    style={{
                      width: `${Math.min(100, budgetHighlight.pct)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-primary-foreground/65">
                  {budgetHighlight.pct.toFixed(0)}% usado
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-primary-foreground/75">
                Definir teto
              </p>
            )}
          </Link>

          <Link
            to="/finance/recurring"
            className="bg-black/10 px-4 py-3 transition-colors hover:bg-black/15"
          >
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground/65">
              <Wallet className="h-3 w-3" />
              Parcelas
            </p>
            {recurringAlerts.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {recurringAlerts.slice(0, 1).map((a) => (
                  <li
                    key={`${a.recurring.id}-${a.installmentNumber}`}
                    className="text-sm leading-snug line-clamp-1"
                  >
                    {a.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-primary-foreground/75">
                Nada urgente
              </p>
            )}
          </Link>
        </div>

        {showNudge && receita != null && despesa != null ? (
          <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-white/15 bg-black/20 px-4 py-2.5">
            <p className="text-xs text-primary-foreground/85">
              Ritual de {monthLabel(year, month)}
            </p>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 bg-white px-2.5 text-xs text-primary hover:bg-white/90"
                onClick={openShare}
              >
                <Share2 className="mr-1 h-3 w-3" />
                Compartilhar
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
                aria-label="Dispensar"
                onClick={dismissNudge}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {showStaleNudge && daysWithoutTx != null ? (
        <section className="relative flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm">
            <span className="font-semibold">
              Sem lançamentos há {daysWithoutTx} dias.
            </span>{" "}
            <span className="text-muted-foreground">
              Um registro rápido mantém o ledger vivo.
            </span>
          </p>
          <div className="flex items-center gap-1.5">
            <Button size="sm" className="h-8" asChild>
              <Link
                to="/finance/transactions?new=1"
                onClick={() =>
                  track("quick_add_open", { source: "stale_nudge" })
                }
              >
                Lançar agora
              </Link>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label="Dispensar"
              onClick={dismissStale}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </section>
      ) : null}

      {/* Atenção (top 2) + Resumo */}
      <div className="relative grid gap-4 sm:gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
        <section className="space-y-3 lg:col-span-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">Atenção</h2>
            {urgentAlertExtra > 0 ? (
              <span className="text-xs text-muted-foreground">
                +{urgentAlertExtra} no sino
              </span>
            ) : null}
          </div>

          {priorityAlerts.length > 0 ? (
            <ul className="space-y-2.5">
              {priorityAlerts.map((a) => (
                <li key={a.id}>
                  <Link
                    to={a.href}
                    className={cn(
                      "group flex gap-2.5 rounded-xl border px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3.5",
                      severityAccent(a.severity)
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/60",
                        severityIcon(a.severity)
                      )}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {a.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {a.message}
                      </span>
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed px-4 py-8 text-center">
              <p className="text-sm font-medium">Tudo em dia</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Nenhum alerta urgente agora.
              </p>
            </div>
          )}
        </section>

        <section className="space-y-3 lg:col-span-7">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">
            Resumo do dia
          </h2>
          <ul className="overflow-hidden rounded-[1.25rem] border bg-card/80 shadow-sm divide-y backdrop-blur">
              <li>
                <Link
                  to="/habits"
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-3.5 sm:px-4 sm:py-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 sm:h-10 sm:w-10 sm:rounded-2xl">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {habits.length === 0
                        ? "Nenhum hábito ainda"
                        : `${habits.length} hábito${habits.length === 1 ? "" : "s"} para hoje`}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Disciplina do dia
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                    {habits.length === 0
                      ? "Criar"
                      : `${habitsDone}/${habits.length}`}
                  </span>
                </Link>
              </li>

              {nextTrip ? (
                <li>
                  <Link
                    to={nextTrip.link ?? "/travel"}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-3.5 sm:px-4 sm:py-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 sm:h-10 sm:w-10 sm:rounded-2xl">
                      <Plane className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold line-clamp-1">
                        {nextTrip.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Próxima viagem
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                      {tripCountdown == null
                        ? ""
                        : tripCountdown < 0
                          ? "Atrasada"
                          : tripCountdown === 0
                            ? "Hoje"
                            : tripCountdown === 1
                              ? "Amanhã"
                              : `Faltam ${tripCountdown} dias`}
                    </span>
                  </Link>
                </li>
              ) : null}

              {nextPayment ? (
                <li>
                  <Link
                    to="/finance/recurring"
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-3.5 sm:px-4 sm:py-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/12 text-rose-600 dark:text-rose-400 sm:h-10 sm:w-10 sm:rounded-2xl">
                      <CreditCard className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        Próximo pagamento
                      </span>
                      <span className="block text-xs text-muted-foreground line-clamp-1">
                        {nextPayment.recurring.description}
                        {` · ${formatShortDate(nextPayment.dueDate)}`}
                      </span>
                    </span>
                  </Link>
                </li>
              ) : null}

              {lastMovie ? (
                <li>
                  <Link
                    to="/movies"
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-3.5 sm:px-4 sm:py-3"
                  >
                    {lastMovie.poster && lastMovie.poster !== "N/A" ? (
                      <img
                        src={lastMovie.poster}
                        alt=""
                        className="h-10 w-7 shrink-0 rounded-md object-cover shadow-sm sm:h-12 sm:w-9 sm:rounded-lg"
                      />
                    ) : (
                      <span className="flex h-10 w-7 shrink-0 items-center justify-center rounded-md bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-400 sm:h-12 sm:w-9 sm:rounded-lg">
                        <Clapperboard className="h-4 w-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        Você assistiu
                      </span>
                      <span className="block text-xs text-muted-foreground line-clamp-1">
                        {lastMovie.title}
                      </span>
                    </span>
                    {lastMovie.rating != null ? (
                      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        {formatMovieRating(lastMovie.rating)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ) : null}
            </ul>
        </section>
      </div>

      {/* Timeline + módulos */}
      <div className="relative grid gap-4 sm:gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
        <section className="space-y-3 lg:col-span-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">
              Próximos 7 dias
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              asChild
            >
              <Link to="/timeline">
                <CalendarDays className="mr-1 h-3.5 w-3.5" />
                Timeline
              </Link>
            </Button>
          </div>
          {upcoming.length > 0 ? (
            <ul className="overflow-hidden rounded-[1.25rem] border bg-card/80 shadow-sm divide-y backdrop-blur">
              {upcoming.slice(0, 5).map((item) => {
                const body = (
                  <span className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-3 sm:px-4 sm:py-3">
                    <span
                      className={cn(
                        "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                        MODULE_DOT[item.module] ?? "bg-muted-foreground"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium line-clamp-1">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {MODULE_LABELS[item.module] ?? item.module}
                        {item.subtitle ? ` · ${item.subtitle}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatShortDate(item.date)}
                      </span>
                      {item.status === "overdue" || item.status === "today" ? (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                            item.status === "overdue"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          )}
                        >
                          {item.status === "overdue" ? "Atrasado" : "Hoje"}
                        </span>
                      ) : null}
                    </span>
                  </span>
                );
                return (
                  <li key={item.id}>
                    {item.link ? <Link to={item.link}>{body}</Link> : body}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-[1.25rem] border border-dashed px-4 py-8 text-center">
              <p className="text-sm font-medium">Agenda leve</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Nada nos próximos 7 dias.
              </p>
            </div>
          )}
          {upcoming.length > 5 ? (
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link to="/timeline">Ver timeline completa</Link>
            </Button>
          ) : null}
        </section>

        <section className="space-y-3 lg:col-span-7">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">Módulos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
            {HOME_MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <Link
                  key={mod.href}
                  to={mod.href}
                  className="group flex flex-col gap-2 rounded-xl border bg-card/80 px-3 py-3 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md sm:gap-2.5 sm:rounded-[1.15rem] sm:px-3.5 sm:py-3.5"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl transition-transform group-hover:scale-105 sm:h-10 sm:w-10",
                      mod.tone
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">
                      {mod.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {mod.subtitle}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

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
