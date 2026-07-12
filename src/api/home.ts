import { supabase } from "@/lib/supabase";
import type {
  HomeMaintenance,
  HomeMaintenanceCreateRequest,
  HomeMaintenanceUpdateRequest,
  HomeProfile,
  HomeProfileCreateRequest,
  HomeProfileUpdateRequest,
} from "@/types/home";

async function getCurrentUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Usuário não autenticado.");
  return user.id;
}

export async function fetchHomeProfiles(): Promise<HomeProfile[]> {
  const { data, error } = await supabase
    .from("home_profile")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createHomeProfile(
  profile: HomeProfileCreateRequest
): Promise<HomeProfile> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("home_profile")
    .insert([{ ...profile, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateHomeProfile(
  data: HomeProfileUpdateRequest
): Promise<void> {
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("home_profile")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchHomeMaintenances(
  homeId: string
): Promise<HomeMaintenance[]> {
  const { data, error } = await supabase
    .from("home_maintenance")
    .select("*")
    .eq("home_id", homeId)
    .order("service_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createHomeMaintenance(
  maintenance: HomeMaintenanceCreateRequest
): Promise<HomeMaintenance> {
  const { data, error } = await supabase
    .from("home_maintenance")
    .insert([maintenance])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateHomeMaintenance(
  data: HomeMaintenanceUpdateRequest
): Promise<void> {
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("home_maintenance")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteHomeMaintenance(id: string): Promise<void> {
  const { error } = await supabase.from("home_maintenance").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
