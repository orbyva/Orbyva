import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type { TaskDependency } from "@/types/tasks";

export async function fetchDependencies(): Promise<TaskDependency[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_dependency")
    .select("task_id, depends_on_task_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createDependency(
  taskId: string,
  dependsOnTaskId: string
): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("task_dependency").insert([
    { user_id: userId, task_id: taskId, depends_on_task_id: dependsOnTaskId },
  ]);
  if (error) throw new Error(error.message);
}

export async function deleteDependency(
  taskId: string,
  dependsOnTaskId: string
): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("task_dependency")
    .delete()
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .eq("depends_on_task_id", dependsOnTaskId);
  if (error) throw new Error(error.message);
}
