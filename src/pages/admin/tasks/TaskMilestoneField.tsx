import { FormLabel } from "@/components/FormLabel";

/**
 * Checkbox "Marco" na aba Geral do formulário completo de tarefa (feature 037) — marca a tarefa
 * como um marco no Gantt: sem duração, um ponto na data de prazo em vez de uma barra normal.
 * Quick-edit inline do Gantt fica fora do escopo (ver feature 039, quick actions do card).
 */
export function TaskMilestoneField({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div>
      <FormLabel optional>Marco</FormLabel>
      <label className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
        Marcar como marco (data única, sem duração, aparece como ponto no Gantt)
      </label>
    </div>
  );
}
