import { ClassSearchPicker } from "@/components/ClassSearchPicker";
import type { Dimension } from "@/types/dimensions";

interface ExpenseCategoryPickerProps {
  dimensions: Dimension[];
  /** @deprecated Mantido por compatibilidade; a busca usa só classId. */
  selectedType?: number | null;
  classId: number;
  onTypeChange?: (typeId: number | null) => void;
  onClassChange: (classId: number) => void;
}

/** Busca de categoria/subcategoria filtrada em Despesa (mesmo fluxo de Transações). */
export function ExpenseCategoryPicker({
  dimensions,
  classId,
  onTypeChange,
  onClassChange,
}: ExpenseCategoryPickerProps) {
  return (
    <ClassSearchPicker
      dimensions={dimensions}
      value={classId > 0 ? classId : null}
      preferredNatureName="Despesa"
      autoFocus={false}
      onChange={(opt) => {
        onClassChange(opt?.id ?? 0);
        onTypeChange?.(opt?.typeId ?? null);
      }}
    />
  );
}
