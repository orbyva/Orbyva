"use client";

import { useMemo, useState } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { startOfLocalDay } from "@/lib/dates";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface CalendarLimits {
  /** Limites do calendário / dropdowns (padrão: 20 anos atrás → 10 à frente). */
  startMonth?: Date;
  endMonth?: Date;
  /** Bloqueia a seleção de dias depois dessa data (ex.: prazo de subtarefa não pode passar do
   * prazo da tarefa-pai). Não afeta navegação de mês/dropdowns, só quais dias ficam clicáveis. */
  maxDate?: Date;
}

interface InlineCalendarPickerProps extends CalendarLimits {
  date?: Date;
  onSelect: (date: Date | undefined) => void;
  /** Mostra ação para limpar a data (campos opcionais). */
  clearable?: boolean;
  /** "compact" reduz célula de dia, navegação de mês e rodapé — usado no popover de quick-edit
   * de prazo (`TaskDueQuickEdit`), onde o tamanho padrão (pensado pro `DatePicker` completo) fica
   * grande demais. Default `"default"` preserva o visual atual (usado por `DatePicker`). */
  size?: "default" | "compact";
}

/** Corpo do calendário (navegação de mês + grade + atalhos "Hoje"/"Limpar"), sem trigger/popover
 * próprio — usado dentro do `PopoverContent` de `DatePicker` e, direto (sem o clique extra do
 * trigger), em `TaskDueQuickEdit`. */
export function InlineCalendarPicker({
  date,
  onSelect,
  clearable = false,
  startMonth: startMonthProp,
  endMonth: endMonthProp,
  maxDate,
  size = "default",
}: InlineCalendarPickerProps) {
  const isCompact = size === "compact";
  const [month, setMonth] = useState<Date>(date ?? startOfLocalDay());

  const startMonth = useMemo(
    () => startMonthProp ?? new Date(new Date().getFullYear() - 20, 0),
    [startMonthProp]
  );
  const endMonth = useMemo(
    () => endMonthProp ?? new Date(new Date().getFullYear() + 10, 11),
    [endMonthProp]
  );

  const canGoPrev =
    month.getFullYear() > startMonth.getFullYear() ||
    (month.getFullYear() === startMonth.getFullYear() &&
      month.getMonth() > startMonth.getMonth());
  const canGoNext =
    month.getFullYear() < endMonth.getFullYear() ||
    (month.getFullYear() === endMonth.getFullYear() &&
      month.getMonth() < endMonth.getMonth());

  function handleToday() {
    const today = startOfLocalDay();
    onSelect(today);
    setMonth(today);
  }

  return (
    <>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("absolute left-2 top-2.5 z-20", isCompact ? "size-7" : "size-8")}
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
          className={cn("absolute right-2 top-2.5 z-20", isCompact ? "size-7" : "size-8")}
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
          onSelect={onSelect}
          disabled={maxDate ? { after: maxDate } : undefined}
          locale={ptBR}
          captionLayout="dropdown"
          hideNavigation
          startMonth={startMonth}
          endMonth={endMonth}
          weekStartsOn={0}
          autoFocus
          className={isCompact ? "p-1.5" : undefined}
          classNames={{
            month_caption: cn(
              "relative mx-auto flex items-center justify-center",
              isCompact ? "h-8 w-full max-w-[10rem]" : "h-9 w-full max-w-[11.5rem]"
            ),
            dropdowns: "flex items-center justify-center gap-1.5",
            ...(isCompact
              ? {
                  day_button: cn(
                    buttonVariants({ variant: "ghost" }),
                    "size-7 p-0 text-xs font-normal aria-selected:opacity-100"
                  ),
                  weekday:
                    "w-7 text-center text-[0.7rem] font-normal text-muted-foreground",
                }
              : {}),
          }}
          formatters={{
            formatMonthDropdown: (value) =>
              format(value, "MMM", { locale: ptBR }),
          }}
        />
      </div>

      <div className={cn("flex items-center gap-2 border-t", isCompact ? "p-1.5" : "p-2")}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("flex-1", isCompact && "h-7 text-xs")}
          onClick={handleToday}
        >
          Hoje
        </Button>
        {clearable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("gap-1 text-muted-foreground", isCompact && "h-7 text-xs")}
            onClick={() => onSelect(undefined)}
            disabled={!date}
          >
            <X className={isCompact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            Limpar
          </Button>
        ) : null}
      </div>
    </>
  );
}

interface DatePickerProps extends CalendarLimits {
  date?: Date;
  onSelect: (date: Date | undefined) => void;
  placeholder?: string;
  /** Nome acessível do gatilho. Sem isso o botão se chama pela data que exibe (ou pelo
   * placeholder), e dois campos de data na mesma tela ficam indistinguíveis para leitor de tela —
   * é o caso do painel de tarefa (feature 080), com "Data limite" e "Início" lado a lado. */
  ariaLabel?: string;
  /** Mostra ação para limpar a data (campos opcionais). */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  /** Encaminhado ao gatilho — campos opcionais com validação (término de consulta/medicação). */
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function DatePicker({
  date,
  onSelect,
  placeholder = "Selecione a data",
  ariaLabel,
  clearable = false,
  disabled = false,
  className,
  startMonth,
  endMonth,
  maxDate,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  function handleSelect(next: Date | undefined) {
    onSelect(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
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
        <InlineCalendarPicker
          date={date}
          onSelect={handleSelect}
          clearable={clearable}
          startMonth={startMonth}
          endMonth={endMonth}
          maxDate={maxDate}
        />
      </PopoverContent>
    </Popover>
  );
}

