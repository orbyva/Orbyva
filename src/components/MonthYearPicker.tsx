"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MonthYearPickerProps {
  value: string; // YYYY-MM-01
  onChange: (value: string) => void;
  /** Destaca visualmente que todos os meses do ano serão usados. */
  allMonthsSelected?: boolean;
  className?: string;
}

const MONTHS = [
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

export function MonthYearPicker({
  value,
  onChange,
  allMonthsSelected = false,
  className,
}: MonthYearPickerProps) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  const selectedMonth = date.getMonth();
  const selectedYear = date.getFullYear();

  function changeYear(direction: "prev" | "next") {
    const newYear = direction === "prev" ? selectedYear - 1 : selectedYear + 1;
    onChange(`${newYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`);
  }

  function selectMonth(monthIndex: number) {
    onChange(`${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-01`);
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border bg-muted/30 p-3",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => changeYear("prev")}
          aria-label="Ano anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="min-w-[4.5rem] text-center text-sm font-semibold tabular-nums">
          {selectedYear}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => changeYear("next")}
          aria-label="Próximo ano"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {MONTHS.map((month, index) => {
          const active = allMonthsSelected || index === selectedMonth;

          return (
            <Button
              key={month}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              disabled={allMonthsSelected}
              onClick={() => selectMonth(index)}
              className={cn(
                "h-8 px-0 text-xs font-medium",
                allMonthsSelected && "opacity-100"
              )}
            >
              {month}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
