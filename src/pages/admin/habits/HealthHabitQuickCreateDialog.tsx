import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormLabel, FORM_DIALOG_CONTENT_CLASS, FORM_FIELDS_CLASS } from "@/components/FormLabel";
import { createHabit, updateHabit } from "@/api/habits";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Habit } from "@/types/habits";

type FrequencyOption = "daily" | "weekly";

/**
 * Sugestões só pré-preenchem o campo — nada é criado sem o usuário mandar. Semear hábitos na conta
 * no primeiro acesso duplicaria o que quem já usa Hábitos tem, e deixaria lixo pra quem não quer
 * (decisão registrada na feature 062).
 */
const SUGGESTIONS = [
  { name: "Beber água", frequency: "daily" as const, targetPerWeek: 7 },
  { name: "Comer frutas", frequency: "weekly" as const, targetPerWeek: 3 },
  { name: "Comer proteína", frequency: "daily" as const, targetPerWeek: 7 },
];

interface HealthHabitQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois que o hábito é salvo — quem chama recarrega a lista. */
  onCreated: () => void;
  /** Presente = modo edição. Ausente = criação. Remontar com `key` ao trocar o alvo. */
  habit?: Habit | null;
}

/**
 * Atalho de criação de hábito de saúde (feature 062) — mesmo padrão de
 * `MedicationQuickCreateDialog` (049) e `ConsultationQuickCreateDialog` (061). Por baixo cria um
 * `habit` comum com `is_health: true`: água e alimentação não têm tabela própria, então ganham de
 * graça streak, heatmap e meta semanal do módulo de Hábitos, e continuam editáveis lá pelo
 * formulário completo (descrição, vínculo com meta, cor).
 */
export function HealthHabitQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
  habit = null,
}: HealthHabitQuickCreateDialogProps) {
  const editing = habit != null;
  const [name, setName] = useState(habit?.name ?? "");
  const [frequency, setFrequency] = useState<FrequencyOption>(
    habit?.frequency ?? "daily"
  );
  // String (não number) pra não clampar durante a digitação — mesmo motivo documentado em
  // `MedicationQuickCreateDialog.tsx`.
  const [timesPerWeek, setTimesPerWeek] = useState(
    habit?.frequency === "weekly" ? String(habit.target_per_week) : "3"
  );
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const canSave = !!name.trim();

  function reset() {
    setName("");
    setFrequency("daily");
    setTimesPerWeek("3");
  }

  function applySuggestion(suggestion: (typeof SUGGESTIONS)[number]) {
    setName(suggestion.name);
    setFrequency(suggestion.frequency);
    setTimesPerWeek(String(suggestion.targetPerWeek));
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const targetPerWeek =
        frequency === "daily"
          ? 7
          : Math.max(1, Math.min(7, parseInt(timesPerWeek, 10) || 1));
      if (editing) {
        await updateHabit({
          id: habit.id,
          name: name.trim(),
          frequency,
          target_per_week: targetPerWeek,
          is_health: true,
        });
        toast({ title: "Hábito atualizado!", duration: 2000 });
      } else {
        await createHabit({
          name: name.trim(),
          description: "",
          frequency,
          target_per_week: targetPerWeek,
          kind: "build",
          goal_id: null,
          goal_increment: null,
          color: null,
          is_health: true,
        });
        toast({ title: "Hábito de saúde criado!", duration: 2000 });
        reset();
      }
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          editing
            ? "Não foi possível salvar o hábito."
            : "Não foi possível criar o hábito."
        ),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !editing) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar hábito de saúde" : "Novo hábito de saúde"}
          </DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          {editing ? null : (
          <div>
            <FormLabel>Sugestões</FormLabel>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.name}
                  type="button"
                  onClick={() => applySuggestion(suggestion)}
                  aria-pressed={name === suggestion.name}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    name === suggestion.name
                      ? "border-[hsl(var(--health))] bg-[hsl(var(--health))]/10 text-[hsl(var(--health))]"
                      : "hover:border-primary"
                  )}
                >
                  {suggestion.name}
                </button>
              ))}
            </div>
          </div>
          )}
          <div>
            <FormLabel required htmlFor="health-habit-name">
              Nome do hábito
            </FormLabel>
            <Input
              id="health-habit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Beber água"
            />
          </div>
          <div>
            <FormLabel required>Frequência</FormLabel>
            <Select
              value={frequency}
              onValueChange={(v) => setFrequency(v as FrequencyOption)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Todo dia</SelectItem>
                <SelectItem value="weekly">N vezes por semana</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {frequency === "weekly" && (
            <div>
              <FormLabel required htmlFor="health-habit-times">
                Vezes por semana
              </FormLabel>
              <Input
                id="health-habit-times"
                type="number"
                min={1}
                max={7}
                value={timesPerWeek}
                onChange={(e) => setTimesPerWeek(e.target.value)}
              />
            </div>
          )}
          <Button onClick={handleSave} disabled={!canSave || saving} className="w-full">
            {saving
              ? editing
                ? "Salvando..."
                : "Criando..."
              : editing
                ? "Salvar"
                : "Criar hábito"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
