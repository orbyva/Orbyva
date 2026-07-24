import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { MoneyInput } from "@/components/MoneyInput";
import { EXPENSE_CATEGORY_LABELS } from "@/domain/travel";
import type {
  TripExpenseCategory,
  TripExpenseVisibility,
} from "@/types/travel";

export type TripExpenseFormState = {
  description: string;
  amount: number;
  category: TripExpenseCategory;
  expense_date: string;
  visibility: TripExpenseVisibility;
};

type DimItem = { id: number; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: TripExpenseFormState;
  onChange: (form: TripExpenseFormState) => void;
  memberCount: number;
  registerExpense: boolean;
  onRegisterExpenseChange: (checked: boolean) => void;
  financeTypeId: number;
  classId: number;
  onFinanceTypeIdChange: (id: number) => void;
  onClassIdChange: (id: number) => void;
  expenseTypes: DimItem[];
  expenseClasses: DimItem[];
  onSave: () => void;
};

export function TripExpenseFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  onChange,
  memberCount,
  registerExpense,
  onRegisterExpenseChange,
  financeTypeId,
  classId,
  onFinanceTypeIdChange,
  onClassIdChange,
  expenseTypes,
  expenseClasses,
  onSave,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar gasto" : "Adicionar gasto"}
          </DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required>Descrição</FormLabel>
            <Input
              value={form.description}
              onChange={(e) =>
                onChange({ ...form, description: e.target.value })
              }
            />
          </div>
          <div>
            <FormLabel required>Valor</FormLabel>
            <MoneyInput
              value={form.amount || ""}
              onChange={(value) =>
                onChange({
                  ...form,
                  amount: value === "" ? 0 : value,
                })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel>Categoria</FormLabel>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  onChange({
                    ...form,
                    category: v as TripExpenseCategory,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FormLabel>Data</FormLabel>
              <DatePicker
                date={new Date(`${form.expense_date}T12:00:00`)}
                onSelect={(d) =>
                  onChange({
                    ...form,
                    expense_date: d
                      ? d.toISOString().split("T")[0]
                      : form.expense_date,
                  })
                }
              />
            </div>
          </div>
          <div>
            <FormLabel>Tipo do gasto</FormLabel>
            <Select
              value={form.visibility}
              onValueChange={(v) =>
                onChange({
                  ...form,
                  visibility: v as TripExpenseVisibility,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Pessoal (só você vê)</SelectItem>
                <SelectItem value="shared">
                  Conjunta (divide entre membros)
                </SelectItem>
              </SelectContent>
            </Select>
            {form.visibility === "shared" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Divide igual entre {Math.max(memberCount, 1)} membro(s). Ex.:
                casa alugada.
              </p>
            ) : null}
          </div>
          {!editing && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={registerExpense}
                  onChange={(e) => onRegisterExpenseChange(e.target.checked)}
                  className="rounded"
                />
                Registrar em Finanças
              </label>
              {registerExpense && (
                <div
                  className={
                    financeTypeId
                      ? "grid grid-cols-2 gap-3"
                      : "grid grid-cols-1 gap-3"
                  }
                >
                  <div>
                    <FormLabel required>Tipo</FormLabel>
                    <Select
                      value={financeTypeId ? String(financeTypeId) : ""}
                      onValueChange={(v) => onFinanceTypeIdChange(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseTypes.map((type) => (
                          <SelectItem key={type.id} value={String(type.id)}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {financeTypeId ? (
                    <div>
                      <FormLabel required>Classe</FormLabel>
                      <Select
                        value={classId ? String(classId) : ""}
                        onValueChange={(v) => onClassIdChange(Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a classe" />
                        </SelectTrigger>
                        <SelectContent>
                          {expenseClasses.map((cls) => (
                            <SelectItem key={cls.id} value={String(cls.id)}>
                              {cls.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
          <Button onClick={onSave} className="w-full">
            {editing ? "Salvar alterações" : "Adicionar gasto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
