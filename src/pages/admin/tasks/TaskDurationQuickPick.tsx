import { Timer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/FormLabel";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatEstimatedDuration } from "@/domain/tasks/duration";
import { cn } from "@/lib/utils";

const DURATION_PRESETS_MIN = [15, 30, 60, 90, 120, 240];

/**
 * Trigger clicável (ícone de relógio + `formatEstimatedDuration`; sem duração, mostra "+ Duração") que abre
 * um popover com presets comuns em botões + um campo "Personalizado" para valores fora da lista —
 * substitui o `<Input type="number">` de duração que havia em `TaskDueQuickEdit` (feature 031).
 */
export function TaskDurationQuickPick({
  value,
  onChange,
}: {
  value: number | null | undefined;
  onChange: (minutes: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setCustom(value ? String(value) : "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-sm px-0.5 hover:bg-muted hover:text-foreground",
            !value && "text-muted-foreground/70"
          )}
        >
          <Timer className="h-3 w-3" />
          {value ? formatEstimatedDuration(value) : "+ Duração"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto space-y-2.5 p-3"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <FormLabel optional>Duração</FormLabel>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DURATION_PRESETS_MIN.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={value === preset ? "secondary" : "outline"}
                className={cn(
                  "h-7 px-2.5 text-xs",
                  value === preset && "border border-primary/40"
                )}
                onClick={() => {
                  onChange(preset);
                  setOpen(false);
                }}
              >
                {formatEstimatedDuration(preset)}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <FormLabel optional>Personalizado (minutos)</FormLabel>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Input
              type="number"
              min="0"
              placeholder="Ex: 50"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-8 text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 px-2.5 text-xs"
              disabled={!custom}
              onClick={() => {
                onChange(custom ? parseInt(custom, 10) : null);
                setOpen(false);
              }}
            >
              Aplicar
            </Button>
          </div>
        </div>
        {value != null && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-full text-xs text-muted-foreground"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Remover duração
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
