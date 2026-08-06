import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type {
  Project,
  ProjectCreateRequest,
  ProjectUpdateRequest,
} from "@/types/tasks";

export async function fetchProjects(): Promise<Project[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("project")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchProjectById(id: string): Promise<Project | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("project")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createProject(
  project: ProjectCreateRequest
): Promise<Project> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("project")
    .insert([{ ...project, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateProject(data: ProjectUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("project")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteProject(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("project")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
