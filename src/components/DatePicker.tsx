"use client";

import { useEffect, useMemo, useState } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatLocalIsoDate, startOfLocalDay } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  date?: Date;
  onSelect: (date: Date | undefined) => void;
  placeholder?: string;
  /** Mostra ação para limpar a data (campos opcionais). */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  /** Limites do calendário / dropdowns (padrão: 20 anos atrás → 10 à frente). */
  startMonth?: Date;
  endMonth?: Date;
}

export function DatePicker({
  date,
  onSelect,
  placeholder = "Selecione a data",
  clearable = false,
  disabled = false,
  className,
  startMonth: startMonthProp,
  endMonth: endMonthProp,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(date ?? startOfLocalDay());

  const startMonth = useMemo(
    () => startMonthProp ?? new Date(new Date().getFullYear() - 20, 0),
    [startMonthProp]
  );
  const endMonth = useMemo(
    () => endMonthProp ?? new Date(new Date().getFullYear() + 10, 11),
    [endMonthProp]
  );

  useEffect(() => {
    if (open) setMonth(date ?? startOfLocalDay());
  }, [open, date]);

  const canGoPrev =
    month.getFullYear() > startMonth.getFullYear() ||
    (month.getFullYear() === startMonth.getFullYear() &&
      month.getMonth() > startMonth.getMonth());
  const canGoNext =
    month.getFullYear() < endMonth.getFullYear() ||
    (month.getFullYear() === endMonth.getFullYear() &&
      month.getMonth() < endMonth.getMonth());

  function handleSelect(next: Date | undefined) {
    onSelect(next);
    if (next) setOpen(false);
  }

  function handleToday() {
    const today = startOfLocalDay();
    onSelect(today);
    setMonth(today);
    setOpen(false);
  }

  function handleClear() {
    onSelect(undefined);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {date ? (
            format(date, "dd/MM/yyyy", { locale: ptBR })
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[18.5rem] p-0" align="start">
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute left-2 top-2.5 z-20 size-8"
            disabled={!canGoPrev}
            onClick={() => setMonth((m) => subMonths(m, 1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute right-2 top-2.5 z-20 size-8"
            disabled={!canGoNext}
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" />
          </Button>

          <Calendar
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={date}
            onSelect={handleSelect}
            locale={ptBR}
            captionLayout="dropdown"
            hideNavigation
            startMonth={startMonth}
            endMonth={endMonth}
            weekStartsOn={0}
            autoFocus
            classNames={{
              month_caption:
                "relative mx-auto flex h-9 w-full max-w-[11.5rem] items-center justify-center",
              dropdowns: "flex items-center justify-center gap-1.5",
            }}
            formatters={{
              formatMonthDropdown: (value) =>
                format(value, "MMM", { locale: ptBR }),
            }}
          />
        </div>

        <div className="flex items-center gap-2 border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={handleToday}
          >
            Hoje
          </Button>
          {clearable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={handleClear}
              disabled={!date}
            >
              <X className="h-3.5 w-3.5" />
              Limpar
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { formatLocalIsoDate };
