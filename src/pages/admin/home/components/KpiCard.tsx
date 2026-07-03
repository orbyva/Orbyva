import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiCardProps = {
  title: string;
  value: number;
  color: string;
  description: string | null;
  isLoading: boolean;
  trendText: string | null;
  formatValue: (value: number) => string;
};

export function KpiCard({
  title,
  value,
  color,
  description,
  isLoading,
  trendText,
  formatValue,
}: KpiCardProps) {
  return (
    <Card className="rounded-lg border bg-card p-5 shadow-sm">
      <CardHeader className="p-0 pb-3">
        <CardTitle
          className={cn(
            "text-base font-semibold border-b-2 pb-1",
            color
          )}
        >
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <div className={cn("text-2xl font-bold tracking-tight tabular-nums", color)}>
            {formatValue(value)}
          </div>
        )}
      </CardContent>
      {(description || trendText) && (
        <CardFooter className="mt-3 flex-col items-start gap-1 p-0 text-sm">
          {trendText && (
            <div className="flex items-center gap-2 font-medium leading-none">
              {trendText} <TrendingUp className="h-4 w-4" />
            </div>
          )}
          {description && (
            <div className="leading-none text-muted-foreground">
              {description}
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

interface KpiCardsGridProps {
  data: KpiCardProps[];
}

export const KpiCardsGrid: React.FC<KpiCardsGridProps> = ({ data }) => {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
      {data.map((card, index) => (
        <KpiCard key={index} {...card} />
      ))}
    </div>
  );
};
