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
  ChartTooltipContent,
} from "@/components/ui/chart";
import { chartColors } from "@/lib/design-tokens";
import {
  buildProjectionSeriesWindow,
  compareYearMonth,
  formatYm,
  futureMonthsForSimulation,
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
};

export function RecurringProjectionChart({
  recurring,
  anchor,
  pastMonths = 2,
  futureMonths = 9,
  openOnly = false,
  simulation = null,
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
    return buildProjectionSeriesWindow(recurring, anchor, {
      past,
      future,
      openOnly,
    }).map((p) => {
      const point: YearMonth = { year: p.year, month: p.month };
      const vsToday = compareYearMonth(point, today);
      const simular = simulation?.byYm[p.ym] ?? 0;
      return {
        label: `${SHORT_MONTHS[p.month - 1]}/${String(p.year).slice(2)}`,
        ym: p.ym,
        receber: p.receiveTotal,
        pagar: p.payTotal,
        simular,
        pagarComSim: p.payTotal + simular,
        saldo: p.net - simular,
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
    todayYear,
    todayMonth,
    anchorYm,
  ]);

  const chartConfig = {
    receber: { label: "A receber", color: chartColors.income },
    pagar: { label: "A pagar", color: chartColors.expense },
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
            ? `Com simulação de compra (${simulation.installmentCount}x) sobreposta em a pagar.`
            : openOnly
              ? `Só em aberto — mês em foco e próximos meses.`
              : `Passado recente e próximos meses a partir do mês em foco — para ver se cabe um novo compromisso.`}
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
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => {
                    const point = data.find((d) => d.label === label);
                    if (!point) return String(label);
                    if (point.isSelected) return `${label} · mês em foco`;
                    if (point.isFuture) return `${label} · futuro`;
                    return `${label} · passado`;
                  }}
                />
              }
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
