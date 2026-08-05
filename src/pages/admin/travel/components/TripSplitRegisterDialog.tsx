import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
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
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>Registrar despesa</DialogTitle>
        </DialogHeader>
        {expense ? (
          <div className={FORM_FIELDS_CLASS}>
            <p className="text-sm text-muted-foreground">
              {expense.description} — sua fatia{" "}
              {formatBRL(
                expense.splits?.find((s) => s.user_id === userId)?.amount ?? 0
              )}
            </p>
            <ClassSearchPicker
              dimensions={dimensions}
              value={classId > 0 ? classId : null}
              preferredNatureName="Despesa"
              autoFocus={false}
              onChange={(opt) => onClassIdChange(opt?.id ?? 0)}
            />
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
