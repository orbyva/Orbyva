import type { Habit } from "@/types/habits";

/**
 * Marca visual (feature 062) do hábito que também aparece no Health Dashboard. Sem ela o usuário vê
 * o mesmo "Beber água" em dois lugares sem entender por quê — o `title` explica o vínculo.
 */
export function HealthHabitBadge({ habit }: { habit: Pick<Habit, "is_health"> }) {
  if (!habit.is_health) return null;
  return (
    <span
      title="Hábito de saúde — aparece também em Vida > Saúde"
      className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--health))]/30 px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--health))]"
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--health))]"
      />
      Saúde
    </span>
  );
}
