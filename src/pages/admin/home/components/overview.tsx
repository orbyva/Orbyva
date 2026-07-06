"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const monthLabels = [
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
];

interface ChartData {
  month: number;
  year: number;
  receita_total: number;
  despesa_total: number;
}

interface ChartProps {
  datasets: ChartData[];
  title?: string;
  description?: string;
}

export function Overview({
  datasets,
  title = "Receita e Despesa ao longo do tempo",
  description = "Comparação geral de gastos ao longo do tempo.",
}: ChartProps) {

  const transformedData = datasets.map((item) => ({
    monthYearLabel: `${monthLabels[item.month - 1]} ${item.year}`,
    month: item.month,
    year: item.year,
    Receita: item.receita_total || 0,
    Despesa: item.despesa_total || 0,
  }));

  const chartConfig = {
    Receita: { label: "Receita Total", color: "#4CAF50" },
    Despesa: { label: "Despesa Total", color: "#F44336" },
  };

  return (
    <Card className="sm:col-span-1 lg:col-span-3">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <ChartContainer config={chartConfig} className="h-[280px] w-full md:h-[400px]">
          
            <LineChart
              data={transformedData}
              margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
            >
              <XAxis dataKey="monthYearLabel" />

              <YAxis />

              <Line
                type="monotone"
                dataKey="Receita"
                stroke={chartConfig.Receita.color}
                strokeWidth={2}
                activeDot={{ r: 6, fill: chartConfig.Receita.color }}
              />

              <Line
                type="monotone"
                dataKey="Despesa"
                stroke={chartConfig.Despesa.color}
                strokeWidth={2}
                activeDot={{ r: 6, fill: chartConfig.Despesa.color }}
              />

              <ChartTooltip content={<ChartTooltipContent />} />
            </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
