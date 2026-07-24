import { Button } from "@/components/ui/button";
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
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { formatBRL } from "@/lib/currency";
import type { TripExpense } from "@/types/travel";

type DimItem = { id: number; name: string };

type Props = {
  expense: TripExpense | null;
  onOpenChange: (open: boolean) => void;
  userId: string | undefined;
  financeTypeId: number;
  classId: number;
  onFinanceTypeIdChange: (id: number) => void;
  onClassIdChange: (id: number) => void;
  expenseTypes: DimItem[];
  expenseClasses: DimItem[];
  onConfirm: () => void;
};

export function TripSplitRegisterDialog({
  expense,
  onOpenChange,
  userId,
  financeTypeId,
  classId,
  onFinanceTypeIdChange,
  onClassIdChange,
  expenseTypes,
  expenseClasses,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={!!expense}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>Registrar Despesa</DialogTitle>
        </DialogHeader>
        {expense ? (
          <div className={FORM_FIELDS_CLASS}>
            <p className="text-sm text-muted-foreground">
              {expense.description} — sua fatia{" "}
              {formatBRL(
                expense.splits?.find((s) => s.user_id === userId)?.amount ?? 0
              )}
            </p>
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
                    <SelectValue placeholder="Tipo" />
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
                      <SelectValue placeholder="Classe" />
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
            <Button
              className="w-full"
              disabled={!classId}
              onClick={onConfirm}
            >
              Confirmar
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
