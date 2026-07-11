import { useCallback, useEffect, useMemo, useState } from "react";
import { Car as CarIcon } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";
import { EmptyState } from "@/components/EmptyState";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import Pagination from "../finance/components/Pagination";
import { useToast } from "@/hooks/use-toast";
import { useDimensions } from "@/hooks/useDimensions";
import { getErrorMessage } from "@/lib/errors";
import {
  calculateFuelConsumption,
  getDocumentAlerts,
  getMaintenanceAlerts,
  getMaintenanceSchedule,
} from "@/domain/car";
import {
  deleteDocument,
  deleteFuelLog,
  deleteMaintenance,
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
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
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

  const loadVehicle = useCallback(async () => {
    const vehicles = await fetchVehicles();
    setVehicle(vehicles[0] ?? null);
    return vehicles[0] ?? null;
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
      const v = await loadVehicle();
      if (v) {
        await Promise.all([
          loadMaintenances(v.id),
          loadFuelLogs(v.id),
          loadDocuments(v.id),
        ]);
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao carregar dados do carro."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [loadVehicle, loadMaintenances, loadFuelLogs, loadDocuments, toast]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    if (vehicle) loadMaintenances(vehicle.id);
  }, [vehicle, loadMaintenances]);

  useEffect(() => {
    if (vehicle) loadFuelLogs(vehicle.id);
  }, [vehicle, loadFuelLogs]);

  const schedule = useMemo(
    () =>
      vehicle
        ? getMaintenanceSchedule(vehicle, allMaintenances)
        : [],
    [vehicle, allMaintenances]
  );

  const maintenanceAlerts = useMemo(
    () =>
      vehicle
        ? getMaintenanceAlerts(vehicle, allMaintenances)
        : [],
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

  async function handleDeleteMaintenance(id: string) {
    setDeleteLoading(id);
    try {
      await deleteMaintenance(id);
      toast({ title: "Manutenção excluída", duration: 2000 });
      if (vehicle) {
        await loadMaintenances(vehicle.id);
      }
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
      toast({ title: "Abastecimento excluído", duration: 2000 });
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

  if (loading) {
    return (
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <TableLoadingSkeleton rows={6} />
      </main>
    );
  }

  if (!vehicle) {
    return (
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <section className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Carro</h1>
          <p className="text-sm text-muted-foreground">
            Controle manutenções, abastecimentos e documentos do seu veículo.
          </p>
        </section>
        <EmptyState
          icon={CarIcon}
          title="Nenhum veículo cadastrado"
          description="Cadastre seu carro para começar a registrar manutenções e receber alertas de troca."
        />
        <div className="mt-6 flex justify-center">
          <VehicleFormDialog onSaved={reloadAll} />
        </div>
      </main>
    );
  }

  return (
    <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 overflow-x-hidden">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Carro</h1>
          <p className="text-sm text-muted-foreground">
            Controle quando trocar óleo, pneus, freios e outros itens.
          </p>
        </div>
        <div className={PAGE_HEADER_ACTIONS_CLASS}>
          <MaintenanceFormDialog
            vehicle={vehicle}
            dimensions={dimensions}
            onSaved={() => vehicle && loadMaintenances(vehicle.id)}
          />
        </div>
      </section>

      <CarAlerts
        maintenanceAlerts={maintenanceAlerts}
        documentAlerts={documentAlerts}
      />

      <VehicleCard
        vehicle={vehicle}
        onUpdated={reloadAll}
        onEdit={() => setVehicleFormOpen(true)}
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
            Status de cada item de manutenção com base no último registro.
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
                loadMaintenances(vehicle.id);
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
              onSaved={() => loadFuelLogs(vehicle.id)}
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
              open={fuelFormOpen}
              onOpenChange={(open) => {
                setFuelFormOpen(open);
                if (!open) setEditingFuelLog(null);
              }}
              onSaved={() => {
                setEditingFuelLog(null);
                setFuelFormOpen(false);
                loadFuelLogs(vehicle.id);
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
              onSaved={() => loadDocuments(vehicle.id)}
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
                loadDocuments(vehicle.id);
              }}
            />
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
