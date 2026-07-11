import { Fuel, Pen, Trash2 } from "lucide-react";
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
import type { FuelLog } from "@/types/car";
import { formatBRL, formatDateBR } from "@/lib/currency";

interface FuelLogTableProps {
  fuelLogs: FuelLog[];
  avgConsumption: number | null;
  onEdit: (log: FuelLog) => void;
  onDelete: (id: string) => void;
  deleteLoading: string | null;
}

export function FuelLogTable({
  fuelLogs,
  avgConsumption,
  onEdit,
  onDelete,
  deleteLoading,
}: FuelLogTableProps) {
  if (fuelLogs.length === 0) {
    return (
      <EmptyState
        icon={Fuel}
        title="Nenhum abastecimento registrado"
        description="Registre abastecimentos para acompanhar o consumo médio."
      />
    );
  }

  return (
    <div className="space-y-3">
      {avgConsumption != null && (
        <p className="text-sm text-muted-foreground">
          Consumo médio (último abastecimento):{" "}
          <span className="font-semibold text-foreground">
            {avgConsumption.toFixed(1)} km/l
          </span>
        </p>
      )}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Km</TableHead>
              <TableHead>Litros</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Posto</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fuelLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{formatDateBR(log.date)}</TableCell>
                <TableCell>{log.km.toLocaleString("pt-BR")} km</TableCell>
                <TableCell>{log.liters.toFixed(1)} L</TableCell>
                <TableCell>{formatBRL(log.total_cost)}</TableCell>
                <TableCell>{log.station || "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEdit(log)}
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
                          Excluir este abastecimento?
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDelete(log.id)}
                            disabled={deleteLoading === log.id}
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
    </div>
  );
}
