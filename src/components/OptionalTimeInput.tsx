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
 * Horário opcional: vazio de verdade (sem default do browser em type=time).
 * Só monta o input time depois que o usuário escolhe definir.
 */
export function OptionalTimeInput({
  value,
  onChange,
  id,
  className,
  "aria-label": ariaLabel,
}: Props) {
  const hasValue = Boolean(value.trim());

  if (!hasValue) {
    return (
      <Button
        type="button"
        variant="outline"
        className={cn(
          "h-10 w-full justify-start font-normal text-muted-foreground",
          className
        )}
        onClick={() => onChange("09:00")}
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
        onClick={() => onChange("")}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
