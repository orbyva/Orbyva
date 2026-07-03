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
      color: "text-green-500",
      borderColor: "border-green-500",
    },
    {
      title: "Total a Pagar",
      value: totalFixesPay,
      color: "text-red-500",
      borderColor: "border-red-500",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
      {data.map((card) => (
        <Card
          key={card.title}
          className="rounded-lg border bg-card p-5 text-white shadow-md"
        >
          <CardHeader className="p-0 pb-3">
            <CardTitle
              className={`text-base font-semibold ${card.color} border-b-2 pb-1 ${card.borderColor}`}
            >
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className={`text-2xl font-bold tracking-tight ${card.color}`}>
              {formatBRL(card.value)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
