import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

/**
 * Horário opcional: começa como botão; ao definir, mantém o input montado
 * mesmo se o valor ficar vazio (evita Backspace → history.back() ao desmontar).
 */
export function OptionalTimeInput({
  value,
  onChange,
  id,
  className,
  "aria-label": ariaLabel,
}: Props) {
  const hasValue = Boolean(value.trim());
  const [open, setOpen] = useState(hasValue);

  useEffect(() => {
    if (hasValue) setOpen(true);
  }, [hasValue]);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className={cn(
          "h-10 w-full justify-start font-normal text-muted-foreground",
          className
        )}
        onClick={() => {
          setOpen(true);
          onChange(value.trim() || "09:00");
        }}
        aria-label={ariaLabel ?? "Definir horário"}
      >
        Sem horário · definir
      </Button>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Input
        id={id}
        type="time"
        step={60}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Evita que o Backspace “vaze” para a navegação do browser
          // caso o input perca o valor no meio da edição.
          if (e.key === "Backspace" || e.key === "Delete") {
            e.stopPropagation();
          }
        }}
        onBlur={() => {
          // Só recolhe depois do ciclo de clique (ex.: botão limpar).
          window.setTimeout(() => {
            if (!value.trim()) setOpen(false);
          }, 0);
        }}
        aria-label={ariaLabel}
        className="flex-1"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 shrink-0 text-muted-foreground"
        aria-label="Limpar horário"
        title="Limpar horário"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          onChange("");
          setOpen(false);
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
