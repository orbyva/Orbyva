import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export type SortState<K extends string> = {
  key: K;
  dir: SortDir;
};

export function toggleSort<K extends string>(
  current: SortState<K>,
  key: K
): SortState<K> {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: "asc" };
}

export function SortableTableHead<K extends string>({
  label,
  sortKey,
  sort,
  onSortChange,
  className,
  align = "left",
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSortChange: (key: K) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <TableHead className={className}>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-8 px-3 text-xs font-medium hover:bg-transparent",
          align === "right" ? "-mr-3 ml-auto flex" : "-ml-3",
          active && "text-foreground"
        )}
        onClick={() => onSortChange(sortKey)}
      >
        {label}
        <ArrowUpDown
          className={cn(
            "ml-1.5 h-3.5 w-3.5",
            active ? "opacity-100" : "opacity-40"
          )}
        />
        <span className="sr-only">
          {active
            ? sort.dir === "asc"
              ? "ordenado crescente"
              : "ordenado decrescente"
            : "ordenar"}
        </span>
      </Button>
    </TableHead>
  );
}
