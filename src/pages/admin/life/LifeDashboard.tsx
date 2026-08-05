import { useCallback, useEffect, useMemo, useState } from "react";
import { loadHomeBundle, enrichHomeAlertsWithSeries } from "@/api/hub";
import type { AppAlert } from "@/api/alerts";
import { toggleHabitLog } from "@/api/habits";
import type { LifeDashboardSummary, TimelineItem } from "@/types/timeline";
import type { Habit, HabitLog } from "@/types/habits";
import type { MonthlyBudgetSummary } from "@/types/finance";
import type { RecurringDueAlert } from "@/types/recurring";
import type { Movie } from "@/types/movies";
import { isCompletedToday } from "@/domain/habits";
import { getErrorMessage } from "@/lib/errors";
import { useLocalDay } from "@/hooks/useLocalDay";
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
  const today = useLocalDay();
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
        const bundle = await loadHomeBundle();
        setSummary(bundle.summary);
        setUpcoming(bundle.upcoming);
        setAlerts(bundle.alerts.slice(0, 6));
        setHabits(bundle.habits);
        setHabitLogs(bundle.habitLogs);
        setBudgetRows(bundle.budgetRows);
        setRecurringAlerts(bundle.recurringAlerts);
        setLastMovie(bundle.lastMovie);
        const days = daysSinceIsoDate(bundle.latestTransactionAt);
        setDaysWithoutTx(days);
        if (days != null && days >= 3) {
          track("day_without_tx", { days });
        }
        const prevYm = previousYearMonth(bundle.year, bundle.month);
        setMomDespesa(
          formatMomTrend(
            bundle.summary.expenseTotal ?? 0,
            bundle.prevMonthTotals?.despesa_total,
            prevYm.month
          )
        );
        setFromCache(false);
        saveOfflineSnapshot<HubCache>(hubCacheKey(user?.id), {
          summary: bundle.summary,
          upcoming: bundle.upcoming,
          alerts: bundle.alerts.slice(0, 6),
        });

        // TMDB / séries depois do first paint — não bloqueia o hub.
        const domains = bundle.alertDomains;
        void enrichHomeAlertsWithSeries(domains).then((merged) => {
          setAlerts(merged.slice(0, 6));
          saveOfflineSnapshot<HubCache>(hubCacheKey(user?.id), {
            summary: bundle.summary,
            upcoming: bundle.upcoming,
            alerts: merged.slice(0, 6),
          });
        });
      } catch (error) {
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
  }, [toast, user?.id]);

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
        isCompletedToday(
          habitLogs.filter((l) => l.habit_id === h.id),
          today
        )
      ).length,
    [habits, habitLogs, today]
  );

  async function handleHubToggleHabit(habitId: string) {
    const done = isCompletedToday(
      habitLogs.filter((l) => l.habit_id === habitId),
      today
    );
    const next = !done;
    const prev = habitLogs;
    setHabitLogs((current) => {
      const idx = current.findIndex(
        (l) => l.habit_id === habitId && l.date === today
      );
      if (idx >= 0) {
        const copy = [...current];
        copy[idx] = { ...copy[idx]!, completed: next };
        return copy;
      }
      return [
        ...current,
        {
          id: `optimistic-${habitId}-${today}`,
          habit_id: habitId,
          date: today,
          completed: next,
        },
      ];
    });
    try {
      await toggleHabitLog(habitId, today, next);
    } catch (error) {
      setHabitLogs(prev);
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar."),
        variant: "destructive",
      });
    }
  }

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

  if (loading && !summary) {
    return (
      <PageShell hideHeader className="space-y-4 pb-20 md:pb-6">
        <HubGreeting firstName={firstNameFromUser(user)} />
        <div className="h-52 animate-pulse rounded-3xl bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-24 animate-pulse rounded-xl bg-muted/60" />
          <div className="h-24 animate-pulse rounded-xl bg-muted/60" />
        </div>
        <TableLoadingSkeleton rows={5} />
      </PageShell>
    );
  }

  const s = summary!;
  const firstName = firstNameFromUser(user);
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
          habits={habits}
          habitLogs={habitLogs}
          habitsCount={habits.length}
          habitsDone={habitsDone}
          today={today}
          onToggleHabit={(id) => void handleHubToggleHabit(id)}
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
