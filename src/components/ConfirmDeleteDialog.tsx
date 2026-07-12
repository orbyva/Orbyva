import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ConfirmDeleteDialogProps {
  title: string;
  description?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  children: ReactNode;
  confirmLabel?: string;
}

export function ConfirmDeleteDialog({
  title,
  description,
  onConfirm,
  loading = false,
  children,
  confirmLabel = "Excluir",
}: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>{title}</AlertDialogHeader>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Excluindo..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
