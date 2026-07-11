import { supabase } from "@/lib/supabase";
import type { TransactionCreateRequest } from "@/types/finance";
import type {
  FuelLog,
  FuelLogCreateRequest,
  FuelLogUpdateRequest,
  Maintenance,
  MaintenanceCreateRequest,
  MaintenanceUpdateRequest,
  Vehicle,
  VehicleCreateRequest,
  VehicleDocument,
  VehicleDocumentCreateRequest,
  VehicleDocumentUpdateRequest,
  VehicleUpdateRequest,
} from "@/types/car";

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Usuário não autenticado.");
  return user.id;
}

// ── Vehicle ──────────────────────────────────────────────────────────

export async function fetchVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from("vehicle")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createVehicle(
  vehicle: VehicleCreateRequest
): Promise<Vehicle> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("vehicle")
    .insert([{ ...vehicle, user_id: userId }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateVehicle(
  updateData: VehicleUpdateRequest
): Promise<void> {
  const { id, ...fields } = updateData;
  const { error } = await supabase
    .from("vehicle")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from("vehicle").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Maintenance ──────────────────────────────────────────────────────

export async function fetchMaintenances(
  vehicleId: string,
  page = 1,
  pageSize = 20
): Promise<{ data: Maintenance[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("vehicle_maintenance")
    .select("*", { count: "exact" })
    .eq("vehicle_id", vehicleId)
    .order("service_date", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { data: data ?? [], total: count ?? 0 };
}

export async function fetchAllMaintenances(
  vehicleId: string
): Promise<Maintenance[]> {
  const { data, error } = await supabase
    .from("vehicle_maintenance")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("service_date", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createMaintenance(
  maintenance: MaintenanceCreateRequest,
  transaction?: TransactionCreateRequest | null
): Promise<Maintenance> {
  let transactionId: number | null = null;

  if (transaction && transaction.class_id > 0 && transaction.value > 0) {
    const { data: txData, error: txError } = await supabase
      .from("transaction")
      .insert([transaction])
      .select("id")
      .single();

    if (txError) throw new Error(txError.message);
    transactionId = txData?.id ?? null;
  }

  const { data, error } = await supabase
    .from("vehicle_maintenance")
    .insert([{ ...maintenance, transaction_id: transactionId }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateMaintenance(
  updateData: MaintenanceUpdateRequest
): Promise<void> {
  const { id, ...fields } = updateData;
  const { error } = await supabase
    .from("vehicle_maintenance")
    .update(fields)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteMaintenance(id: string): Promise<void> {
  const { error } = await supabase
    .from("vehicle_maintenance")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

// ── Fuel logs ────────────────────────────────────────────────────────

export async function fetchFuelLogs(
  vehicleId: string,
  page = 1,
  pageSize = 20
): Promise<{ data: FuelLog[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("vehicle_fuel_log")
    .select("*", { count: "exact" })
    .eq("vehicle_id", vehicleId)
    .order("date", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { data: data ?? [], total: count ?? 0 };
}

export async function fetchAllFuelLogs(vehicleId: string): Promise<FuelLog[]> {
  const { data, error } = await supabase
    .from("vehicle_fuel_log")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("km", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createFuelLog(
  fuelLog: FuelLogCreateRequest
): Promise<FuelLog> {
  const { data, error } = await supabase
    .from("vehicle_fuel_log")
    .insert([fuelLog])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateFuelLog(
  updateData: FuelLogUpdateRequest
): Promise<void> {
  const { id, ...fields } = updateData;
  const { error } = await supabase
    .from("vehicle_fuel_log")
    .update(fields)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteFuelLog(id: string): Promise<void> {
  const { error } = await supabase.from("vehicle_fuel_log").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Documents ──────────────────────────────────────────────────────

export async function fetchDocuments(vehicleId: string): Promise<VehicleDocument[]> {
  const { data, error } = await supabase
    .from("vehicle_document")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("due_date", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createDocument(
  document: VehicleDocumentCreateRequest
): Promise<VehicleDocument> {
  const { data, error } = await supabase
    .from("vehicle_document")
    .insert([document])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateDocument(
  updateData: VehicleDocumentUpdateRequest
): Promise<void> {
  const { id, ...fields } = updateData;
  const { error } = await supabase
    .from("vehicle_document")
    .update(fields)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase.from("vehicle_document").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
