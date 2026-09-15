import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type { Project, ProjectStatus } from "@/types/tasks";

const PROJECT_SELECT = "id, name, description, color, status, created_at";

export async function fetchProjects(): Promise<Project[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("project")
    .select(PROJECT_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

export async function fetchProjectById(id: string): Promise<Project | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("project")
    .select(PROJECT_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Project | null) ?? null;
}

export async function createProjectApi(input: {
  name: string;
  description: string;
  color: string | null;
  status?: ProjectStatus;
}): Promise<Project> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("project")
    .insert([
      {
        user_id: userId,
        name: input.name,
        description: input.description,
        color: input.color,
        goal_id: null,
        status: input.status ?? "planned",
        tag_ids: [],
      },
    ])
    .select(PROJECT_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as Project;
}

export async function updateProjectApi(input: {
  id: string;
  name: string;
  description: string;
  color: string | null;
  status?: ProjectStatus;
}): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("project")
    .update({
      name: input.name,
      description: input.description,
      color: input.color,
      ...(input.status ? { status: input.status } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteProjectApi(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("project")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
