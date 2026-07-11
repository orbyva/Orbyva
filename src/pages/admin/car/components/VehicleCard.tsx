import { useState } from "react";
import { Car, Gauge, Pencil } from "lucide-react";
import type { Vehicle } from "@/types/car";
import { FUEL_TYPE_LABELS } from "@/domain/car";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { updateVehicle } from "@/api/car";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

interface VehicleCardProps {
  vehicle: Vehicle;
  onUpdated: () => void;
  onEdit: () => void;
}

export function VehicleCard({ vehicle, onUpdated, onEdit }: VehicleCardProps) {
  const [editingKm, setEditingKm] = useState(false);
  const [kmValue, setKmValue] = useState(String(vehicle.current_km));
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function handleSaveKm() {
    const parsed = parseInt(kmValue, 10);
    if (isNaN(parsed) || parsed < 0) {
      toast({
        title: "Erro",
        description: "Informe uma quilometragem válida.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      await updateVehicle({ id: vehicle.id, current_km: parsed });
      setEditingKm(false);
      onUpdated();
      toast({ title: "Km atualizado", duration: 2000 });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao atualizar km."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const fuelLabel = vehicle.fuel_type
    ? FUEL_TYPE_LABELS[vehicle.fuel_type]
    : null;

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-car/10 p-2.5">
            <Car className="h-5 w-5 text-car" />
          </div>
          <div>
            <h2 className="text-lg font-bold">
              {vehicle.brand} {vehicle.model}
              {vehicle.year ? ` · ${vehicle.year}` : ""}
            </h2>
            <div className="mt-1 flex flex-wrap gap-2">
              {vehicle.plate && (
                <Badge variant="secondary">{vehicle.plate}</Badge>
              )}
              {fuelLabel && (
                <Badge variant="outline">{fuelLabel}</Badge>
              )}
              {vehicle.color && (
                <Badge variant="outline">{vehicle.color}</Badge>
              )}
            </div>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-1 h-3.5 w-3.5" />
          Editar
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Quilometragem atual</p>
          {editingKm ? (
            <div className="mt-1 flex items-center gap-2">
              <Input
                type="number"
                value={kmValue}
                onChange={(e) => setKmValue(e.target.value)}
                className="h-8 w-36"
              />
              <span className="text-sm text-muted-foreground">km</span>
              <Button size="sm" onClick={handleSaveKm} disabled={saving}>
                Salvar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingKm(false);
                  setKmValue(String(vehicle.current_km));
                }}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="mt-0.5 text-left text-xl font-bold hover:text-primary"
              onClick={() => setEditingKm(true)}
            >
              {vehicle.current_km.toLocaleString("pt-BR")} km
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
