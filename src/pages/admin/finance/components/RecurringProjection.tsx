import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/MoneyInput";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatBRL } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  buildMonthProjection,
  buildPurchaseSimulation,
  futureMonthsForSimulation,
  indexAvulsoLedgerByYm,
  ledgerTransactionsToLines,
  shiftYearMonth,
  simulationAmountForYm,
  type LedgerMonthAmounts,
  type LedgerProjectionLine,
  type ProjectionLine,
  type YearMonth,
} from "@/domain/recurring/projection";
import type { Recurring } from "@/types/recurring";
import { updateRecurringParcelPayment } from "@/api/recurring";
import { fetchTransactions } from "@/api/finance";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { RecurringProjectionChart } from "./RecurringProjectionChart";

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

function shiftYm(ym: YearMonth, delta: number): YearMonth {
  const idx = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Copy de ação: receber vs pagar, conforme a coluna. */
function projectionActionCopy(nature: ProjectionLine["nature"] | undefined) {
  const isReceive = nature === "receive";
  return {
    action: isReceive ? "Receber" : "Pagar",
    doneBadge: isReceive ? "Recebida" : "Paga",
    markTitle: isReceive
      ? "Marcar como recebida?"
      : "Marcar parcela como paga?",
    unmarkTitle: isReceive
      ? "Desfazer recebimento?"
      : "Desfazer pagamento?",
    markToast: isReceive
      ? "Parcela marcada como recebida"
      : "Parcela marcada como paga",
    unmarkToast: isReceive
      ? "Recebimento desfeito"
      : "Pagamento desfeito",
    markHint: isReceive
      ? "A receita correspondente será registrada automaticamente em Lançamentos."
      : "O lançamento correspondente será registrado automaticamente.",
    unmarkHint:
      "O status da parcela será revertido e o lançamento vinculado será excluído automaticamente.",
  };
}

type RecurringProjectionProps = {
  recurring: Recurring[];
  onChanged: () => Promise<void> | void;
};

export function RecurringProjection({
  recurring,
  onChanged,
}: RecurringProjectionProps) {
  const now = new Date();
  const [ym, setYm] = useState<YearMonth>({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [openOnly, setOpenOnly] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState(true);
  const [pendingLine, setPendingLine] = useState<ProjectionLine | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [simTotal, setSimTotal] = useState<number | "">("");
  const [simCount, setSimCount] = useState(12);
  const [simStart, setSimStart] = useState<YearMonth>({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [ledgerByYm, setLedgerByYm] = useState<
    Record<string, LedgerMonthAmounts>
  >({});
  const [ledgerLines, setLedgerLines] = useState<{
    receiveLines: LedgerProjectionLine[];
    payLines: LedgerProjectionLine[];
  }>({ receiveLines: [], payLines: [] });

  const currentYm: YearMonth = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
  const isCurrentMonth =
    ym.year === currentYm.year && ym.month === currentYm.month;

  const simulation = useMemo(() => {
    if (!simOpen) return null;
    const total = typeof simTotal === "number" ? simTotal : 0;
    return buildPurchaseSimulation({
      total,
      installmentCount: simCount,
      start: simStart,
    });
  }, [simOpen, simTotal, simCount, simStart]);

  const chartFutureMonths = useMemo(
    () => futureMonthsForSimulation(ym, simulation, 9),
    [ym, simulation]
  );

  useEffect(() => {
    if (openOnly) {
      setLedgerByYm({});
      setLedgerLines({ receiveLines: [], payLines: [] });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const from = shiftYearMonth(ym, -2);
        const to = shiftYearMonth(ym, chartFutureMonths);
        const startDate = `${from.year}-${String(from.month).padStart(2, "0")}-01T00:00:00.000Z`;
        const lastDay = new Date(to.year, to.month, 0).getDate();
        const endDate = `${to.year}-${String(to.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;
        const txs = await fetchTransactions(1, 1000, startDate, endDate);
        if (cancelled) return;

        const byYm = indexAvulsoLedgerByYm(txs);
        setLedgerByYm(byYm);

        const monthKey = `${ym.year}-${String(ym.month).padStart(2, "0")}`;
        const monthStart = `${monthKey}-01`;
        const monthEndDay = new Date(ym.year, ym.month, 0).getDate();
        const monthEnd = `${monthKey}-${String(monthEndDay).padStart(2, "0")}`;
        const monthTxs = txs.filter((tx) => {
          const day = String(tx.transaction_at ?? "").slice(0, 10);
          return day >= monthStart && day <= monthEnd;
        });
        setLedgerLines(ledgerTransactionsToLines(monthTxs));
      } catch (error) {
        console.error("Erro ao carregar lançamentos na projeção:", error);
        if (!cancelled) {
          setLedgerByYm({});
          setLedgerLines({ receiveLines: [], payLines: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ym.year, ym.month, openOnly, recurring, chartFutureMonths]);

  const simThisMonth = simulationAmountForYm(simulation, ym.year, ym.month);

  const projection = useMemo(
    () =>
      buildMonthProjection(recurring, ym.year, ym.month, { openOnly }),
    [recurring, ym.year, ym.month, openOnly]
  );

  const avulsoReceive = useMemo(
    () => ledgerLines.receiveLines.reduce((sum, line) => sum + line.value, 0),
    [ledgerLines.receiveLines]
  );
  const avulsoPay = useMemo(
    () => ledgerLines.payLines.reduce((sum, line) => sum + line.value, 0),
    [ledgerLines.payLines]
  );

  // Modo completo: parcelas do mês (incl. pagas) + avulsos listados — mesma conta da lista.
  const receiveTotal = openOnly
    ? projection.receiveTotal
    : projection.receiveTotal + avulsoReceive;
  const payTotal = openOnly
    ? projection.payTotal
    : projection.payTotal + avulsoPay;
  const netTotal = receiveTotal - payTotal;

  const payWithSim = payTotal + simThisMonth;
  const netWithSim = receiveTotal - payWithSim;

  async function applyPayment(line: ProjectionLine) {
    const key = `${line.recurringId}:${line.installmentNumber}`;
    if (busyKey) return;
    setBusyKey(key);
    try {
      const rec = recurring.find((r) => r.id === line.recurringId);
      await updateRecurringParcelPayment(
        line.recurringId,
        line.installmentNumber,
        rec?.paid_parcels || []
      );
      toast({
        title: line.paid
          ? projectionActionCopy(line.nature).unmarkToast
          : projectionActionCopy(line.nature).markToast,
        description: line.paid
          ? "A parcela voltou ao previsto e o lançamento vinculado foi removido."
          : "Registrada em Lançamentos automaticamente.",
      });
      await onChanged();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar a parcela."),
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
      setPendingLine(null);
    }
  }

  const monthTitle = `${MONTH_LABELS[ym.month - 1]} / ${ym.year}`;
  const simStartTitle = `${MONTH_LABELS[simStart.month - 1]} / ${simStart.year}`;
  const paymentAction = pendingLine?.paid ? "unmark" : "mark";
  const pendingCopy = projectionActionCopy(pendingLine?.nature);

  function clearSimulation() {
    setSimOpen(false);
    setSimTotal("");
    setSimCount(12);
    setSimStart({ year: ym.year, month: ym.month });
  }

  function toggleSimulation() {
    setSimOpen((open) => {
      if (!open) {
        setSimStart({ year: ym.year, month: ym.month });
      }
      return !open;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Mês anterior"
            onClick={() => setYm((prev) => shiftYm(prev, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-[10rem] text-center text-sm font-semibold sm:text-base">
            {monthTitle}
          </p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próximo mês"
            onClick={() => setYm((prev) => shiftYm(prev, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentMonth ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setYm(currentYm)}
            >
              Hoje
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={simOpen ? "default" : "outline"}
            size="sm"
            onClick={toggleSimulation}
            aria-pressed={simOpen}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Simular compra
          </Button>
          <Button
            type="button"
            variant={openOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setOpenOnly((v) => !v)}
            aria-pressed={openOnly}
          >
            Só em aberto
          </Button>
        </div>
      </div>

      {simOpen ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-4 pb-2">
            <div>
              <CardTitle className="text-sm font-semibold">
                Simular compra
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Simulador de compra — não grava nada. 1ª parcela em {simStartTitle}.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Fechar simulação"
              onClick={clearSimulation}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-2">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="sim-total">Valor total</Label>
                <MoneyInput
                  id="sim-total"
                  value={simTotal}
                  onChange={setSimTotal}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-count">Parcelas</Label>
                <Input
                  id="sim-count"
                  type="number"
                  min={1}
                  max={120}
                  value={simCount}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setSimCount(
                      Number.isFinite(n) ? Math.min(120, Math.max(1, n)) : 1
                    );
                  }}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label>1ª parcela em</Label>
                <div className="flex h-10 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    aria-label="Mês anterior da 1ª parcela"
                    onClick={() => setSimStart((prev) => shiftYm(prev, -1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <p className="min-w-0 flex-1 truncate text-center text-sm font-medium tabular-nums">
                    {MONTH_LABELS[simStart.month - 1]} / {simStart.year}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    aria-label="Próximo mês da 1ª parcela"
                    onClick={() => setSimStart((prev) => shiftYm(prev, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Quando a primeira parcela cai no calendário
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Parcela estimada</Label>
                <p className="flex h-10 items-center text-sm font-semibold tabular-nums">
                  {simulation
                    ? `${formatBRL(simulation.installmentValue)} × ${simulation.installmentCount}`
                    : "—"}
                </p>
              </div>
            </div>
            {simulation ? (
              simThisMonth > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Impacto em {monthTitle}: +{formatBRL(simThisMonth)} a pagar ·
                  saldo passaria a{" "}
                  <span
                    className={cn(
                      "font-medium",
                      netWithSim >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {formatBRL(netWithSim)}
                  </span>
                  .
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sem parcela da simulação em {monthTitle} — começa em{" "}
                  {simStartTitle}.
                </p>
              )
            ) : (
              <p className="text-xs text-muted-foreground">
                Informe o valor total para ver o efeito nos meses seguintes.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          title={openOnly ? "A receber do mês" : "Receitas do mês"}
          value={receiveTotal}
          tone="success"
          hint={
            openOnly
              ? "Só em aberto"
              : `Parcelas ${formatBRL(projection.receiveTotal)} + avulso ${formatBRL(avulsoReceive)}`
          }
        />
        <SummaryCard
          title={openOnly ? "A pagar do mês" : "Despesas do mês"}
          value={simThisMonth > 0 ? payWithSim : payTotal}
          tone="danger"
          hint={
            simThisMonth > 0
              ? `Base ${formatBRL(payTotal)} + sim ${formatBRL(simThisMonth)}`
              : openOnly
                ? "Só em aberto"
                : `Parcelas ${formatBRL(projection.payTotal)} + avulso ${formatBRL(avulsoPay)}`
          }
        />
        <SummaryCard
          title={openOnly ? "Saldo previsto" : "Saldo do mês"}
          value={simThisMonth > 0 ? netWithSim : netTotal}
          tone={
            (simThisMonth > 0 ? netWithSim : netTotal) >= 0
              ? "success"
              : "danger"
          }
          hint={
            simThisMonth > 0
              ? "Com simulação"
              : openOnly
                ? "Receber − pagar em aberto"
                : "Receitas − despesas (parcelas + lançamentos avulsos)"
          }
        />
      </div>

      <Collapsible open={chartOpen} onOpenChange={setChartOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
          >
            <span>
              {simulation
                ? "Projeção — com simulação de compra"
                : openOnly
                  ? "Projeção — só em aberto (daqui pra frente)"
                  : "Projeção — parcelas do mês (incl. pagas) + lançamentos avulsos"}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                chartOpen && "rotate-180"
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <RecurringProjectionChart
            recurring={recurring}
            anchor={ym}
            openOnly={openOnly}
            simulation={simulation}
            ledgerByYm={ledgerByYm}
          />
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProjectionColumn
          title={openOnly ? "A receber" : "Receitas"}
          tone="success"
          lines={projection.receiveLines}
          ledgerLines={openOnly ? [] : ledgerLines.receiveLines}
          total={receiveTotal}
          openOnly={openOnly}
          busyKey={busyKey}
          onRequestToggle={setPendingLine}
        />
        <ProjectionColumn
          title={openOnly ? "A pagar" : "Despesas"}
          tone="danger"
          lines={projection.payLines}
          ledgerLines={openOnly ? [] : ledgerLines.payLines}
          total={simThisMonth > 0 ? payWithSim : payTotal}
          openOnly={openOnly}
          busyKey={busyKey}
          onRequestToggle={setPendingLine}
          simulationExtra={
            simThisMonth > 0 && simulation
              ? {
                  label: `Simulação (${simulation.installmentCount}x)`,
                  value: simThisMonth,
                }
              : null
          }
        />
      </div>

      <AlertDialog
        open={pendingLine != null}
        onOpenChange={(open) => {
          if (!open) setPendingLine(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            {paymentAction === "mark"
              ? pendingCopy.markTitle
              : pendingCopy.unmarkTitle}
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            {pendingLine ? (
              <>
                <span className="font-medium text-foreground">
                  {pendingLine.description}
                </span>
                {" · "}
                {formatBRL(pendingLine.value)}
                {". "}
              </>
            ) : null}
            {paymentAction === "mark"
              ? pendingCopy.markHint
              : pendingCopy.unmarkHint}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyKey != null}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busyKey != null}
              onClick={(e) => {
                e.preventDefault();
                if (pendingLine) void applyPayment(pendingLine);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone,
  hint,
}: {
  title: string;
  value: number;
  tone: "success" | "danger";
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <CardHeader className="p-0 pb-2">
        <CardTitle
          className={cn(
            "border-b-2 pb-1.5 text-xs font-semibold uppercase tracking-wide",
            tone === "success"
              ? "border-success/50 text-success"
              : "border-destructive/50 text-destructive"
          )}
        >
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <p
          className={cn(
            "text-xl font-bold tabular-nums sm:text-2xl",
            tone === "success" ? "text-success" : "text-destructive"
          )}
        >
          {formatBRL(value)}
        </p>
        {hint ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProjectionColumn({
  title,
  tone,
  lines,
  ledgerLines = [],
  total,
  openOnly,
  busyKey,
  onRequestToggle,
  simulationExtra = null,
}: {
  title: string;
  tone: "success" | "danger";
  lines: ProjectionLine[];
  ledgerLines?: LedgerProjectionLine[];
  total: number;
  openOnly: boolean;
  busyKey: string | null;
  onRequestToggle: (line: ProjectionLine) => void;
  simulationExtra?: { label: string; value: number } | null;
}) {
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const isReceive = tone === "success";
  const copy = projectionActionCopy(isReceive ? "receive" : "pay");
  const ledgerTotal = ledgerLines.reduce((sum, line) => sum + line.value, 0);
  const empty =
    lines.length === 0 && ledgerLines.length === 0 && !simulationExtra;

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/30">
      <div
        className={cn(
          "border-b px-4 py-2.5 text-sm font-semibold",
          tone === "success"
            ? "border-success/30 bg-success/5 text-success"
            : "border-destructive/30 bg-destructive/5 text-destructive"
        )}
      >
        {title}
      </div>
      <div className="divide-y divide-border/50">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Descrição</span>
          <span className="text-right">Valor</span>
          <span className="w-[5.5rem] text-right">Ação</span>
        </div>
        {empty ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {openOnly
              ? isReceive
                ? "Nenhuma receita em aberto neste mês."
                : "Nenhuma conta em aberto neste mês."
              : isReceive
                ? "Nenhuma receita neste mês."
                : "Nenhuma despesa neste mês."}
          </p>
        ) : (
          <>
            {lines.map((line) => {
              const key = `${line.recurringId}:${line.installmentNumber}`;
              return (
                <div
                  key={key}
                  className={cn(
                    "grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2.5 text-sm",
                    line.paid && "opacity-55"
                  )}
                >
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate font-medium",
                        line.paid && "line-through"
                      )}
                    >
                      {line.description}
                    </p>
                    {line.paid ? (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        {copy.doneBadge}
                      </Badge>
                    ) : null}
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    {formatBRL(line.value)}
                  </span>
                  <div className="flex w-[5.5rem] justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={busyKey === key}
                      onClick={() => onRequestToggle(line)}
                    >
                      {line.paid ? "Desfazer" : copy.action}
                    </Button>
                  </div>
                </div>
              );
            })}

            {ledgerLines.length > 0 ? (
              <Collapsible open={ledgerOpen} onOpenChange={setLedgerOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-muted/40"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        ledgerOpen && "rotate-180"
                      )}
                    />
                    <span className="min-w-0 flex-1 font-medium">
                      Lançamentos avulsos deste mês
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        ({ledgerLines.length})
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatBRL(ledgerTotal)}
                    </span>
                    <span className="w-[5.5rem]" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="divide-y divide-border/40 border-t border-border/40 bg-muted/10">
                    {ledgerLines.map((line) => (
                      <div
                        key={`ledger-${line.id}`}
                        className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2 text-sm"
                      >
                        <div className="min-w-0 pl-6">
                          <p className="truncate font-medium">
                            {line.description}
                          </p>
                          <Badge
                            variant="outline"
                            className="mt-1 text-[10px]"
                          >
                            Avulso
                          </Badge>
                        </div>
                        <span className="tabular-nums text-muted-foreground">
                          {formatBRL(line.value)}
                        </span>
                        <span className="w-[5.5rem]" />
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </>
        )}
        {simulationExtra ? (
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 bg-amber-500/5 px-4 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-amber-700 dark:text-amber-400">
                {simulationExtra.label}
              </p>
              <Badge
                variant="outline"
                className="mt-1 border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-400"
              >
                Simulação
              </Badge>
            </div>
            <span className="tabular-nums text-amber-700 dark:text-amber-400">
              {formatBRL(simulationExtra.value)}
            </span>
            <span className="w-[5.5rem]" />
          </div>
        ) : null}
        <div className="space-y-1 bg-muted/30 px-4 py-3">
          <div className="flex items-baseline justify-between gap-2 text-sm font-semibold">
            <span>TOTAL</span>
            <span className="tabular-nums">{formatBRL(total)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {simulationExtra
              ? "Com simulação"
              : openOnly
                ? "Em aberto no mês"
                : "Parcelas do mês + lançamentos avulsos"}
          </p>
        </div>
      </div>
    </div>
  );
}
