import { createTransaction, deleteTransaction } from "@/api/finance/transactions";
import { normalizeVehicleKind } from "@/domain/car";
import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type {
  FuelLog,
  FuelType,
  Maintenance,
  Vehicle,
  VehicleDocument,
  VehicleKind,
} from "@/types/car";

function normalizeVehicle(row: Vehicle): Vehicle {
  return { ...row, kind: normalizeVehicleKind(row.kind) };
}

export async function fetchVehicles(): Promise<Vehicle[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("vehicle")
    .select(
      "id, user_id, kind, brand, model, year, plate, color, current_km, fuel_type, notes"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Vehicle[]).map(normalizeVehicle);
}

export async function fetchFleetOverview(): Promise<{
  vehicles: Vehicle[];
  documents: VehicleDocument[];
  maintenances: Maintenance[];
  fuelLogs: FuelLog[];
}> {
  const vehicles = await fetchVehicles();
  const ids = vehicles.map((row) => row.id);
  if (ids.length === 0) {
    return { vehicles, documents: [], maintenances: [], fuelLogs: [] };
  }
  const [docs, maint, fuel] = await Promise.all([
    supabase
      .from("vehicle_document")
      .select("id, vehicle_id, type, custom_type, due_date, paid")
      .in("vehicle_id", ids)
      .order("due_date", { ascending: true }),
    supabase
      .from("vehicle_maintenance")
      .select(
        "id, vehicle_id, type, custom_type, service_date, km_at_service, next_km, next_date, cost, transaction_id"
      )
      .in("vehicle_id", ids)
      .order("service_date", { ascending: false }),
    supabase
      .from("vehicle_fuel_log")
      .select("id, vehicle_id, date, liters, total_cost, km, station, transaction_id")
      .in("vehicle_id", ids)
      .order("date", { ascending: false }),
  ]);
  if (docs.error) throw new Error(docs.error.message);
  if (maint.error) throw new Error(maint.error.message);
  if (fuel.error) throw new Error(fuel.error.message);
  return {
    vehicles,
    documents: (docs.data ?? []) as VehicleDocument[],
    maintenances: (maint.data ?? []) as Maintenance[],
    fuelLogs: (fuel.data ?? []) as FuelLog[],
  };
}

export async function fetchVehicleById(id: string): Promise<Vehicle | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("vehicle")
    .select(
      "id, user_id, kind, brand, model, year, plate, color, current_km, fuel_type, notes"
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeVehicle(data as Vehicle) : null;
}

export async function fetchVehicleAlerts(vehicleId: string): Promise<{
  documents: VehicleDocument[];
  maintenances: Maintenance[];
}> {
  const [docs, maint] = await Promise.all([
    supabase
      .from("vehicle_document")
      .select("id, vehicle_id, type, custom_type, due_date, paid")
      .eq("vehicle_id", vehicleId)
      .order("due_date", { ascending: true }),
    supabase
      .from("vehicle_maintenance")
      .select(
        "id, vehicle_id, type, custom_type, service_date, km_at_service, next_km, next_date, cost, transaction_id"
      )
      .eq("vehicle_id", vehicleId)
      .order("service_date", { ascending: false }),
  ]);
  if (docs.error) throw new Error(docs.error.message);
  if (maint.error) throw new Error(maint.error.message);
  return {
    documents: (docs.data ?? []) as VehicleDocument[],
    maintenances: (maint.data ?? []) as Maintenance[],
  };
}

async function assertVehicleOwned(id: string): Promise<Vehicle> {
  const vehicle = await fetchVehicleById(id);
  if (!vehicle) throw new Error("Veículo não encontrado.");
  return vehicle;
}

async function bumpVehicleKm(vehicleId: string, km: number): Promise<void> {
  if (km <= 0) return;
  const vehicle = await fetchVehicleById(vehicleId);
  if (!vehicle) return;
  if (km > vehicle.current_km) {
    await updateVehicle({ id: vehicleId, current_km: km });
  }
}

export async function createVehicle(input: {
  kind: VehicleKind;
  brand: string;
  model: string;
  year?: number | null;
  plate?: string | null;
  color?: string | null;
  current_km: number;
  fuel_type?: FuelType | null;
  notes?: string | null;
}): Promise<Vehicle> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("vehicle")
    .insert([
      {
        ...input,
        kind: normalizeVehicleKind(input.kind),
        brand: input.brand.trim(),
        model: input.model.trim(),
        plate: input.plate?.trim() || null,
        color: input.color?.trim() || null,
        notes: input.notes?.trim() || null,
        user_id: userId,
      },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return normalizeVehicle(data as Vehicle);
}

export async function updateVehicle(input: {
  id: string;
  kind?: VehicleKind;
  brand?: string;
  model?: string;
  year?: number | null;
  plate?: string | null;
  color?: string | null;
  current_km?: number;
  fuel_type?: FuelType | null;
  notes?: string | null;
}): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = input;
  const payload: Record<string, unknown> = {
    ...fields,
    updated_at: new Date().toISOString(),
  };
  if (fields.brand != null) payload.brand = fields.brand.trim();
  if (fields.model != null) payload.model = fields.model.trim();
  if (fields.kind != null) payload.kind = normalizeVehicleKind(fields.kind);
  const { error } = await supabase
    .from("vehicle")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteVehicle(id: string): Promise<void> {
  await assertVehicleOwned(id);
  const related = await Promise.all([
    supabase.from("vehicle_maintenance").delete().eq("vehicle_id", id),
    supabase.from("vehicle_fuel_log").delete().eq("vehicle_id", id),
    supabase.from("vehicle_document").delete().eq("vehicle_id", id),
  ]);
  for (const result of related) {
    if (result.error) throw new Error(result.error.message);
  }
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("vehicle")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function fetchFuelLogs(vehicleId: string): Promise<FuelLog[]> {
  const { data, error } = await supabase
    .from("vehicle_fuel_log")
    .select("id, vehicle_id, date, liters, total_cost, km, station")
    .eq("vehicle_id", vehicleId)
    .order("date", { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);
  return (data ?? []) as FuelLog[];
}

export async function createMaintenance(input: {
  vehicle_id: string;
  type: string;
  custom_type?: string | null;
  service_date: string;
  km_at_service: number;
  next_km?: number | null;
  next_date?: string | null;
  cost?: number | null;
  classId?: number | null;
}): Promise<Maintenance> {
  await assertVehicleOwned(input.vehicle_id);
  const { classId, ...rest } = input;
  let transactionId: number | null = null;
  if (classId && rest.cost && rest.cost > 0) {
    transactionId = await createTransaction({
      class_id: classId,
      value: rest.cost,
      description: `Veículo: ${rest.custom_type || rest.type}`,
      transaction_at: rest.service_date,
    });
  }
  const { data, error } = await supabase
    .from("vehicle_maintenance")
    .insert([{ ...rest, transaction_id: transactionId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (input.km_at_service > 0) {
    await bumpVehicleKm(input.vehicle_id, input.km_at_service);
  }
  return data as Maintenance;
}

export async function fetchMaintenanceById(id: string): Promise<Maintenance | null> {
  const { data, error } = await supabase
    .from("vehicle_maintenance")
    .select(
      "id, vehicle_id, type, custom_type, service_date, km_at_service, next_km, next_date, cost, transaction_id"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Maintenance | null) ?? null;
}

export async function updateMaintenance(input: {
  id: string;
  type: string;
  custom_type?: string | null;
  service_date: string;
  km_at_service: number;
  next_km?: number | null;
  next_date?: string | null;
  cost?: number | null;
}): Promise<void> {
  const existing = await fetchMaintenanceById(input.id);
  if (!existing) throw new Error("Manutenção não encontrada.");
  await assertVehicleOwned(existing.vehicle_id);
  const { id, ...fields } = input;
  const { error } = await supabase
    .from("vehicle_maintenance")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (existing.transaction_id && fields.cost != null) {
    const userId = await getCurrentUserId();
    const { error: txError } = await supabase
      .from("transaction")
      .update({
        value: fields.cost,
        description: `Veículo: ${fields.custom_type || fields.type}`,
        transaction_at: fields.service_date,
      })
      .eq("id", existing.transaction_id)
      .eq("user_id", userId);
    if (txError) throw new Error(txError.message);
  }
  if (input.km_at_service > 0) {
    await bumpVehicleKm(existing.vehicle_id, input.km_at_service);
  }
}

export async function deleteMaintenance(id: string): Promise<void> {
  const existing = await fetchMaintenanceById(id);
  const { error } = await supabase
    .from("vehicle_maintenance")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (existing?.transaction_id) {
    await deleteTransaction(existing.transaction_id).catch(() => undefined);
  }
}

export async function createFuelLog(input: {
  vehicle_id: string;
  date: string;
  liters: number;
  total_cost: number;
  km: number;
  station?: string | null;
  classId?: number | null;
}): Promise<FuelLog> {
  await assertVehicleOwned(input.vehicle_id);
  const { classId, ...rest } = input;
  let transactionId: number | null = null;
  if (classId && rest.total_cost > 0) {
    transactionId = await createTransaction({
      class_id: classId,
      value: rest.total_cost,
      description: rest.station
        ? `Abastecimento · ${rest.station}`
        : "Abastecimento",
      transaction_at: rest.date,
    });
  }
  const { data, error } = await supabase
    .from("vehicle_fuel_log")
    .insert([{ ...rest, transaction_id: transactionId }])
    .select("id, vehicle_id, date, liters, total_cost, km, station, transaction_id")
    .single();
  if (error) throw new Error(error.message);
  await bumpVehicleKm(input.vehicle_id, input.km);
  return data as FuelLog;
}

export async function fetchFuelLogById(id: string): Promise<FuelLog | null> {
  const { data, error } = await supabase
    .from("vehicle_fuel_log")
    .select("id, vehicle_id, date, liters, total_cost, km, station, transaction_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FuelLog | null) ?? null;
}

export async function updateFuelLog(input: {
  id: string;
  date: string;
  liters: number;
  total_cost: number;
  km: number;
  station?: string | null;
}): Promise<void> {
  const existing = await fetchFuelLogById(input.id);
  if (!existing) throw new Error("Abastecimento não encontrado.");
  await assertVehicleOwned(existing.vehicle_id);
  const { id, ...fields } = input;
  const { error } = await supabase
    .from("vehicle_fuel_log")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (existing.transaction_id) {
    const userId = await getCurrentUserId();
    const { error: txError } = await supabase
      .from("transaction")
      .update({
        value: fields.total_cost,
        description: fields.station
          ? `Abastecimento · ${fields.station}`
          : "Abastecimento",
        transaction_at: fields.date,
      })
      .eq("id", existing.transaction_id)
      .eq("user_id", userId);
    if (txError) throw new Error(txError.message);
  }
  await bumpVehicleKm(existing.vehicle_id, input.km);
}

export async function deleteFuelLog(id: string): Promise<void> {
  const existing = await fetchFuelLogById(id);
  const { error } = await supabase.from("vehicle_fuel_log").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (existing?.transaction_id) {
    await deleteTransaction(existing.transaction_id).catch(() => undefined);
  }
}

export async function createDocument(input: {
  vehicle_id: string;
  type: string;
  custom_type?: string | null;
  due_date: string;
  paid?: boolean;
}): Promise<VehicleDocument> {
  await assertVehicleOwned(input.vehicle_id);
  const { data, error } = await supabase
    .from("vehicle_document")
    .insert([
      {
        ...input,
        paid: input.paid ?? false,
      },
    ])
    .select("id, vehicle_id, type, custom_type, due_date, paid")
    .single();
  if (error) throw new Error(error.message);
  return data as VehicleDocument;
}

export async function fetchDocumentById(
  id: string
): Promise<VehicleDocument | null> {
  const { data, error } = await supabase
    .from("vehicle_document")
    .select("id, vehicle_id, type, custom_type, due_date, paid")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as VehicleDocument | null) ?? null;
}

export async function updateDocument(input: {
  id: string;
  type: string;
  custom_type?: string | null;
  due_date: string;
}): Promise<void> {
  const { id, ...fields } = input;
  const { error } = await supabase
    .from("vehicle_document")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateDocumentPaid(
  id: string,
  paid: boolean
): Promise<void> {
  const { error } = await supabase
    .from("vehicle_document")
    .update({
      paid,
      paid_date: paid ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase.from("vehicle_document").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
