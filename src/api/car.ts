import { supabase } from "@/lib/supabase";
import { normalizeVehicleKind } from "@/domain/car";
import { getCurrentUserId } from "@/lib/auth-user";
import { insertTransaction } from "@/api/finance";
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

function normalizeVehicle(row: Vehicle): Vehicle {
  return {
    ...row,
    kind: normalizeVehicleKind(row.kind),
  };
}

async function assertVehicleOwned(vehicleId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("vehicle")
    .select("id")
    .eq("id", vehicleId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Veículo não encontrado.");
}

// ── Vehicle ──────────────────────────────────────────────────────────

export async function fetchVehicles(): Promise<Vehicle[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("vehicle")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => normalizeVehicle(row as Vehicle));
}

export async function createVehicle(
  vehicle: VehicleCreateRequest
): Promise<Vehicle> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("vehicle")
    .insert([
      {
        ...vehicle,
        kind: normalizeVehicleKind(vehicle.kind),
        user_id: userId,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return normalizeVehicle(data as Vehicle);
}

export async function updateVehicle(
  updateData: VehicleUpdateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = updateData;
  const { error } = await supabase
    .from("vehicle")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

export async function deleteVehicle(id: string): Promise<void> {
  await assertVehicleOwned(id);

  const [{ data: maintenances }, { data: fuelLogs }] = await Promise.all([
    supabase
      .from("vehicle_maintenance")
      .select("transaction_id")
      .eq("vehicle_id", id),
    supabase
      .from("vehicle_fuel_log")
      .select("transaction_id")
      .eq("vehicle_id", id),
  ]);

  const txIds = [
    ...(maintenances ?? []),
    ...(fuelLogs ?? []),
  ]
    .map((row) => row.transaction_id as number | null)
    .filter((tid): tid is number => tid != null);

  const related = await Promise.all([
    supabase.from("vehicle_maintenance").delete().eq("vehicle_id", id),
    supabase.from("vehicle_fuel_log").delete().eq("vehicle_id", id),
    supabase.from("vehicle_document").delete().eq("vehicle_id", id),
  ]);

  for (const result of related) {
    if (result.error) throw new Error(result.error.message);
  }

  if (txIds.length) {
    const { error: txError } = await supabase
      .from("transaction")
      .delete()
      .in("id", txIds);
    if (txError) throw new Error(txError.message);
  }

  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("vehicle")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// ── Maintenance ──────────────────────────────────────────────────────

export async function fetchMaintenances(
  vehicleId: string,
  page = 1,
  pageSize = 20
): Promise<{ data: Maintenance[]; total: number }> {
  await assertVehicleOwned(vehicleId);
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
  await assertVehicleOwned(vehicleId);
  const { data, error } = await supabase
    .from("vehicle_maintenance")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("service_date", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Uma query para vários veículos (alerts / timeline). */
export async function fetchMaintenancesForVehicles(
  vehicleIds: string[]
): Promise<Maintenance[]> {
  if (vehicleIds.length === 0) return [];
  const userId = await getCurrentUserId();
  const { data: owned, error: ownedError } = await supabase
    .from("vehicle")
    .select("id")
    .eq("user_id", userId)
    .in("id", vehicleIds);
  if (ownedError) throw new Error(ownedError.message);
  const ids = (owned ?? []).map((v) => v.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("vehicle_maintenance")
    .select("*")
    .in("vehicle_id", ids)
    .order("service_date", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createMaintenance(
  maintenance: MaintenanceCreateRequest,
  transaction?: TransactionCreateRequest | null
): Promise<Maintenance> {
  await assertVehicleOwned(maintenance.vehicle_id);
  let transactionId: number | null = null;

  if (transaction && transaction.class_id > 0 && transaction.value > 0) {
    transactionId = await insertTransaction(transaction);
  }

  const { data, error } = await supabase
    .from("vehicle_maintenance")
    .insert([{ ...maintenance, transaction_id: transactionId }])
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (maintenance.km_at_service > 0) {
    await bumpVehicleKm(maintenance.vehicle_id, maintenance.km_at_service);
  }

  return data;
}

export async function updateMaintenance(
  updateData: MaintenanceUpdateRequest,
  options?: {
    syncTransaction?: {
      value: number;
      description: string;
      transaction_at: string;
      class_id?: number;
    } | null;
  }
): Promise<void> {
  const { id, ...fields } = updateData;

  const { data: existing, error: fetchError } = await supabase
    .from("vehicle_maintenance")
    .select("transaction_id, vehicle_id")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);
  await assertVehicleOwned(existing.vehicle_id);

  const { error } = await supabase
    .from("vehicle_maintenance")
    .update(fields)
    .eq("id", id);

  if (error) throw new Error(error.message);

  const transactionId = existing?.transaction_id as number | null | undefined;
  if (transactionId && options?.syncTransaction) {
    const userId = await getCurrentUserId();
    const payload: Record<string, unknown> = {
      value: options.syncTransaction.value,
      description: options.syncTransaction.description,
      transaction_at: options.syncTransaction.transaction_at,
    };
    if (options.syncTransaction.class_id) {
      payload.class_id = options.syncTransaction.class_id;
    }
    const { error: txError } = await supabase
      .from("transaction")
      .update(payload)
      .eq("id", transactionId)
      .eq("user_id", userId);
    if (txError) throw new Error(txError.message);
  }
}

export async function deleteMaintenance(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("vehicle_maintenance")
    .select("transaction_id, vehicle_id")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);
  await assertVehicleOwned(existing.vehicle_id);

  const { error } = await supabase
    .from("vehicle_maintenance")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  const transactionId = existing?.transaction_id as number | null | undefined;
  if (transactionId) {
    const userId = await getCurrentUserId();
    const { error: txError } = await supabase
      .from("transaction")
      .delete()
      .eq("id", transactionId)
      .eq("user_id", userId);
    if (txError) throw new Error(txError.message);
  }
}

// ── Fuel logs ────────────────────────────────────────────────────────

export async function fetchFuelLogs(
  vehicleId: string,
  page = 1,
  pageSize = 20
): Promise<{ data: FuelLog[]; total: number }> {
  await assertVehicleOwned(vehicleId);
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
  await assertVehicleOwned(vehicleId);
  const { data, error } = await supabase
    .from("vehicle_fuel_log")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("km", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createFuelLog(
  fuelLog: FuelLogCreateRequest,
  options?: {
    transaction?: TransactionCreateRequest | null;
    updateVehicleKm?: boolean;
  }
): Promise<FuelLog> {
  await assertVehicleOwned(fuelLog.vehicle_id);
  let transactionId: number | null = fuelLog.transaction_id ?? null;

  if (
    options?.transaction &&
    options.transaction.class_id > 0 &&
    options.transaction.value > 0
  ) {
    transactionId = await insertTransaction(options.transaction);
  }

  const { data, error } = await supabase
    .from("vehicle_fuel_log")
    .insert([{ ...fuelLog, transaction_id: transactionId }])
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (options?.updateVehicleKm !== false) {
    await bumpVehicleKm(fuelLog.vehicle_id, fuelLog.km);
  }

  return data;
}

export async function updateFuelLog(
  updateData: FuelLogUpdateRequest,
  options?: {
    updateVehicleKm?: boolean;
    /** Atualiza a despesa vinculada (valor, data, descrição). */
    syncTransaction?: {
      value: number;
      description: string;
      transaction_at: string;
      class_id?: number;
    } | null;
  }
): Promise<void> {
  const { id, ...fields } = updateData;

  const { data: existing, error: fetchError } = await supabase
    .from("vehicle_fuel_log")
    .select("vehicle_id, transaction_id")
    .eq("id", id)
    .single();

  if (fetchError) throw new Error(fetchError.message);
  await assertVehicleOwned(existing.vehicle_id);

  const { error } = await supabase
    .from("vehicle_fuel_log")
    .update(fields)
    .eq("id", id);

  if (error) throw new Error(error.message);

  const vehicleId =
    (fields.vehicle_id as string | undefined) ??
    (existing?.vehicle_id as string | undefined);
  const km = fields.km as number | undefined;
  if (options?.updateVehicleKm !== false && vehicleId && km != null) {
    await bumpVehicleKm(vehicleId, km);
  }

  const transactionId = existing?.transaction_id as number | null | undefined;
  if (transactionId && options?.syncTransaction) {
    const userId = await getCurrentUserId();
    const payload: Record<string, unknown> = {
      value: options.syncTransaction.value,
      description: options.syncTransaction.description,
      transaction_at: options.syncTransaction.transaction_at,
    };
    if (options.syncTransaction.class_id) {
      payload.class_id = options.syncTransaction.class_id;
    }
    const { error: txError } = await supabase
      .from("transaction")
      .update(payload)
      .eq("id", transactionId)
      .eq("user_id", userId);
    if (txError) throw new Error(txError.message);
  }
}

/** Atualiza km do veículo se o valor informado for maior que o atual. */
async function bumpVehicleKm(vehicleId: string, km: number): Promise<void> {
  if (km <= 0) return;
  const { data, error } = await supabase
    .from("vehicle")
    .select("current_km")
    .eq("id", vehicleId)
    .single();
  if (error) throw new Error(error.message);
  const current = (data?.current_km as number | null) ?? 0;
  if (km > current) {
    await updateVehicle({ id: vehicleId, current_km: km });
  }
}

export async function deleteFuelLog(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("vehicle_fuel_log")
    .select("transaction_id, vehicle_id")
    .eq("id", id)
    .single();

  if (fetchError) throw new Error(fetchError.message);
  await assertVehicleOwned(existing.vehicle_id);

  const { error } = await supabase.from("vehicle_fuel_log").delete().eq("id", id);
  if (error) throw new Error(error.message);

  const transactionId = existing?.transaction_id as number | null | undefined;
  if (transactionId) {
    const userId = await getCurrentUserId();
    const { error: txError } = await supabase
      .from("transaction")
      .delete()
      .eq("id", transactionId)
      .eq("user_id", userId);
    if (txError) throw new Error(txError.message);
  }
}

// ── Documents ──────────────────────────────────────────────────────

export async function fetchDocuments(vehicleId: string): Promise<VehicleDocument[]> {
  await assertVehicleOwned(vehicleId);
  const { data, error } = await supabase
    .from("vehicle_document")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("due_date", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Uma query para vários veículos (alerts / timeline). */
export async function fetchDocumentsForVehicles(
  vehicleIds: string[]
): Promise<VehicleDocument[]> {
  if (vehicleIds.length === 0) return [];
  const userId = await getCurrentUserId();
  const { data: owned, error: ownedError } = await supabase
    .from("vehicle")
    .select("id")
    .eq("user_id", userId)
    .in("id", vehicleIds);
  if (ownedError) throw new Error(ownedError.message);
  const ids = (owned ?? []).map((v) => v.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("vehicle_document")
    .select("*")
    .in("vehicle_id", ids)
    .order("due_date", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createDocument(
  document: VehicleDocumentCreateRequest
): Promise<VehicleDocument> {
  await assertVehicleOwned(document.vehicle_id);
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
  const { data: existing, error: fetchError } = await supabase
    .from("vehicle_document")
    .select("vehicle_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Documento não encontrado.");
  await assertVehicleOwned(existing.vehicle_id);

  const { error } = await supabase
    .from("vehicle_document")
    .update(fields)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteDocument(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("vehicle_document")
    .select("vehicle_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Documento não encontrado.");
  await assertVehicleOwned(existing.vehicle_id);

  const { error } = await supabase.from("vehicle_document").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
