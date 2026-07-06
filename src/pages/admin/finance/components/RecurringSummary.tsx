import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/currency";

interface RecurringSummaryProps {
  totalFixesReceivable: number;
  totalFixesPay: number;
}

export function RecurringSummary({
  totalFixesReceivable,
  totalFixesPay,
}: RecurringSummaryProps) {
  const data = [
    {
      title: "Total a Receber",
      value: totalFixesReceivable,
      titleClass: "text-success border-success/50",
      valueClass: "text-success",
    },
    {
      title: "Total a Pagar",
      value: totalFixesPay,
      titleClass: "text-destructive border-destructive/50",
      valueClass: "text-destructive",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.map((card) => (
        <Card key={card.title} className="p-5">
          <CardHeader className="p-0 pb-3">
            <CardTitle
              className={`text-sm font-semibold uppercase tracking-wide border-b-2 pb-1.5 ${card.titleClass}`}
            >
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div
              className={`text-2xl font-bold tracking-tight tabular-nums ${card.valueClass}`}
            >
              {formatBRL(card.value)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
