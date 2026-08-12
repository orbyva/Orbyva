import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/currency";

interface RecurringSummaryProps {
  totalFixesReceivable: number;
  totalFixesPay: number;
  /** Ex.: "Julho / 2026", totais do mês em foco. */
  periodLabel?: string;
}

export function RecurringSummary({
  totalFixesReceivable,
  totalFixesPay,
  periodLabel,
}: RecurringSummaryProps) {
  const suffix = periodLabel ? ` · ${periodLabel}` : "";
  const data = [
    {
      title: `A receber no mês${suffix}`,
      value: totalFixesReceivable,
      titleClass: "text-success border-success/50",
      valueClass: "text-success",
    },
    {
      title: `A pagar no mês${suffix}`,
      value: totalFixesPay,
      titleClass: "text-destructive border-destructive/50",
      valueClass: "text-destructive",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.map((card) => (
        <Card key={card.title} className="p-4 sm:p-5">
          <CardHeader className="p-0 pb-2 sm:pb-3">
            <CardTitle
              className={`text-xs font-semibold uppercase tracking-wide border-b-2 pb-1.5 sm:text-sm ${card.titleClass}`}
            >
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div
              className={`text-xl font-bold tracking-tight tabular-nums sm:text-2xl ${card.valueClass}`}
            >
              {formatBRL(card.value)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
