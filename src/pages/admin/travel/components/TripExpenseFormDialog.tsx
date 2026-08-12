import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { FormField, FormFieldRow } from "@/components/FormField";
import {
  FormDialogShell,
  FormFooter,
} from "@/components/FormDialogShell";
import { FormDisclosure, FormSection } from "@/components/FormSection";
import { MoneyInput } from "@/components/MoneyInput";
import { ClassSearchPicker } from "@/components/ClassSearchPicker";
import { EXPENSE_CATEGORY_LABELS } from "@/domain/travel";
import type { Dimension } from "@/types/dimensions";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  /** Gasto já tem lançamento no extrato. */
  linkedToLedger?: boolean;
  form: TripExpenseFormState;
  onChange: (form: TripExpenseFormState) => void;
  memberCount: number;
  registerExpense: boolean;
  onRegisterExpenseChange: (checked: boolean) => void;
  classId: number;
  onClassIdChange: (id: number) => void;
  dimensions: Dimension[];
  onSave: () => void;
};

export function TripExpenseFormDialog({
  open,
  onOpenChange,
  editing,
  linkedToLedger = false,
  form,
  onChange,
  memberCount,
  registerExpense,
  onRegisterExpenseChange,
  classId,
  onClassIdChange,
  dimensions,
  onSave,
}: Props) {
  const showFinancePicker =
    (!editing && registerExpense) || (editing && linkedToLedger);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogShell
        title={editing ? "Editar gasto" : "Adicionar gasto"}
        footer={
          <FormFooter
            onCancel={() => onOpenChange(false)}
            onSubmit={onSave}
            submitLabel={
              editing ? "Salvar alterações" : "Adicionar gasto"
            }
          />
        }
      >
        <FormSection title="Essencial">
          <FormField label="Descrição" required>
            <Input
              value={form.description}
              onChange={(e) =>
                onChange({ ...form, description: e.target.value })
              }
            />
          </FormField>
          <FormField label="Valor" required>
            <MoneyInput
              value={form.amount || ""}
              onChange={(value) =>
                onChange({
                  ...form,
                  amount: value === "" ? 0 : value,
                })
              }
            />
          </FormField>
          <FormFieldRow>
            <FormField label="Categoria">
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
            </FormField>
            <FormField label="Data">
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
            </FormField>
          </FormFieldRow>
          {memberCount > 1 ? (
            <FormField
              label="Tipo do gasto"
              hint={
                form.visibility === "shared"
                  ? `Divide igual entre ${memberCount} membro(s). Ex.: casa alugada.`
                  : undefined
              }
            >
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
            </FormField>
          ) : null}
        </FormSection>

        {editing && linkedToLedger ? (
          <FormSection title="Finanças">
            <p className="text-xs text-muted-foreground">
              Nos lançamentos, salvar atualiza o registro
            </p>
            <FormField label="Categoria" required>
              <ClassSearchPicker
                dimensions={dimensions}
                value={classId > 0 ? classId : null}
                preferredNatureName="Despesa"
                autoFocus={false}
                hideLabel
                onChange={(opt) => onClassIdChange(opt?.id ?? 0)}
              />
            </FormField>
          </FormSection>
        ) : !editing ? (
          <FormDisclosure
            title="Registrar em Finanças"
            description="Cria um lançamento no extrato com este gasto."
            open={registerExpense}
            onOpenChange={onRegisterExpenseChange}
            variant="toggle"
          >
            {showFinancePicker ? (
              <FormField label="Categoria" required>
                <ClassSearchPicker
                  dimensions={dimensions}
                  value={classId > 0 ? classId : null}
                  preferredNatureName="Despesa"
                  autoFocus={false}
                  hideLabel
                  onChange={(opt) => onClassIdChange(opt?.id ?? 0)}
                />
              </FormField>
            ) : null}
          </FormDisclosure>
        ) : null}
      </FormDialogShell>
    </Dialog>
  );
}
