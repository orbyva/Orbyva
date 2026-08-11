import type { Dimension } from "@/types/dimensions";

/** Detecta categoria/subcategoria de Viagens no plano de contas. */
export function isTravelExpenseClass(
  dimensions: Dimension[],
  classId: number | null | undefined
): boolean {
  if (!classId) return false;
  for (const dim of dimensions) {
    for (const type of dim.types ?? []) {
      for (const cls of type.classes ?? []) {
        if (cls.id !== classId) continue;
        const names = [cls.name, type.name, dim.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return /viagem|viagens|travel/.test(names);
      }
    }
  }
  return false;
}
