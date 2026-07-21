import { useCallback, useEffect, useMemo, useState } from "react";
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
  fetchFuelLogs,
  fetchMaintenances,
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
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [allFuelLogs, setAllFuelLogs] = useState<FuelLog[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);

  const [maintPage, setMaintPage] = useState(1);
  const [maintPageSize, setMaintPageSize] = useState(10);
  const [maintTotalPages, setMaintTotalPages] = useState(0);

  const [fuelPage, setFuelPage] = useState(1);
  const [fuelPageSize, setFuelPageSize] = useState(10);
  const [fuelTotalPages, setFuelTotalPages] = useState(0);

  const [vehicleFormOpen, setVehicleFormOpen] = useState(false);
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

  const loadMaintenances = useCallback(
    async (vehicleId: string) => {
      const [paginated, all] = await Promise.all([
        fetchMaintenances(vehicleId, maintPage, maintPageSize),
        fetchAllMaintenances(vehicleId),
      ]);
      setMaintenances(paginated.data);
      setMaintTotalPages(Math.ceil(paginated.total / maintPageSize));
      setAllMaintenances(all);
    },
    [maintPage, maintPageSize]
  );

  const loadFuelLogs = useCallback(
    async (vehicleId: string) => {
      const [paginated, all] = await Promise.all([
        fetchFuelLogs(vehicleId, fuelPage, fuelPageSize),
        fetchAllFuelLogs(vehicleId),
      ]);
      setFuelLogs(paginated.data);
      setFuelTotalPages(Math.ceil(paginated.total / fuelPageSize));
      setAllFuelLogs(all);
    },
    [fuelPage, fuelPageSize]
  );

  const loadDocuments = useCallback(async (vehicleId: string) => {
    const docs = await fetchDocuments(vehicleId);
    setDocuments(docs);
  }, []);

  const reloadAll = useCallback(async () => {
    try {
      setLoading(true);
      const list = await loadVehicles();
      const selected = list.find((v) => v.id === selectedId) ?? list[0] ?? null;
      if (selected) {
        await Promise.all([
          loadMaintenances(selected.id),
          loadFuelLogs(selected.id),
          loadDocuments(selected.id),
        ]);
      } else {
        setMaintenances([]);
        setAllMaintenances([]);
        setFuelLogs([]);
        setAllFuelLogs([]);
        setDocuments([]);
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
    loadMaintenances,
    loadFuelLogs,
    loadDocuments,
    selectedId,
    toast,
  ]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    if (!vehicle) return;
    void Promise.all([
      loadMaintenances(vehicle.id),
      loadFuelLogs(vehicle.id),
      loadDocuments(vehicle.id),
    ]);
  }, [vehicle?.id, loadMaintenances, loadFuelLogs, loadDocuments]);

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
      if (vehicle) await loadMaintenances(vehicle.id);
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
      if (vehicle) await loadFuelLogs(vehicle.id);
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
      if (vehicle) await loadDocuments(vehicle.id);
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
      >
        <EmptyState
          icon={CarIcon}
          title="Nenhum veículo cadastrado"
          description="Cadastre um carro ou uma moto para começar a registrar manutenções e receber alertas."
          action={<VehicleFormDialog onSaved={reloadAll} />}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Veículos"
      description="Manutenções, abastecimentos e documentos do carro ou da moto."
      actions={
        <>
          <VehicleFormDialog
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
            onSaved={() => vehicle && loadMaintenances(vehicle.id)}
          />
        </>
      }
    >
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
                void loadMaintenances(vehicle.id);
              }}
            />
          )}
          <Pagination
            page={maintPage}
            pageSize={maintPageSize}
            totalPages={maintTotalPages}
            onSetPage={setMaintPage}
            onSetPageSize={setMaintPageSize}
          />
        </TabsContent>

        <TabsContent value="fuel" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <FuelLogFormDialog
              vehicle={vehicle}
              existingLogs={allFuelLogs}
              dimensions={dimensions}
              onSaved={() => {
                void loadFuelLogs(vehicle.id);
                void reloadAll();
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
                void loadFuelLogs(vehicle.id);
                void reloadAll();
              }}
            />
          )}
          <Pagination
            page={fuelPage}
            pageSize={fuelPageSize}
            totalPages={fuelTotalPages}
            onSetPage={setFuelPage}
            onSetPageSize={setFuelPageSize}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <DocumentFormDialog
              vehicle={vehicle}
              onSaved={() => void loadDocuments(vehicle.id)}
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
                void loadDocuments(vehicle.id);
              }}
            />
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
