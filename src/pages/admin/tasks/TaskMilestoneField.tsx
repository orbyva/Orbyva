import { FormLabel } from "@/components/FormLabel";

/**
 * Checkbox "Marco" do formulário completo de tarefa (feature 037) — marca a tarefa como um marco
 * no Gantt: sem duração, um ponto na data de prazo em vez de uma barra normal.
 * Quick-edit inline do Gantt fica fora do escopo (ver feature 039, quick actions do card).
 *
 * Feature 080: o texto ao lado do checkbox encolheu ("Marcar como marco (data única, sem duração,
 * aparece como ponto no Gantt)" → "Marco no Gantt (sem duração)") porque o campo agora divide uma
 * linha com Ícone, Prioridade e Tarefa pontual — a frase antiga sozinha ocupava a linha inteira,
 * que é exatamente a queixa do pedido. O significado fica: label "Marco" + o que ele faz.
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
        Marco no Gantt (sem duração)
      </label>
    </div>
  );
}
