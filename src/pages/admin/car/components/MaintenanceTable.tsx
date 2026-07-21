import { Pen, Trash2, Wrench } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import type { Maintenance } from "@/types/car";
import { getMaintenanceTypeLabel } from "@/domain/car";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface MaintenanceTableProps {
  maintenances: Maintenance[];
  onEdit: (maintenance: Maintenance) => void;
  onDelete: (id: string) => void;
  deleteLoading: string | null;
}

export function MaintenanceTable({
  maintenances,
  onEdit,
  onDelete,
  deleteLoading,
}: MaintenanceTableProps) {
  if (maintenances.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="Nenhuma manutenção registrada"
        description="Registre óleo, pneus, freios, corrente e outras manutenções para receber alertas."
      />
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Km</TableHead>
            <TableHead>Custo</TableHead>
            <TableHead>Próxima troca</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {maintenances.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">
                {getMaintenanceTypeLabel(item.type, item.custom_type)}
              </TableCell>
              <TableCell>{formatDateBR(item.service_date)}</TableCell>
              <TableCell>
                {item.km_at_service.toLocaleString("pt-BR")} km
              </TableCell>
              <TableCell>
                {item.cost != null ? formatBRL(item.cost) : "—"}
              </TableCell>
              <TableCell className="text-sm">
                {item.next_km != null && (
                  <span>{item.next_km.toLocaleString("pt-BR")} km</span>
                )}
                {item.next_km != null && item.next_date && " · "}
                {item.next_date && formatDateBR(item.next_date)}
                {!item.next_km && !item.next_date && "—"}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8", ICON_EDIT_BUTTON_CLASS)}
                    onClick={() => onEdit(item)}
                  >
                    <Pen className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        Excluir esta manutenção?
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDelete(item.id)}
                          disabled={deleteLoading === item.id}
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
