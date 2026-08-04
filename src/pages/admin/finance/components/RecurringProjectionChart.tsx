import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart";
import { chartColors } from "@/lib/design-tokens";
import { formatBRL } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  buildBalanceSeriesWindow,
  compareYearMonth,
  formatYm,
  futureMonthsForSimulation,
  type LedgerMonthAmounts,
  type PurchaseSimulation,
  type YearMonth,
} from "@/domain/recurring/projection";
import type { Recurring } from "@/types/recurring";

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

const SIM_COLOR = "hsl(32 95% 44%)";

type RecurringProjectionChartProps = {
  recurring: Recurring[];
  /** Mês em foco na planilha — a janela do gráfico gira em torno dele. */
  anchor: YearMonth;
  pastMonths?: number;
  futureMonths?: number;
  openOnly?: boolean;
  simulation?: PurchaseSimulation | null;
  /** Totais de lançamentos por `yyyy-mm` (ignorado em “Só em aberto”). */
  ledgerByYm?: Record<string, LedgerMonthAmounts>;
};

export function RecurringProjectionChart({
  recurring,
  anchor,
  pastMonths = 2,
  futureMonths = 9,
  openOnly = false,
  simulation = null,
  ledgerByYm = {},
}: RecurringProjectionChartProps) {
  const todayYear = new Date().getFullYear();
  const todayMonth = new Date().getMonth() + 1;
  const anchorYm = formatYm(anchor.year, anchor.month);

  const data = useMemo(() => {
    const today: YearMonth = { year: todayYear, month: todayMonth };
    const past = openOnly ? 0 : pastMonths;
    const future = futureMonthsForSimulation(
      anchor,
      simulation,
      futureMonths
    );
    return buildBalanceSeriesWindow(recurring, anchor, ledgerByYm, {
      past,
      future,
      openOnly,
    }).map((p) => {
      const point: YearMonth = { year: p.year, month: p.month };
      const vsToday = compareYearMonth(point, today);
      const simular = simulation?.byYm[p.ym] ?? 0;
      const saldo = p.net - simular;
      return {
        label: `${SHORT_MONTHS[p.month - 1]}/${String(p.year).slice(2)}`,
        ym: p.ym,
        receber: p.receiveTotal,
        pagar: p.payTotal,
        simular,
        pagarComSim: p.payTotal + simular,
        saldo,
        isSelected: p.ym === anchorYm,
        isFuture: vsToday > 0,
        isPast: vsToday < 0,
      };
    });
  }, [
    recurring,
    anchor,
    pastMonths,
    futureMonths,
    openOnly,
    simulation,
    ledgerByYm,
    todayYear,
    todayMonth,
    anchorYm,
  ]);

  const chartConfig = {
    receber: {
      label: openOnly ? "A receber" : "Receitas",
      color: chartColors.income,
    },
    pagar: {
      label: openOnly ? "A pagar" : "Despesas",
      color: chartColors.expense,
    },
    ...(simulation
      ? { simular: { label: "Simulação", color: SIM_COLOR } }
      : {}),
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Projeção mensal</CardTitle>
        <CardDescription>
          {simulation
            ? `Com simulação de compra (${simulation.installmentCount}x) sobreposta nas despesas.`
            : openOnly
              ? `Só em aberto — mês em foco e próximos meses.`
              : `Parcelas do mês (incluindo pagas) + lançamentos avulsos — saldo para decidir novos compromissos.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="h-[240px] w-full md:h-[300px]"
        >
          <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={11}
              tick={({ x, y, payload }) => {
                const point = data.find((d) => d.label === payload.value);
                const selected = point?.isSelected;
                return (
                  <text
                    x={x}
                    y={y + 10}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={selected ? 700 : 400}
                    fill="hsl(var(--muted-foreground))"
                    opacity={point?.isPast ? 0.65 : 1}
                  >
                    {payload.value}
                  </text>
                );
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              fontSize={11}
              tickFormatter={(v) =>
                Number(v).toLocaleString("pt-BR", {
                  notation: "compact",
                  maximumFractionDigits: 1,
                })
              }
            />
            <ChartTooltip
              cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.35 }}
              content={<ProjectionChartTooltip openOnly={openOnly} />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="receber" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {data.map((entry) => (
                <Cell
                  key={`receber-${entry.ym}`}
                  fill="var(--color-receber)"
                  fillOpacity={entry.isPast ? 0.45 : entry.isSelected ? 1 : 0.85}
                />
              ))}
            </Bar>
            <Bar
              dataKey="pagar"
              stackId={simulation ? "pay" : undefined}
              radius={simulation ? [0, 0, 0, 0] : [4, 4, 0, 0]}
              maxBarSize={28}
            >
              {data.map((entry) => (
                <Cell
                  key={`pagar-${entry.ym}`}
                  fill="var(--color-pagar)"
                  fillOpacity={entry.isPast ? 0.45 : entry.isSelected ? 1 : 0.85}
                />
              ))}
            </Bar>
            {simulation ? (
              <Bar
                dataKey="simular"
                stackId="pay"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                fill="var(--color-simular)"
              />
            ) : null}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

type TooltipPoint = {
  label: string;
  receber: number;
  pagar: number;
  simular: number;
  saldo: number;
  isSelected: boolean;
  isFuture: boolean;
  isPast: boolean;
};

function ProjectionChartTooltip({
  active,
  payload,
  openOnly,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TooltipPoint }>;
  openOnly: boolean;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const receiveLabel = openOnly ? "A receber" : "Receitas";
  const payLabel = openOnly ? "A pagar" : "Despesas";
  const context = point.isSelected
    ? "mês em foco"
    : point.isFuture
      ? "futuro"
      : "passado";

  return (
    <div className="grid min-w-[10.5rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-xl">
      <p className="font-medium">
        {point.label} · {context}
      </p>
      <TooltipRow
        label={receiveLabel}
        value={point.receber}
        swatch="var(--color-receber)"
      />
      <TooltipRow
        label={payLabel}
        value={point.pagar}
        swatch="var(--color-pagar)"
      />
      {point.simular > 0 ? (
        <TooltipRow
          label="Simulação"
          value={point.simular}
          swatch="var(--color-simular)"
        />
      ) : null}
      <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-border/60 pt-1.5">
        <span className="text-muted-foreground">Saldo</span>
        <span
          className={cn(
            "font-mono font-semibold tabular-nums",
            point.saldo >= 0 ? "text-success" : "text-destructive"
          )}
        >
          {formatBRL(point.saldo)}
        </span>
      </div>
    </div>
  );
}

function TooltipRow({
  label,
  value,
  swatch,
}: {
  label: string;
  value: number;
  swatch: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span
          className="h-2 w-2 shrink-0 rounded-[2px]"
          style={{ background: swatch }}
        />
        {label}
      </span>
      <span className="font-mono font-medium tabular-nums text-foreground">
        {formatBRL(value)}
      </span>
    </div>
  );
}
