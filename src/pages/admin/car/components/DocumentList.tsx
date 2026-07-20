import { FileText, Pen, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import type { VehicleDocument } from "@/types/car";
import { DOCUMENT_TYPE_LABELS } from "@/domain/car";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface DocumentListProps {
  documents: VehicleDocument[];
  onEdit: (doc: VehicleDocument) => void;
  onDelete: (id: string) => void;
  deleteLoading: string | null;
}

function docLabel(doc: VehicleDocument): string {
  if (doc.type === "other" && doc.custom_type) return doc.custom_type;
  return DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type;
}

export function DocumentList({
  documents,
  onEdit,
  onDelete,
  deleteLoading,
}: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhum documento registrado"
        description="Cadastre IPVA, seguro, licenciamento e outros vencimentos."
      />
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {documents.map((doc) => {
        const due = new Date(`${doc.due_date}T12:00:00`);
        due.setHours(0, 0, 0, 0);
        const daysLeft = Math.round(
          (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        const isOverdue = !doc.paid && daysLeft < 0;
        const isUpcoming = !doc.paid && daysLeft >= 0 && daysLeft <= 30;

        return (
          <article
            key={doc.id}
            className={cn(
              "rounded-lg border bg-card p-4 shadow-sm",
              isOverdue && "border-destructive/40",
              isUpcoming && "border-warning/40"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{docLabel(doc)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vence em {formatDateBR(doc.due_date)}
                </p>
                {doc.cost != null && (
                  <p className="mt-1 text-sm">{formatBRL(doc.cost)}</p>
                )}
              </div>
              <Badge
                variant="outline"
                className={cn(
                  doc.paid
                    ? "border-success/30 text-success"
                    : isOverdue
                      ? "border-destructive/30 text-destructive"
                      : isUpcoming
                        ? "border-warning/30 text-warning"
                        : ""
                )}
              >
                {doc.paid ? "Pago" : isOverdue ? "Atrasado" : "Pendente"}
              </Badge>
            </div>

            <div className="mt-3 flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className={ICON_EDIT_BUTTON_CLASS}
                onClick={() => onEdit(doc)}
              >
                <Pen className="mr-1 h-3.5 w-3.5" />
                Editar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>Excluir este documento?</AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(doc.id)}
                      disabled={deleteLoading === doc.id}
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </article>
        );
      })}
    </div>
  );
}
