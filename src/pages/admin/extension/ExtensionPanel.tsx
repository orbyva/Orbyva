import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  BookOpen,
  Check,
  Clapperboard,
  CreditCard,
  Disc3,
  ExternalLink,
  MapPin,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { loadHomeBundle } from "@/api/hub";
import { toggleHabitLog } from "@/api/habits";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import { evaluatePurchaseAgainstRemaining } from "@/domain/extension/budgetFit";
import {
  cashVsInstallmentHint,
  evaluateInstallmentAgainstRemaining,
  EXT_INSTALLMENT_PRESETS,
  buildInstallmentCalendar,
} from "@/domain/extension/installments";
import { MAX_SPLIT_INSTALLMENTS } from "@/domain/recurring/constants";
import {
  buildMonthProjection,
  calculateInstallments,
  resolvePaymentStartDate,
} from "@/domain/recurring";
import { isAvoidHabit, isCompletedToday } from "@/domain/habits";
import {
  classifyPage,
  enrichFromUrl,
  pageKindLabel,
} from "@/domain/extension/pageContext";
import { useAuth } from "@/hooks/useAuth";
import { useExtensionPageContext } from "@/hooks/useExtensionPageContext";
import { useLocalDay } from "@/hooks/useLocalDay";
import { useToast } from "@/hooks/use-toast";
import { capturePage } from "@/lib/extensionCapture";
import { formatBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import type { Habit, HabitLog } from "@/types/habits";
import type { MonthlyBudgetSummary } from "@/types/finance";
import type { Recurring } from "@/types/recurring";
import type { AppAlert } from "@/api/alerts";

function budgetRemaining(rows: MonthlyBudgetSummary[], balance: number | null): number | null {
  const expense = rows.filter((b) => /despesa/i.test(b.nature_name || ""));
  const parents = expense.filter((b) => b.class_id == null);
  const used = parents.length > 0 ? parents : expense;
  if (used.length === 0) return balance;
  return used.reduce((sum, row) => sum + Number(row.remaining_value || 0), 0);
}

function verdictClass(verdict: "dentro" | "aperto" | "fora") {
  if (verdict === "dentro") return "border-emerald-500/30 bg-emerald-500/10";
  if (verdict === "aperto") return "border-amber-500/30 bg-amber-500/10";
  return "border-rose-500/30 bg-rose-500/10";
}

function clampInstallmentCount(raw: number): number {
  const n = Math.floor(raw);
  if (!Number.isFinite(n)) return 12;
  return Math.min(MAX_SPLIT_INSTALLMENTS, Math.max(2, n));
}

const SHORT_MONTHS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

function shortMonthLabel(year: number, month: number): string {
  return `${SHORT_MONTHS[month - 1]}/${String(year).slice(2)}`;
}

function withRecurringInstallments(list: Recurring[]): Recurring[] {
  return list.map((rec) => ({
    ...rec,
    installments:
      Array.isArray(rec.installments) && rec.installments.length > 0
        ? rec.installments
        : calculateInstallments(
            resolvePaymentStartDate(rec),
            rec.due_day,
            rec.installment_count,
            rec.validity,
            rec.frequency
          ),
  }));
}

function kindIcon(kind: ReturnType<typeof classifyPage>) {
  if (kind === "movie") return Clapperboard;
  if (kind === "book") return BookOpen;
  if (kind === "album") return Disc3;
  if (kind === "place") return MapPin;
  if (kind === "product") return ShoppingBag;
  return Wallet;
}

export default function ExtensionPanel() {
  useDocumentMeta({
    title: "Painel",
    description: "Painel do Orbyva no navegador.",
    path: "/ext",
  });

  const { user, loading: authLoading } = useAuth();
  const { page: rawPage } = useExtensionPageContext();
  const today = useLocalDay();
  const { toast } = useToast();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [loadingHub, setLoadingHub] = useState(true);
  const [saving, setSaving] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(12);

  const page = useMemo(
    () => (rawPage ? enrichFromUrl(rawPage) : null),
    [rawPage]
  );
  const kind = page ? classifyPage(page) : "unknown";
  const canSave =
    kind === "movie" || kind === "book" || kind === "album" || kind === "place";
  const purchasePrice =
    kind === "product" && page?.price != null && page.price > 0
      ? page.price
      : 0;
  const pageOffer =
    page?.installmentCount != null &&
    page.installmentValue != null &&
    page.installmentCount >= 2
      ? { count: page.installmentCount, value: page.installmentValue }
      : null;
  const suggestedCount = pageOffer?.count ?? 12;

  useEffect(() => {
    setInstallmentCount(clampInstallmentCount(suggestedCount));
  }, [page?.url, suggestedCount]);

  const loadHub = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingHub(true);
      const bundle = await loadHomeBundle();
      setHabits(bundle.habits);
      setHabitLogs(bundle.habitLogs);
      setAlerts(
        bundle.alerts
          .filter((a) => a.severity === "danger" || a.severity === "warning")
          .slice(0, 3)
      );
      setRemaining(
        budgetRemaining(bundle.budgetRows, bundle.summary.balance ?? null)
      );
      setRecurring(withRecurringInstallments(bundle.alertDomains.recurring));
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao carregar o painel."),
        variant: "destructive",
      });
    } finally {
      setLoadingHub(false);
    }
  }, [toast, user]);

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  const fit = useMemo(() => {
    if (remaining == null) return null;
    return evaluatePurchaseAgainstRemaining(remaining, purchasePrice);
  }, [purchasePrice, remaining]);

  const installmentFit = useMemo(() => {
    if (remaining == null || purchasePrice <= 0) return null;
    return evaluateInstallmentAgainstRemaining(
      remaining,
      purchasePrice,
      installmentCount,
      pageOffer
    );
  }, [installmentCount, pageOffer, purchasePrice, remaining]);

  const startYm = useMemo(() => {
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    return { year, month };
  }, [today]);

  const installmentCalendar = useMemo(() => {
    if (purchasePrice <= 0) return null;
    return buildInstallmentCalendar(
      startYm,
      purchasePrice,
      installmentCount,
      pageOffer
    );
  }, [installmentCount, pageOffer, purchasePrice, startYm]);

  const calendarRows = useMemo(() => {
    if (!installmentCalendar) return [];
    return installmentCalendar.map((row) => {
      const committedPay =
        recurring.length > 0
          ? buildMonthProjection(recurring, row.year, row.month, {
              openOnly: true,
            }).payTotal
          : 0;
      const isCurrent =
        row.year === startYm.year && row.month === startYm.month;
      return { ...row, committedPay, isCurrent };
    });
  }, [installmentCalendar, recurring, startYm]);

  const installmentPresets = useMemo(() => {
    const extra = pageOffer?.count;
    const set = new Set<number>(EXT_INSTALLMENT_PRESETS);
    if (extra != null && extra >= 2 && extra <= MAX_SPLIT_INSTALLMENTS) {
      set.add(extra);
    }
    return [...set].sort((a, b) => a - b);
  }, [pageOffer?.count]);

  const pendingHabits = useMemo(
    () =>
      habits.filter(
        (h) =>
          !isCompletedToday(
            habitLogs.filter((l) => l.habit_id === h.id),
            today
          )
      ),
    [habits, habitLogs, today]
  );

  async function handleToggleHabit(habitId: string) {
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

  async function handleSave() {
    if (!page || !canSave) return;
    setSaving(true);
    try {
      const result = await capturePage(page);
      toast({
        title: "Salvo",
        description: `Foi para ${result.label}.`,
      });
    } catch (error) {
      toast({
        title: "Não salvou",
        description: getErrorMessage(error, "Falha ao salvar no Orbyva."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <BrandLogo variant="mark" className="size-12 rounded-xl bg-white" />
        <div>
          <p className="font-display text-lg font-semibold">Orbyva</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Entre para ver o painel e salvar o que está nesta aba.
          </p>
        </div>
        <Button asChild>
          <a href="/login?next=/ext" target="_blank" rel="noreferrer">
            Entrar
          </a>
        </Button>
        <Toaster />
      </div>
    );
  }

  const KindIcon = kindIcon(kind);

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/90 px-3 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <BrandLogo variant="mark" className="size-7 rounded-md bg-white" />
          <span className="text-sm font-semibold">Orbyva</span>
        </div>
        <a
          href="/home"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Abrir app
          <ExternalLink className="size-3" />
        </a>
      </header>

      <main className="space-y-3 px-3 py-3">
        <section className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KindIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {page ? pageKindLabel(kind) : "Esta aba"}
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold">
                {page?.title || "Navegue em um site para capturar"}
              </p>
              {page?.price != null && page.price > 0 ? (
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {formatBRL(page.price)}
                  {pageOffer ? (
                    <>
                      {" "}
                      · {pageOffer.count}x de {formatBRL(pageOffer.value)}
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
          {canSave ? (
            <Button
              className="mt-3 w-full"
              size="sm"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Salvando…" : `Salvar em ${pageKindLabel(kind)}`}
            </Button>
          ) : kind === "product" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Lista de compras ainda não está no app. Abaixo: à vista e
              simulação de parcelamento.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Abra IMDb, Letterboxd, Goodreads, Spotify, Maps ou um produto para
              agir daqui.
            </p>
          )}
        </section>

        <section
          className={cn(
            "rounded-xl border p-3 shadow-sm",
            fit ? verdictClass(fit.verdict) : "bg-card"
          )}
        >
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-primary" />
            <p className="text-sm font-semibold">Está dentro do orçamento?</p>
          </div>
          {purchasePrice > 0 ? (
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              À vista
            </p>
          ) : null}
          {loadingHub && remaining == null ? (
            <p className="mt-2 text-xs text-muted-foreground">Carregando…</p>
          ) : fit ? (
            <>
              <p className="mt-1.5 text-sm font-medium leading-snug">
                {fit.headline}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {fit.detail}
              </p>
              <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
                Restante do mês: {formatBRL(fit.remaining)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Sem orçamento ou saldo deste mês ainda. Defina o teto em Finanças.
            </p>
          )}
          <a
            href="/finance/budget"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
          >
            Ver orçamento
          </a>
        </section>

        {purchasePrice > 0 ? (
          <section
            className={cn(
              "rounded-xl border p-3 shadow-sm",
              installmentFit
                ? verdictClass(installmentFit.fit.verdict)
                : "bg-card"
            )}
          >
            <div className="flex items-center gap-2">
              <CreditCard className="size-4 text-primary" />
              <p className="text-sm font-semibold">E se parcelar?</p>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Só simula. 1ª parcela neste mês e o que cai nos seguintes.
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {installmentPresets.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setInstallmentCount(n)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
                    installmentCount === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {n}x
                  {pageOffer?.count === n ? " · página" : ""}
                </button>
              ))}
              <label className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                Nx
                <input
                  type="number"
                  min={2}
                  max={MAX_SPLIT_INSTALLMENTS}
                  value={installmentCount}
                  aria-label="Número de parcelas"
                  onChange={(e) =>
                    setInstallmentCount(
                      clampInstallmentCount(Number(e.target.value))
                    )
                  }
                  className="h-6 w-12 rounded-md border bg-background px-1 text-xs tabular-nums text-foreground"
                />
              </label>
            </div>
            {installmentFit ? (
              <>
                <p className="mt-2 text-sm font-medium tabular-nums leading-snug">
                  {installmentFit.count}x de{" "}
                  {formatBRL(installmentFit.installmentValue)}
                </p>
                <p className="mt-1 text-sm font-medium leading-snug">
                  {installmentFit.fit.headline}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {installmentFit.fit.detail}
                </p>
                {fit ? (
                  <p className="mt-2 text-xs leading-relaxed">
                    {cashVsInstallmentHint(fit, installmentFit)}
                  </p>
                ) : null}
                {installmentFit.fromPage ? (
                  <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                    Total parcelado:{" "}
                    {formatBRL(
                      installmentFit.count * installmentFit.installmentValue
                    )}
                    {purchasePrice > 0
                      ? ` · à vista ${formatBRL(purchasePrice)}`
                      : null}
                  </p>
                ) : null}
                {calendarRows.length > 0 ? (
                  <div className="mt-2.5 border-t border-border/60 pt-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Próximos meses
                    </p>
                    <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto pr-0.5">
                      {calendarRows.map((row) => (
                        <li
                          key={`${row.year}-${row.month}-${row.number}`}
                          className={cn(
                            "rounded-md px-1 py-0.5",
                            row.isCurrent && "bg-background/70"
                          )}
                        >
                          <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
                            <span className="min-w-0 truncate text-muted-foreground">
                              {shortMonthLabel(row.year, row.month)}
                              <span className="text-foreground/80">
                                {" "}
                                · {row.number}/{installmentFit.count}
                              </span>
                              {row.isCurrent ? " · agora" : ""}
                            </span>
                            <span className="shrink-0 font-medium text-foreground">
                              {formatBRL(row.value)}
                            </span>
                          </div>
                          {row.isCurrent && installmentFit.fit.after >= 0 ? (
                            <p className="text-[10px] leading-snug text-muted-foreground">
                              Depois da parcela restam{" "}
                              {formatBRL(installmentFit.fit.after)}
                            </p>
                          ) : null}
                          {row.committedPay > 0 ? (
                            <p className="text-[10px] leading-snug tabular-nums text-muted-foreground">
                              Contas {formatBRL(row.committedPay)} + esta ={" "}
                              {formatBRL(row.committedPay + row.value)}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {calendarRows.length > 1 ? (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Até{" "}
                        {shortMonthLabel(
                          calendarRows[calendarRows.length - 1]!.year,
                          calendarRows[calendarRows.length - 1]!.month
                        )}
                        .{" "}
                        <a
                          href="/finance/recurring"
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          Ver projeção
                        </a>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Escolha um número de parcelas para ver o impacto neste mês.
              </p>
            )}
          </section>
        ) : null}

        <section className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-sm font-semibold">Hábitos de hoje</p>
          {loadingHub && habits.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Carregando…</p>
          ) : habits.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Nenhum hábito ainda.{" "}
              <a href="/habits" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                Criar
              </a>
            </p>
          ) : pendingHabits.length === 0 ? (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
              Tudo marcado hoje.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {pendingHabits.slice(0, 8).map((habit) => {
                const avoid = isAvoidHabit(habit);
                return (
                  <li key={habit.id}>
                    <button
                      type="button"
                      onClick={() => void handleToggleHabit(habit.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm hover:bg-muted/70"
                    >
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-md border",
                          avoid
                            ? "border-rose-300 text-rose-600"
                            : "border-emerald-300 text-emerald-600"
                        )}
                      >
                        {avoid ? (
                          <Ban className="size-3.5" />
                        ) : (
                          <Check className="size-3.5 text-transparent" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{habit.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {alerts.length > 0 ? (
          <section className="rounded-xl border bg-card p-3 shadow-sm">
            <p className="text-sm font-semibold">Alertas</p>
            <ul className="mt-2 space-y-2">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <a
                    href={alert.href}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg hover:bg-muted/60"
                  >
                    <p className="text-xs font-medium">{alert.title}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {alert.message}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <Toaster />
    </div>
  );
}
