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

export type KpiVariant = "income" | "expense" | "primary" | "muted";

const variantStyles: Record<KpiVariant, { title: string; value: string }> = {
  income: {
    title: "text-success border-success/50",
    value: "text-success",
  },
  expense: {
    title: "text-destructive border-destructive/50",
    value: "text-destructive",
  },
  primary: {
    title: "text-primary border-primary/50",
    value: "text-primary",
  },
  muted: {
    title: "text-muted-foreground border-border",
    value: "text-foreground",
  },
};

export type KpiCardProps = {
  title: string;
  value: number;
  variant?: KpiVariant;
  description: string | null;
  isLoading: boolean;
  trendText: string | null;
  formatValue: (value: number) => string;
};

export function KpiCard({
  title,
  value,
  variant = "muted",
  description,
  isLoading,
  trendText,
  formatValue,
}: KpiCardProps) {
  const styles = variantStyles[variant];

  return (
    <Card className="p-5">
      <CardHeader className="p-0 pb-3">
        <CardTitle
          className={cn(
            "text-sm font-semibold uppercase tracking-wide border-b-2 pb-1.5",
            styles.title
          )}
        >
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <div
            className={cn(
              "text-2xl font-bold tracking-tight tabular-nums",
              styles.value
            )}
          >
            {formatValue(value)}
          </div>
        )}
      </CardContent>
      {(description || trendText) && (
        <CardFooter className="mt-3 flex-col items-start gap-1 p-0 text-sm">
          {trendText && (
            <div className="flex items-center gap-2 font-medium leading-none text-foreground">
              {trendText} <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          {description && (
            <div className="leading-snug text-muted-foreground">{description}</div>
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
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((card, index) => (
        <KpiCard key={index} {...card} />
      ))}
    </div>
  );
};
