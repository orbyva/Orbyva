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
  /**
   * `false` tira o vermelho do botão de confirmar e é o que permite reaproveitar este dialog numa
   * confirmação **construtiva** (feature 096: "Reativar" na lista de tratamentos). Vestir de
   * destrutivo uma ação que desfaz um estrago ensina o usuário a ignorar o vermelho, que é
   * justamente o que essa feature está consertando do outro lado.
   */
  destructive?: boolean;
  /** O que o botão diz enquanto a ação corre. "Excluindo..." mentiria numa ação construtiva. */
  loadingLabel?: string;
}

export function ConfirmDeleteDialog({
  title,
  description,
  onConfirm,
  loading = false,
  children,
  confirmLabel = "Excluir",
  destructive = true,
  loadingLabel = "Excluindo...",
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
            onClick={() => {
              void Promise.resolve(onConfirm()).catch(() => undefined);
            }}
            disabled={loading}
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {loading ? loadingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
