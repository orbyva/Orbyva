import { Timer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/FormLabel";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatEstimatedDuration } from "@/domain/tasks/duration";
import { cn } from "@/lib/utils";

/** Presets de duração. `0` ("Pontual", feature 072) só aparece quando **não** há `onQuickChange`
 * — com `onQuickChange` a pontualidade é a flag `is_quick` (feature 070), e o botão "Pontual"
 * separado cobre esse caso sem duplicar o rótulo. */
const DURATION_PRESETS_WITH_POINT = [0, 15, 30, 60, 90, 120, 240];
const DURATION_PRESETS_WITHOUT_POINT = [15, 30, 60, 90, 120, 240];

/**
 * Trigger clicável (ícone de relógio + `formatEstimatedDuration`; sem duração, mostra "+ Duração") que abre
 * um popover com presets comuns em botões + um campo "Personalizado" para valores fora da lista —
 * substitui o `<Input type="number">` de duração que havia em `TaskDueQuickEdit` (feature 031).
 *
 * Tarefa pontual (feature 070) e duração são mutuamente exclusivas — uma tarefa não pode ser bloco e
 * bolinha ao mesmo tempo. Daí os dois modos:
 * - com `onQuickChange` (edição rápida): "Pontual" vira uma opção ao lado dos presets; escolhê-la
 *   liga a flag e limpa a duração, e escolher um preset/personalizado faz o inverso;
 * - só com `isQuick` (formulário completo, onde o interruptor "Tarefa pontual" é quem manda): o
 *   controle de duração fica desabilitado enquanto a tarefa for pontual;
 * - sem `onQuickChange`: o preset `0` ("Pontual", feature 072) grava `estimated_duration = 0`.
 */
export function TaskDurationQuickPick({
  value,
  onChange,
  isQuick = false,
  onQuickChange,
}: {
  value: number | null | undefined;
  onChange: (minutes: number | null) => void;
  isQuick?: boolean;
  onQuickChange?: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const presets = onQuickChange ? DURATION_PRESETS_WITHOUT_POINT : DURATION_PRESETS_WITH_POINT;

  /** Contrato de callback único: cada ação dispara **um** `onChange` **ou** **um** `onQuickChange`,
   * nunca os dois. Quem consome resolve o par (escolher duração desliga "pontual"; escolher
   * "Pontual" zera a duração) — dois disparos seguidos fariam a segunda chamada sobrescrever a
   * primeira com props já defasadas, e na lista virariam duas escritas no banco. */
  function selectDuration(minutes: number | null) {
    onChange(minutes);
    setOpen(false);
  }

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
          disabled={isQuick && !onQuickChange}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-sm px-0.5 hover:bg-muted hover:text-foreground",
            value == null && !isQuick && "text-muted-foreground/70",
            isQuick && !onQuickChange && "cursor-not-allowed opacity-60 hover:bg-transparent"
          )}
        >
          <Timer className="h-3 w-3" />
          {isQuick
            ? "Pontual (sem duração)"
            : formatEstimatedDuration(value) || "+ Duração"}
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
            {presets.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={!isQuick && value === preset ? "secondary" : "outline"}
                className={cn(
                  "h-7 px-2.5 text-xs",
                  !isQuick && value === preset && "border border-primary/40"
                )}
                onClick={() => selectDuration(preset)}
              >
                {formatEstimatedDuration(preset)}
              </Button>
            ))}
            {onQuickChange && (
              <Button
                type="button"
                size="sm"
                variant={isQuick ? "secondary" : "outline"}
                className={cn("h-7 px-2.5 text-xs", isQuick && "border border-primary/40")}
                onClick={() => {
                  // Pontual não tem duração: quem recebe `true` zera `estimated_duration` junto.
                  onQuickChange(true);
                  setOpen(false);
                }}
              >
                Pontual
              </Button>
            )}
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
              onClick={() => selectDuration(custom ? parseInt(custom, 10) : null)}
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
