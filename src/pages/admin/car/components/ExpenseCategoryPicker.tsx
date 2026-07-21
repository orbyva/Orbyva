import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormLabel } from "@/components/FormLabel";
import type { Dimension } from "@/types/dimensions";

interface ExpenseCategoryPickerProps {
  dimensions: Dimension[];
  selectedType: number | null;
  classId: number;
  onTypeChange: (typeId: number | null) => void;
  onClassChange: (classId: number) => void;
}

/** Seletor Tipo → Categoria já filtrado em Despesa (sem pedir natureza de novo). */
export function ExpenseCategoryPicker({
  dimensions,
  selectedType,
  classId,
  onTypeChange,
  onClassChange,
}: ExpenseCategoryPickerProps) {
  const expenseNature =
    dimensions.find((n) => n.name.toLowerCase() === "despesa") ?? null;
  const types = expenseNature?.types ?? [];
  const selectedTypeObj = types.find((t) => t.id === selectedType);
  const classes = selectedTypeObj?.classes ?? [];

  if (!expenseNature) {
    return (
      <p className="text-sm text-destructive">
        Natureza “Despesa” não encontrada. Cadastre-a em Finanças → Dimensões.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <FormLabel required>Tipo</FormLabel>
        <Select
          value={selectedType ? String(selectedType) : ""}
          onValueChange={(v) => {
            onTypeChange(Number(v));
            onClassChange(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecionar tipo" />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selectedType != null && (
        <div>
          <FormLabel required>Categoria</FormLabel>
          <Select
            value={classId ? String(classId) : ""}
            onValueChange={(v) => onClassChange(Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar categoria" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

export function getExpenseNatureId(dimensions: Dimension[]): number | null {
  return (
    dimensions.find((n) => n.name.toLowerCase() === "despesa")?.id ?? null
  );
}
