import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Flame,
  PiggyBank,
  Plane,
  Plus,
  Share2,
  Target,
  Wallet,
  X,
} from "lucide-react";
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
import { fetchAppAlerts, type AppAlert } from "@/api/alerts";
import {
  fetchHabits,
  fetchAllHabitLogs,
  toggleHabitLog,
} from "@/api/habits";
import {
  fetchLatestTransactionAt,
  fetchMonthlyBudgetSummary,
} from "@/api/finance";
import {
  fetchRecurringTransactions,
  getRecurringDueAlerts,
} from "@/api/recurring";
import type { LifeDashboardSummary, TimelineItem } from "@/types/timeline";
import type { Habit, HabitLog } from "@/types/habits";
import type { MonthlyBudgetSummary } from "@/types/finance";
import type { RecurringDueAlert } from "@/types/recurring";
import { isCompletedToday, getTodayIso } from "@/domain/habits";
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
  daysSinceIsoDate,
  dismissLedgerStaleNudge,
  isLedgerStaleNudgeDismissed,
} from "@/lib/ledgerStickiness";
import { isActivationDone } from "@/lib/onboarding";
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
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function severityClass(severity: AppAlert["severity"]): string {
  if (severity === "danger") return "border-destructive/30 bg-destructive/5";
  if (severity === "warning") return "border-amber-500/30 bg-amber-500/5";
  return "border-border bg-muted/30";
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
  const [togglingHabit, setTogglingHabit] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [budgetRows, setBudgetRows] = useState<MonthlyBudgetSummary[]>([]);
  const [recurringAlerts, setRecurringAlerts] = useState<RecurringDueAlert[]>(
    []
  );
  const [daysWithoutTx, setDaysWithoutTx] = useState<number | null>(null);
  const [showStaleNudge, setShowStaleNudge] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = getTodayIso();
  const activated = Boolean(user?.id && isActivationDone(user.id));

  const reloadHabits = useCallback(async () => {
    const [h, l] = await Promise.all([fetchHabits(), fetchAllHabitLogs()]);
    setHabits(h);
    setHabitLogs(l);
  }, []);

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
        ] = await Promise.all([
          fetchLifeDashboardSummary(),
          fetchTimelineItems(30, 7),
          fetchAppAlerts(),
          Promise.all([fetchHabits(), fetchAllHabitLogs()]),
          fetchMonthlyBudgetSummary(budgetMonthIso()).catch(() => []),
          fetchRecurringTransactions().catch(() => []),
          fetchLatestTransactionAt().catch(() => null),
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
        setUpcoming(upcomingItems);
        setAlerts(appAlerts.slice(0, 6));
        setHabits(h);
        setHabitLogs(l);
        setBudgetRows(budgets);
        setRecurringAlerts(getRecurringDueAlerts(recurring).slice(0, 3));
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
        isCompletedToday(habitLogs.filter((l) => l.habit_id === h.id))
      ).length,
    [habits, habitLogs]
  );

  const nextFocus = useMemo(() => {
    const travel = upcoming.find((i) => i.module === "travel");
    if (travel) return travel;
    const goal = upcoming.find((i) => i.module === "goals");
    if (goal) return goal;
    return upcoming[0] ?? null;
  }, [upcoming]);

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

  async function handleToggleHabit(habitId: string) {
    const logs = habitLogs.filter((l) => l.habit_id === habitId);
    const done = isCompletedToday(logs);
    setTogglingHabit(habitId);
    try {
      await toggleHabitLog(habitId, today, !done);
      await reloadHabits();
      track("hub_habit_toggle", { completed: !done });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setTogglingHabit(null);
    }
  }

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
      description={todayHeading()}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link
              to="/finance/transactions?new=1"
              onClick={() => track("quick_add_open", { source: "home" })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova despesa
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/timeline">
              <CalendarDays className="mr-2 h-4 w-4" />
              Timeline
            </Link>
          </Button>
        </div>
      }
    >
      <FirstTxChecklist />

      {fromCache ? (
        <p className="text-xs text-muted-foreground">
          Dados do último acesso offline neste dispositivo.
        </p>
      ) : null}

      {/* Ledger first — viewport principal */}
      <section className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg border border-primary/20 bg-background p-2">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ledger · {monthLabel(year, month)}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {s.balance != null ? formatBRL(s.balance) : "—"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {receita != null ? `Receitas ${formatBRL(receita)}` : "—"}
                {despesa != null ? ` · Despesas ${formatBRL(despesa)}` : ""}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/finance/dashboard">Abrir finanças</Link>
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            to="/finance/budget"
            className="rounded-lg border bg-background/80 px-3 py-2.5 transition-colors hover:bg-accent/40"
          >
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <PiggyBank className="h-3.5 w-3.5" />
              Orçamento
            </p>
            {budgetHighlight ? (
              <>
                <p className="mt-1 text-sm font-medium tabular-nums">
                  {formatBRL(budgetHighlight.spent)} de{" "}
                  {formatBRL(budgetHighlight.planned)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {budgetHighlight.pct.toFixed(0)}% usado
                  {budgetHighlight.worst
                    ? ` · ${budgetHighlight.worst.type_name || budgetHighlight.worst.class_name || "linha"}`
                    : ""}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Defina o teto do mês
              </p>
            )}
          </Link>

          <Link
            to="/finance/recurring"
            className="rounded-lg border bg-background/80 px-3 py-2.5 transition-colors hover:bg-accent/40"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Parcelas
            </p>
            {recurringAlerts.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {recurringAlerts.map((a) => (
                  <li key={`${a.recurring.id}-${a.installmentNumber}`} className="text-sm">
                    <span
                      className={
                        a.status === "overdue"
                          ? "text-destructive"
                          : "text-foreground"
                      }
                    >
                      {a.message}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Nenhuma parcela urgente
              </p>
            )}
          </Link>
        </div>
      </section>

      {showStaleNudge && daysWithoutTx != null ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">
              Sem lançamentos há {daysWithoutTx} dias
            </p>
            <p className="text-sm text-muted-foreground">
              Um registro rápido mantém o ledger vivo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" asChild>
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

      {showNudge && receita != null && despesa != null ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">
              Como foi {monthLabel(year, month)}?
            </p>
            <p className="text-sm text-muted-foreground">
              Saldo {formatBRL(s.balance ?? 0)} · ritual do mês
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

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Atenção</h2>
            <p className="text-sm text-muted-foreground">
              Alertas financeiros e do dia.
            </p>
          </div>
        </div>

        {alerts.length > 0 ? (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id}>
                <Link
                  to={a.href}
                  className={cn(
                    "block rounded-xl border px-3 py-2.5 transition-colors hover:bg-accent/40",
                    severityClass(a.severity)
                  )}
                >
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {a.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{a.message}</p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">
            Nenhum alerta urgente. Bom sinal.
          </p>
        )}
      </section>

      {/* Vida só após ativação do ledger */}
      {activated ? (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Flame className="h-3.5 w-3.5" />
                Hábitos · {habitsDone}/{habits.length}
              </p>
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link to="/habits">Ver todos</Link>
              </Button>
            </div>
            {habits.length === 0 ? (
              <div className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">
                Nenhum hábito ainda.{" "}
                <Link to="/habits" className="underline underline-offset-2">
                  Criar o primeiro
                </Link>
              </div>
            ) : (
              <ul className="divide-y rounded-xl border">
                {habits.map((habit) => {
                  const done = isCompletedToday(
                    habitLogs.filter((l) => l.habit_id === habit.id)
                  );
                  const busy = togglingHabit === habit.id;
                  return (
                    <li
                      key={habit.id}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleToggleHabit(habit.id)}
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                          done
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "border-muted-foreground/30 text-muted-foreground hover:border-primary/40"
                        )}
                        aria-label={
                          done
                            ? `Desmarcar ${habit.name}`
                            : `Concluir ${habit.name}`
                        }
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-sm",
                          done && "text-muted-foreground line-through"
                        )}
                      >
                        {habit.name}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {nextFocus ? (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {nextFocus.module === "travel" ? (
                    <Plane className="h-3.5 w-3.5" />
                  ) : (
                    <Target className="h-3.5 w-3.5" />
                  )}
                  Próximo marco
                </p>
                <Link
                  to={nextFocus.link ?? "/timeline"}
                  className="block rounded-xl border px-3 py-3 transition-colors hover:bg-accent/40"
                >
                  <p className="text-sm font-medium">{nextFocus.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {nextFocus.subtitle ? `${nextFocus.subtitle} · ` : ""}
                    {nextFocus.date.split("-").reverse().join("/")}
                    {nextFocus.status === "overdue" ? " · atrasado" : ""}
                    {nextFocus.status === "today" ? " · hoje" : ""}
                  </p>
                </Link>
              </div>
            ) : null}
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

          <section className="flex flex-wrap gap-2">
            {[
              { label: "Metas", href: "/goals" },
              { label: "Viagens", href: "/travel" },
              { label: "Cinema", href: "/movies" },
              { label: "Lugares", href: "/places" },
              { label: "Veículos", href: "/car" },
            ].map((link) => (
              <Button key={link.href} variant="outline" size="sm" asChild>
                <Link to={link.href}>{link.label}</Link>
              </Button>
            ))}
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Metas, hábitos, cinema e o resto da vida liberam no menu depois da{" "}
          <strong className="font-medium text-foreground">
            1ª transação
          </strong>{" "}
          e do tour. Foque no ledger agora.
        </section>
      )}

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
