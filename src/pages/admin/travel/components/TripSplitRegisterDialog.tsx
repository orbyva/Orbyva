import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/FormField";
import {
  FormDialogShell,
  FormFooter,
} from "@/components/FormDialogShell";
import { FormSection } from "@/components/FormSection";
import { ClassSearchPicker } from "@/components/ClassSearchPicker";
import { formatBRL } from "@/lib/currency";
import type { Dimension } from "@/types/dimensions";
import type { TripExpense } from "@/types/travel";

type Props = {
  expense: TripExpense | null;
  onOpenChange: (open: boolean) => void;
  userId: string | undefined;
  classId: number;
  onClassIdChange: (id: number) => void;
  dimensions: Dimension[];
  onConfirm: () => void;
};

export function TripSplitRegisterDialog({
  expense,
  onOpenChange,
  userId,
  classId,
  onClassIdChange,
  dimensions,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={!!expense}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      {expense ? (
        <FormDialogShell
          title="Registrar despesa"
          footer={
            <FormFooter
              onCancel={() => onOpenChange(false)}
              onSubmit={onConfirm}
              submitLabel="Confirmar"
              submitDisabled={!classId}
            />
          }
        >
          <FormSection title="Essencial">
            <p className="text-sm text-muted-foreground">
              {expense.description}, sua fatia{" "}
              {formatBRL(
                expense.splits?.find((s) => s.user_id === userId)?.amount ?? 0
              )}
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
        </FormDialogShell>
      ) : null}
    </Dialog>
  );
}
