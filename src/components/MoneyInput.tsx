import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatMoneyInput, moneyFromDigits } from "@/lib/currency";
import { cn } from "@/lib/utils";

type MoneyInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: number | "" | null;
  onChange: (value: number | "") => void;
};

/**
 * Input monetário pt-BR: digita centavos e mostra `1.234,56`.
 * Aceita colar `1.234,56` (usa só os dígitos).
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, className, placeholder = "0,00", ...props }, ref) => {
    const display =
      value === "" || value == null || Number.isNaN(Number(value))
        ? ""
        : formatMoneyInput(Number(value));

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const parsed = moneyFromDigits(e.target.value);
      onChange(parsed == null ? "" : parsed);
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={display}
        onChange={handleChange}
        className={cn("tabular-nums", className)}
        {...props}
      />
    );
  }
);

MoneyInput.displayName = "MoneyInput";
