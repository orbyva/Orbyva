import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Car as CarIcon, Plus } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import Pagination from "../finance/components/Pagination";
import { useToast } from "@/hooks/use-toast";
import { useDimensions } from "@/hooks/useDimensions";
import { getErrorMessage } from "@/lib/errors";
import {
  VEHICLE_KIND_LABELS,
  calculateFuelConsumption,
  getDocumentAlerts,
  getMaintenanceAlerts,
  getMaintenanceSchedule,
  normalizeVehicleKind,
} from "@/domain/car";
import {
  deleteDocument,
  deleteFuelLog,
  deleteMaintenance,
  deleteVehicle,
  fetchAllFuelLogs,
  fetchAllMaintenances,
  fetchDocuments,
  fetchVehicles,
} from "@/api/car";
import type {
  FuelLog,
  Maintenance,
  Vehicle,
  VehicleDocument,
} from "@/types/car";

import { VehicleCard } from "./components/VehicleCard";
import { VehicleFormDialog } from "./components/VehicleFormDialog";
import { CarAlerts } from "./components/CarAlerts";
import { MaintenanceScheduleGrid } from "./components/MaintenanceScheduleGrid";
import { MaintenanceFormDialog } from "./components/MaintenanceFormDialog";
import { MaintenanceTable } from "./components/MaintenanceTable";
import { FuelLogFormDialog } from "./components/FuelLogFormDialog";
import { FuelLogTable } from "./components/FuelLogTable";
import { DocumentFormDialog } from "./components/DocumentFormDialog";
import { DocumentList } from "./components/DocumentList";

export default function Car() {
  const { toast } = useToast();
  const { dimensions } = useDimensions();

  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [allMaintenances, setAllMaintenances] = useState<Maintenance[]>([]);
  const [allFuelLogs, setAllFuelLogs] = useState<FuelLog[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);

  const [maintPage, setMaintPage] = useState(1);
  const [maintPageSize, setMaintPageSize] = useState(10);

  const [fuelPage, setFuelPage] = useState(1);
  const [fuelPageSize, setFuelPageSize] = useState(10);

  const [vehicleFormOpen, setVehicleFormOpen] = useState(false);
  const [createVehicleOpen, setCreateVehicleOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingMaintenance, setEditingMaintenance] =
    useState<Maintenance | null>(null);
  const [maintenanceFormOpen, setMaintenanceFormOpen] = useState(false);
  const [editingFuelLog, setEditingFuelLog] = useState<FuelLog | null>(null);
  const [fuelFormOpen, setFuelFormOpen] = useState(false);
  const [editingDocument, setEditingDocument] =
    useState<VehicleDocument | null>(null);
  const [documentFormOpen, setDocumentFormOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const vehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedId) ?? vehicles[0] ?? null,
    [vehicles, selectedId]
  );

  const loadVehicles = useCallback(async () => {
    const list = await fetchVehicles();
    setVehicles(list);
    setSelectedId((current) => {
      if (current && list.some((v) => v.id === current)) return current;
      return list[0]?.id ?? null;
    });
    return list;
  }, []);

  const loadVehicleChildren = useCallback(async (vehicleId: string) => {
    const [allMaint, allFuel, docs] = await Promise.all([
      fetchAllMaintenances(vehicleId),
      fetchAllFuelLogs(vehicleId),
      fetchDocuments(vehicleId),
    ]);
    setAllMaintenances(allMaint);
    setAllFuelLogs(allFuel);
    setDocuments(docs);
    setMaintPage(1);
    setFuelPage(1);
  }, []);

  const clearVehicleChildren = useCallback(() => {
    setAllMaintenances([]);
    setAllFuelLogs([]);
    setDocuments([]);
    setMaintPage(1);
    setFuelPage(1);
  }, []);

  const reloadAll = useCallback(async () => {
    try {
      setLoading(true);
      const list = await loadVehicles();
      const selected = list.find((v) => v.id === selectedId) ?? list[0] ?? null;
      if (selected) {
        await loadVehicleChildren(selected.id);
      } else {
        clearVehicleChildren();
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Falha ao carregar dados do veículo."
        ),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [
    loadVehicles,
    loadVehicleChildren,
    clearVehicleChildren,
    selectedId,
    toast,
  ]);

  // Boot: lista de veículos uma vez.
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        setLoading(true);
        const list = await fetchVehicles();
        if (cancelled) return;
        setVehicles(list);
        setSelectedId((current) => {
          if (current && list.some((v) => v.id === current)) return current;
          return list[0]?.id ?? null;
        });
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Erro",
            description: getErrorMessage(
              error,
              "Falha ao carregar dados do veículo."
            ),
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  // Filhos do veículo selecionado (sem paginado+full duplicado).
  useEffect(() => {
    if (!selectedId) {
      clearVehicleChildren();
      return;
    }
    const vehicleId = selectedId;
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        await loadVehicleChildren(vehicleId);
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Erro",
            description: getErrorMessage(
              error,
              "Falha ao carregar dados do veículo."
            ),
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadVehicleChildren, clearVehicleChildren, toast]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setCreateVehicleOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const maintTotalPages = Math.max(
    1,
    Math.ceil(allMaintenances.length / maintPageSize) || 1
  );
  const maintenances = useMemo(() => {
    const start = (maintPage - 1) * maintPageSize;
    return allMaintenances.slice(start, start + maintPageSize);
  }, [allMaintenances, maintPage, maintPageSize]);

  const fuelLogsSorted = useMemo(
    () =>
      [...allFuelLogs].sort((a, b) => {
        const byDate = (b.date ?? "").localeCompare(a.date ?? "");
        if (byDate !== 0) return byDate;
        return (b.km ?? 0) - (a.km ?? 0);
      }),
    [allFuelLogs]
  );
  const fuelTotalPages = Math.max(
    1,
    Math.ceil(fuelLogsSorted.length / fuelPageSize) || 1
  );
  const fuelLogs = useMemo(() => {
    const start = (fuelPage - 1) * fuelPageSize;
    return fuelLogsSorted.slice(start, start + fuelPageSize);
  }, [fuelLogsSorted, fuelPage, fuelPageSize]);

  const schedule = useMemo(
    () => (vehicle ? getMaintenanceSchedule(vehicle, allMaintenances) : []),
    [vehicle, allMaintenances]
  );

  const maintenanceAlerts = useMemo(
    () => (vehicle ? getMaintenanceAlerts(vehicle, allMaintenances) : []),
    [vehicle, allMaintenances]
  );

  const documentAlerts = useMemo(
    () => getDocumentAlerts(documents),
    [documents]
  );

  const avgConsumption = useMemo(
    () => calculateFuelConsumption(allFuelLogs),
    [allFuelLogs]
  );

  const vehicleStatsLabel = useMemo(() => {
    const bits: string[] = [];
    if (avgConsumption != null) {
      bits.push(`${avgConsumption.toFixed(1).replace(".", ",")} km/l`);
    }
    const alertCount = maintenanceAlerts.length + documentAlerts.length;
    if (alertCount > 0) {
      bits.push(
        `${alertCount} alerta${alertCount === 1 ? "" : "s"}`
      );
    }
    if (vehicles.length > 1) {
      bits.push(`${vehicles.length} veículos`);
    }
    return bits.length > 0
      ? `Manutenções, abastecimentos e documentos · ${bits.join(" · ")}`
      : "Manutenções, abastecimentos e documentos do carro ou da moto.";
  }, [
    avgConsumption,
    maintenanceAlerts.length,
    documentAlerts.length,
    vehicles.length,
  ]);

  async function handleDeleteVehicle() {
    if (!vehicle) return;
    setDeleteLoading(vehicle.id);
    try {
      await deleteVehicle(vehicle.id);
      toast({ title: "Veículo excluído", duration: 2000 });
      setSelectedId(null);
      await reloadAll();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao excluir veículo."),
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(null);
    }
  }

  async function handleDeleteMaintenance(id: string) {
    setDeleteLoading(id);
    try {
      await deleteMaintenance(id);
      toast({
        title: "Manutenção excluída",
        description: "A despesa vinculada em Finanças também foi removida, se havia.",
        duration: 2500,
      });
      if (vehicle) await loadVehicleChildren(vehicle.id);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao excluir."),
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(null);
    }
  }

  async function handleDeleteFuelLog(id: string) {
    setDeleteLoading(id);
    try {
      await deleteFuelLog(id);
      toast({
        title: "Abastecimento excluído",
        description: "A despesa vinculada em Finanças também foi removida, se havia.",
        duration: 2500,
      });
      if (vehicle) await loadVehicleChildren(vehicle.id);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao excluir."),
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(null);
    }
  }

  async function handleDeleteDocument(id: string) {
    setDeleteLoading(id);
    try {
      await deleteDocument(id);
      toast({ title: "Documento excluído", duration: 2000 });
      if (vehicle) await loadVehicleChildren(vehicle.id);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao excluir."),
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(null);
    }
  }

  if (loading && !vehicle) {
    return (
      <PageShell
        title="Veículos"
        description="Controle manutenções, abastecimentos e documentos do carro ou da moto."
      >
        <TableLoadingSkeleton rows={6} />
      </PageShell>
    );
  }

  if (!vehicle) {
    return (
      <PageShell
        title="Veículos"
        description="Controle manutenções, abastecimentos e documentos do carro ou da moto."
        actions={<ModuleGuideButton moduleId="car" />}
      >
        <ModuleGuide moduleId="car" className="mb-4" />
        <EmptyState
          icon={CarIcon}
          title="Nenhum veículo cadastrado"
          description="Cadastre um carro ou uma moto para começar a registrar manutenções e receber alertas."
          action={
            <VehicleFormDialog
              open={createVehicleOpen}
              onOpenChange={setCreateVehicleOpen}
              onSaved={reloadAll}
            />
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Veículos"
      description={vehicleStatsLabel}
      actions={
        <>
          <ModuleGuideButton moduleId="car" />
          <VehicleFormDialog
            open={createVehicleOpen}
            onOpenChange={setCreateVehicleOpen}
            onSaved={reloadAll}
            trigger={
              <Button variant="outline" className="w-full gap-2 sm:w-auto">
                <Plus className="h-4 w-4" />
                Novo veículo
              </Button>
            }
          />
          <MaintenanceFormDialog
            vehicle={vehicle}
            dimensions={dimensions}
            onSaved={() => vehicle && void loadVehicleChildren(vehicle.id)}
          />
        </>
      }
    >
      <ModuleGuide moduleId="car" />
      {vehicles.length > 1 && (
        <Select
          value={vehicle.id}
          onValueChange={(id) => {
            setSelectedId(id);
            setMaintPage(1);
            setFuelPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map((v) => {
              const kind = normalizeVehicleKind(v.kind);
              return (
                <SelectItem key={v.id} value={v.id}>
                  {VEHICLE_KIND_LABELS[kind]} · {v.brand} {v.model}
                  {v.plate ? ` (${v.plate})` : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}

      <CarAlerts
        maintenanceAlerts={maintenanceAlerts}
        documentAlerts={documentAlerts}
      />

      <VehicleCard
        vehicle={vehicle}
        onUpdated={reloadAll}
        onEdit={() => setVehicleFormOpen(true)}
        onDelete={handleDeleteVehicle}
        deleteLoading={deleteLoading === vehicle.id}
      />

      <VehicleFormDialog
        vehicle={vehicle}
        open={vehicleFormOpen}
        onOpenChange={setVehicleFormOpen}
        onSaved={reloadAll}
      />

      <Tabs defaultValue="schedule">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="schedule">Cronograma</TabsTrigger>
          <TabsTrigger value="maintenance">Manutenções</TabsTrigger>
          <TabsTrigger value="fuel">Abastecimentos</TabsTrigger>
          <TabsTrigger value="documents">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Status de cada item de manutenção com base no último registro
            {normalizeVehicleKind(vehicle.kind) === "motorcycle"
              ? " (itens típicos de moto)."
              : "."}
          </p>
          <MaintenanceScheduleGrid items={schedule} />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4 space-y-4">
          <MaintenanceTable
            maintenances={maintenances}
            onEdit={(m) => {
              setEditingMaintenance(m);
              setMaintenanceFormOpen(true);
            }}
            onDelete={handleDeleteMaintenance}
            deleteLoading={deleteLoading}
          />
          {editingMaintenance && (
            <MaintenanceFormDialog
              vehicle={vehicle}
              maintenance={editingMaintenance}
              open={maintenanceFormOpen}
              onOpenChange={(open) => {
                setMaintenanceFormOpen(open);
                if (!open) setEditingMaintenance(null);
              }}
              dimensions={dimensions}
              onSaved={() => {
                setEditingMaintenance(null);
                setMaintenanceFormOpen(false);
                void loadVehicleChildren(vehicle.id);
              }}
            />
          )}
          <Pagination
            page={maintPage}
            pageSize={maintPageSize}
            totalPages={maintTotalPages}
            onSetPage={setMaintPage}
            onSetPageSize={(size) => {
              setMaintPageSize(size);
              setMaintPage(1);
            }}
          />
        </TabsContent>

        <TabsContent value="fuel" className="mt-4 space-y-4">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <FuelLogFormDialog
              vehicle={vehicle}
              existingLogs={allFuelLogs}
              dimensions={dimensions}
              onSaved={() => {
                void loadVehicleChildren(vehicle.id);
              }}
            />
          </div>
          <FuelLogTable
            fuelLogs={fuelLogs}
            avgConsumption={avgConsumption}
            onEdit={(log) => {
              setEditingFuelLog(log);
              setFuelFormOpen(true);
            }}
            onDelete={handleDeleteFuelLog}
            deleteLoading={deleteLoading}
          />
          {editingFuelLog && (
            <FuelLogFormDialog
              vehicle={vehicle}
              fuelLog={editingFuelLog}
              existingLogs={allFuelLogs}
              dimensions={dimensions}
              open={fuelFormOpen}
              onOpenChange={(open) => {
                setFuelFormOpen(open);
                if (!open) setEditingFuelLog(null);
              }}
              onSaved={() => {
                setEditingFuelLog(null);
                setFuelFormOpen(false);
                void loadVehicleChildren(vehicle.id);
              }}
            />
          )}
          <Pagination
            page={fuelPage}
            pageSize={fuelPageSize}
            totalPages={fuelTotalPages}
            onSetPage={setFuelPage}
            onSetPageSize={(size) => {
              setFuelPageSize(size);
              setFuelPage(1);
            }}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-4">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <DocumentFormDialog
              vehicle={vehicle}
              onSaved={() => void loadVehicleChildren(vehicle.id)}
            />
          </div>
          <DocumentList
            documents={documents}
            onEdit={(doc) => {
              setEditingDocument(doc);
              setDocumentFormOpen(true);
            }}
            onDelete={handleDeleteDocument}
            deleteLoading={deleteLoading}
          />
          {editingDocument && (
            <DocumentFormDialog
              vehicle={vehicle}
              document={editingDocument}
              open={documentFormOpen}
              onOpenChange={(open) => {
                setDocumentFormOpen(open);
                if (!open) setEditingDocument(null);
              }}
              onSaved={() => {
                setEditingDocument(null);
                setDocumentFormOpen(false);
                void loadVehicleChildren(vehicle.id);
              }}
            />
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
