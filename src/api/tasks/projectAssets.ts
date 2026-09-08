import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type {
  ProjectAsset,
  ProjectAssetDraft,
} from "@/types/tasks";

/**
 * API de assets do projeto (feature 106).
 *
 * Todas as funções filtram por `user_id` explicitamente no cabeçalho da consulta,
 * garantindo isolamento multi-tenant mesmo se a RLS falhar — mesmo padrão das
 * `fetchExternalLinksForTasks`/`saveExternalLinksForTask` (085) e
 * `fetchIconAssets`/`deleteIconAsset` (086).
 */

async function getUserId(): Promise<string> {
  return getCurrentUserId();
}

/** Lista assets do projeto, ordenados por `position`. */
export async function fetchProjectAssets(projectId: string): Promise<ProjectAsset[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("project_asset")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Cria um asset no projeto, colocando no fim da lista (`position` = max + 1). */
export async function createProjectAsset(
  draft: ProjectAssetDraft
): Promise<ProjectAsset> {
  const userId = await getUserId();
  const { data: maxPos } = await supabase
    .from("project_asset")
    .select("position")
    .eq("project_id", draft.project_id)
    .eq("user_id", userId)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const position = (maxPos?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("project_asset")
    .insert({
      ...draft,
      user_id: userId,
      position,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Atualiza campos de um asset (title, comment, url, position). */
export async function updateProjectAsset(
  id: string,
  patch: Partial<Pick<ProjectAssetDraft, "title" | "comment" | "url" | "position">>
): Promise<ProjectAsset> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("project_asset")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

import { PROJECT_FILES_BUCKET } from "./projectAssetFiles";

export interface DeleteProjectAssetResult {
  storageError?: boolean;
}

/**
 * Apaga um asset da base:
 * 1. Apaga a linha primeiro (cascata remove vínculos em `project_asset_task` via FK)
 * 2. Se for `kind='file'`, remove o objeto do storage depois, em melhor esforço.
 * Se a remoção do storage falhar, NÃO reverte a exclusão da linha e retorna `{ storageError: true }`.
 */
export async function deleteProjectAsset(
  id: string,
  asset?: Pick<ProjectAsset, "kind" | "storage_path">
): Promise<DeleteProjectAssetResult> {
  const userId = await getUserId();

  let targetAsset = asset;
  if (!targetAsset) {
    const { data } = await supabase
      .from("project_asset")
      .select("kind, storage_path")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      targetAsset = data as Pick<ProjectAsset, "kind" | "storage_path">;
    }
  }

  const { error } = await supabase
    .from("project_asset")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;

  if (targetAsset?.kind === "file" && targetAsset.storage_path) {
    try {
      const { error: storageErr } = await supabase.storage
        .from(PROJECT_FILES_BUCKET)
        .remove([targetAsset.storage_path]);
      if (storageErr) {
        return { storageError: true };
      }
    } catch {
      return { storageError: true };
    }
  }

  return { storageError: false };
}

/**
 * Reordena assets do projeto gravando **somente** as linhas cuja `position` de fato mudou.
 * Reabrir e salvar sem mexer não pode gerar uma escrita por item — mesma regra de
 * `saveExternalLinksForTask`.
 */
export async function reorderProjectAssets(
  projectId: string,
  orderedIds: string[]
): Promise<void> {
  const userId = await getUserId();
  const { data: current } = await supabase
    .from("project_asset")
    .select("id, position")
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (!current) return;

  const updates = orderedIds
    .map((id, index) => {
      const existing = current.find((a) => a.id === id);
      if (existing && existing.position !== index) {
        return supabase
          .from("project_asset")
          .update({ position: index })
          .eq("id", id)
          .eq("user_id", userId);
      }
      return null;
    })
    .filter(Boolean);

  if (updates.length > 0) {
    for (const update of updates) {
      const { error } = await update!;
      if (error) throw error;
    }
  }
}

/**
 * Busca assets anexados a uma lista de tarefas (batch por página, molde de
 * `fetchExternalLinksForTasks`): uma consulta em `project_asset_task`, outra em
 * `project_asset`, cruzamento em memória. Tarefa sem anexo não vira chave no mapa.
 */
export async function fetchAssetsForTasks(
  taskIds: string[]
): Promise<Record<string, ProjectAsset[]>> {
  if (taskIds.length === 0) return {};

  const userId = await getUserId();

  const { data: links, error: linksError } = await supabase
    .from("project_asset_task")
    .select("asset_id, task_id")
    .in("task_id", taskIds)
    .eq("user_id", userId);

  if (linksError) throw linksError;

  const assetIds = [...new Set(links?.map((l) => l.asset_id) ?? [])];
  if (assetIds.length === 0) {
    return Object.fromEntries(taskIds.map((id) => [id, []]));
  }

  const { data: assets, error: assetsError } = await supabase
    .from("project_asset")
    .select("*")
    .in("id", assetIds)
    .eq("user_id", userId);

  if (assetsError) throw assetsError;

  const byAssetId = new Map((assets ?? []).map((a) => [a.id, a]));
  const result: Record<string, ProjectAsset[]> = {};

  for (const link of links ?? []) {
    const asset = byAssetId.get(link.asset_id);
    if (asset) {
      (result[link.task_id] ??= []).push(asset);
    }
  }

  for (const id of taskIds) {
    result[id] ??= [];
  }

  return result;
}

/**
 * Salva os vínculos asset <-> task para uma tarefa:
 * - insere os que entraram
 * - apaga os que saíram
 * - NÃO apaga-e-recria os que ficaram (mesma regra de `saveExternalLinksForTask`)
 */
export async function saveTaskAssetLinks(
  taskId: string,
  assetIds: string[]
): Promise<void> {
  const userId = await getUserId();

  const { data: existing } = await supabase
    .from("project_asset_task")
    .select("asset_id")
    .eq("task_id", taskId)
    .eq("user_id", userId);

  const existingIds = new Set(existing?.map((e) => e.asset_id) ?? []);
  const newIds = new Set(assetIds);

  // Inserir os que entraram
  const toInsert = [...newIds].filter((id) => !existingIds.has(id));
  if (toInsert.length > 0) {
    const { error } = await supabase.from("project_asset_task").insert(
      toInsert.map((asset_id) => ({
        asset_id,
        task_id: taskId,
        user_id: userId,
      }))
    );
    if (error) throw error;
  }

  // Apagar os que saíram
  const toDelete = [...existingIds].filter((id) => !newIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("project_asset_task")
      .delete()
      .eq("task_id", taskId)
      .eq("user_id", userId)
      .in("asset_id", toDelete);
    if (error) throw error;
  }
}