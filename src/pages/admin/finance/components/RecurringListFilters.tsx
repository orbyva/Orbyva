import { RecurringFilter } from "@/api/recurring";
import type { RecurringNatureFilter } from "@/domain/recurring/listView";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NATURE_FILTERS: { id: RecurringNatureFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "receive", label: "A receber" },
  { id: "pay", label: "A pagar" },
];

const STATUS_FILTERS: { id: RecurringFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "open", label: "Em aberto" },
  { id: "paid", label: "Concluídas" },
  { id: "upcoming", label: "Vencendo" },
  { id: "overdue", label: "Atrasadas" },
];

interface RecurringListFiltersProps {
  natureFilter: RecurringNatureFilter;
  onNatureChange: (filter: RecurringNatureFilter) => void;
  natureCounts: Record<RecurringNatureFilter, number>;
  statusFilter: RecurringFilter;
  onStatusChange: (filter: RecurringFilter) => void;
  statusCounts: Record<RecurringFilter, number>;
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:w-16">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      className={cn(
        "h-8 rounded-full px-2.5 text-xs",
        active && "shadow-sm"
      )}
      onClick={onClick}
    >
      {label}
      <span
        className={cn(
          "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
          active
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {count}
      </span>
    </Button>
  );
}

export function RecurringListFilters({
  natureFilter,
  onNatureChange,
  natureCounts,
  statusFilter,
  onStatusChange,
  statusCounts,
}: RecurringListFiltersProps) {
  return (
    <div className="space-y-2.5 rounded-xl border border-border/60 bg-card/30 px-3 py-3">
      <FilterRow label="Natureza">
        {NATURE_FILTERS.map(({ id, label }) => (
          <FilterChip
            key={id}
            active={natureFilter === id}
            label={label}
            count={natureCounts[id]}
            onClick={() => onNatureChange(id)}
          />
        ))}
      </FilterRow>
      <FilterRow label="Situação">
        {STATUS_FILTERS.map(({ id, label }) => (
          <FilterChip
            key={id}
            active={statusFilter === id}
            label={label}
            count={statusCounts[id]}
            onClick={() => onStatusChange(id)}
          />
        ))}
      </FilterRow>
    </div>
  );
}
