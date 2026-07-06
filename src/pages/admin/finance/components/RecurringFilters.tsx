import { RecurringFilter } from "@/api/recurring";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FILTERS: { id: RecurringFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "open", label: "Em aberto" },
  { id: "paid", label: "Pagas" },
  { id: "upcoming", label: "Vencendo em breve" },
  { id: "overdue", label: "Atrasadas" },
];

interface RecurringFiltersProps {
  activeFilter: RecurringFilter;
  onFilterChange: (filter: RecurringFilter) => void;
  counts: Record<RecurringFilter, number>;
}

export function RecurringFilters({
  activeFilter,
  onFilterChange,
  counts,
}: RecurringFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map(({ id, label }) => (
        <Button
          key={id}
          type="button"
          size="sm"
          variant={activeFilter === id ? "default" : "outline"}
          className={cn(
            "h-10 rounded-full px-3 text-sm sm:h-8 sm:text-xs",
            activeFilter === id && "shadow-sm"
          )}
          onClick={() => onFilterChange(id)}
        >
          {label}
          <span
            className={cn(
              "ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium sm:text-[10px]",
              activeFilter === id
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {counts[id]}
          </span>
        </Button>
      ))}
    </div>
  );
}
