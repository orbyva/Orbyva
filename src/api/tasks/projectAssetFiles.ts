import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import {
  validateProjectFile,
  projectFileExtension,
} from "@/domain/tasks/projectAssetFile";
import type { ProjectAsset } from "@/types/tasks";

/** Bucket privado para arquivos de projeto (feature 107). */
export const PROJECT_FILES_BUCKET = "project-files";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface UploadProjectAssetFileParams {
  projectId: string;
  file: File;
  comment?: string | null;
}

/**
 * Sobe um arquivo para o bucket privado `project-files` e cria a linha `kind='file'`
 * em `public.project_asset`.
 *
 * O caminho no bucket é `{userId}/{projectId}/{uuid}.{ext}`.
 * Valida tamanho e tipo MIME antes de enviar.
 * Se o insert na tabela falhar após o upload, limpa o objeto do bucket em melhor
 * esforço e relança o erro original.
 */
export async function uploadProjectAssetFile({
  projectId,
  file,
  comment,
}: UploadProjectAssetFileParams): Promise<ProjectAsset> {
  const validation = validateProjectFile(file);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const userId = await getCurrentUserId();
  const ext = projectFileExtension(file);
  const uuid = newId();
  const path = `${userId}/${projectId}/${uuid}${ext ? `.${ext}` : ""}`;

  const { error: uploadError } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  try {
    const { data: maxPos } = await supabase
      .from("project_asset")
      .select("position")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("position", { ascending: false })
      .limit(1)
      .single();

    const position = (maxPos?.position ?? -1) + 1;

    const { data, error: insertError } = await supabase
      .from("project_asset")
      .insert({
        user_id: userId,
        project_id: projectId,
        kind: "file",
        title: file.name,
        url: null,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        comment: comment?.trim() ? comment.trim() : null,
        position,
      })
      .select("*")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    return data as ProjectAsset;
  } catch (err) {
    // Falha no insert remove o objeto recém-subido em melhor esforço
    try {
      await supabase.storage.from(PROJECT_FILES_BUCKET).remove([path]);
    } catch {
      // Ignora erro da limpeza para preservar o erro original
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Gera uma URL assinada válida por 60 segundos para download ou abertura em nova aba.
 * Não deve ser chamada no render — apenas sob demanda (no clique de abrir/baixar).
 */
export async function createProjectAssetFileUrl(
  assetOrPath: { storage_path?: string | null } | string
): Promise<string> {
  const path =
    typeof assetOrPath === "string" ? assetOrPath : assetOrPath.storage_path;
  if (!path) {
    throw new Error("Arquivo sem caminho de armazenamento.");
  }

  const { data, error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .createSignedUrl(path, 60);

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message || "Não foi possível gerar o link de acesso ao arquivo."
    );
  }

  return data.signedUrl;
}
