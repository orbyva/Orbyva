import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchLifeDashboardSummary,
  fetchTimelineItems,
  getUpcomingTimeline,
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
import { getErrorMessage } from "@/lib/errors";
import {
  formatMomTrend,
  previousYearMonth,
} from "@/domain/finance/insights";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { FirstTxChecklist } from "@/components/FirstTxChecklist";
import { ShareImageDialog } from "@/components/ShareImageDialog";
import { HubModulesGrid } from "./HubModulesGrid";
import {
  type HubCache,
  budgetMonthIso,
  daysUntilIso,
  firstNameFromUser,
  hubCacheKey,
} from "./hubMeta";
import { HubGreeting } from "./components/HubGreeting";
import { HubLedgerHero } from "./components/HubLedgerHero";
import { HubStaleNudge } from "./components/HubStaleNudge";
import { HubAlerts } from "./components/HubAlerts";
import { HubDaySummary } from "./components/HubDaySummary";
import { HubUpcoming } from "./components/HubUpcoming";

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
        // Fallback para o snapshot mesmo com navigator.onLine true
        // (rede instável / captive portal também derruba o fetch).
        const cached = loadOfflineSnapshot<HubCache>(hubCacheKey(user?.id));
        if (cached) {
          setSummary(cached.data.summary);
          setUpcoming(cached.data.upcoming);
          setAlerts(cached.data.alerts ?? []);
          setFromCache(true);
          if (isNavigatorOffline()) {
            toast({
              title: "Modo offline",
              description: "Exibindo o último hub salvo neste dispositivo.",
              duration: 3000,
            });
          }
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

      <HubGreeting firstName={firstName} />

      <FirstTxChecklist />

      {fromCache ? (
        <p className="relative text-xs text-muted-foreground">
          Dados do último acesso offline neste dispositivo.
        </p>
      ) : null}

      <HubLedgerHero
        year={year}
        month={month}
        balance={s.balance ?? null}
        balancePositive={balancePositive}
        momDespesa={momDespesa}
        receita={receita}
        despesa={despesa}
        budgetHighlight={budgetHighlight}
        recurringAlerts={recurringAlerts}
        showNudge={showNudge}
        onOpenShare={openShare}
        onDismissNudge={dismissNudge}
      />

      {showStaleNudge && daysWithoutTx != null ? (
        <HubStaleNudge
          daysWithoutTx={daysWithoutTx}
          onDismiss={dismissStale}
        />
      ) : null}

      <div className="relative grid gap-4 sm:gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
        <HubAlerts
          priorityAlerts={priorityAlerts}
          urgentAlertExtra={urgentAlertExtra}
        />
        <HubDaySummary
          habitsCount={habits.length}
          habitsDone={habitsDone}
          nextTrip={nextTrip}
          tripCountdown={tripCountdown}
          nextPayment={nextPayment}
          lastMovie={lastMovie}
        />
      </div>

      <div className="relative grid gap-4 sm:gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
        <HubUpcoming upcoming={upcoming} />
        <HubModulesGrid />
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
              budgetPlanned:
                budgetHighlight && budgetHighlight.planned > 0
                  ? budgetHighlight.planned
                  : null,
            })
          }
          share={async (blob) => {
            const result = await shareMonthSpendNative(
              {
                year,
                month,
                receita,
                despesa,
                budgetPlanned:
                  budgetHighlight && budgetHighlight.planned > 0
                    ? budgetHighlight.planned
                    : null,
              },
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
