"use client";

import { memo, useMemo, useState } from "react";
import { Pie, PieChart, Sector } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useIsMobile } from "@/hooks/use-mobile";
import { chartColors } from "@/lib/design-tokens";

export interface DonutChartData {
  type: string;
  total_value: number;
  fill: string | null;
}

interface DonutChartProps {
  title?: string;
  description?: string;
  data: DonutChartData[];
  onSliceClick?: (type: string) => void;
}

interface ActiveShapeProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  fill: string;
  payload: DonutChartData;
  percent: number;
  value: number;
}

const renderActiveShape = (isMobile: boolean) => (props: unknown) => {
  const RADIAN = Math.PI / 180;
  const {
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
    value,
  } = props as ActiveShapeProps;

  if (isMobile) {
    return (
      <g>
        <text
          x={cx}
          y={cy}
          dy={4}
          textAnchor="middle"
          fill={fill}
          className="text-xs font-semibold"
        >
          {payload.type}
        </text>

        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
      </g>
    );
  }

  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor: "start" | "end" = cos >= 0 ? "start" : "end";

  return (
    <g>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill={fill}>
        {payload.type}
      </text>

      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />

      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 10}
        fill={fill}
      />

      <path
        d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
        stroke={fill}
        fill="none"
      />

      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />

      <text
        x={ex + (cos >= 0 ? 1 : -1) * 12}
        y={ey}
        textAnchor={textAnchor}
        fill="white"
      >
        {value.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}
      </text>

      <text
        x={ex + (cos >= 0 ? 1 : -1) * 12}
        y={ey}
        dy={18}
        textAnchor={textAnchor}
        fill="#999"
      >
        {`(${(percent * 100).toFixed(2)}%)`}
      </text>
    </g>
  );
};

export function DonutChart({
  title = "Percentual por Tipo",
  description = "Análise percentual por tipo de transação",
  data,
  onSliceClick,
}: DonutChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const isMobile = useIsMobile();

  const chartSize = useMemo(
    () =>
      isMobile
        ? { height: 190, innerRadius: 45, outerRadius: 72 }
        : { height: 400, innerRadius: 80, outerRadius: 110 },
    [isMobile]
  );

  const activeShape = useMemo(
    () => renderActiveShape(isMobile),
    [isMobile]
  );

  const onPieEnter = (_: unknown, index: number) => {
    setActiveIndex(index);
  };

  const chartConfig: ChartConfig = useMemo(
    () =>
      data.reduce(
        (config, item) => ({
          ...config,
          [item.type]: {
            label: item.type,
            color: item.fill || chartColors.fallback,
          },
        }),
        {} as ChartConfig
      ),
    [data]
  );

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <Card className="flex flex-col w-full min-w-0 overflow-hidden">
      <CardHeader className="items-center pb-2 px-3 sm:px-6">
        <CardTitle className="text-base sm:text-lg text-center">
          {title}
        </CardTitle>
        <CardDescription className="text-center text-xs sm:text-sm">
          {description}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 p-0 sm:p-2 overflow-hidden">
        <ChartContainer
          config={chartConfig}
          className="w-full min-w-0"
          style={{ height: chartSize.height }}
        >
          <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />

            <Pie
              activeIndex={activeIndex}
              activeShape={activeShape}
              data={data}
              dataKey="total_value"
              nameKey="type"
              cx="50%"
              cy="50%"
              innerRadius={chartSize.innerRadius}
              outerRadius={chartSize.outerRadius}
              paddingAngle={2}
              onMouseEnter={onPieEnter}
              onClick={(_, index) => {
                const item = data[index];
                onSliceClick?.(item.type);
              }}
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export const MemoDonutChart = memo(DonutChart); 