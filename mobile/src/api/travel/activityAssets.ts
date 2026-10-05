import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import {
  fileExtension,
  fileNameFromPath,
  isInlineViewableMime,
  nextAssetPosition,
  normalizeAssetLabel,
  sortAssets,
} from "@/domain/travel/activityAssets";
import type { TripActivityAsset } from "@/types/travel";

/**
 * Espelho mobile de `src/api/travel/activityAssets.ts`: mesma tabela, mesmo bucket privado, mesmas
 * regras (escopo por `trip_id`, caminho `{tripId}/{activityId}/{uuid}.{ext}`, excluir apaga o
 * arquivo antes da linha, abrir é URL assinada de 5 min).
 */
export const TRIP_ASSET_BUCKET = "trip-assets";
export const TRIP_ASSET_SIGNED_URL_TTL_SECONDS = 300;

const ASSET_SELECT =
  "id, trip_id, activity_id, kind, label, url, storage_path, mime_type, size_bytes, position, created_by_user_id, created_at";

export function isMissingAssetSchema(
  error: { message?: string | null; code?: string | null } | null
): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = String(error.message ?? "");
  return msg.includes("trip_activity_asset") || msg.includes("trip-assets");
}

export async function fetchAssetsForTrip(
  tripId: string
): Promise<Record<string, TripActivityAsset[]>> {
  const { data, error } = await supabase
    .from("trip_activity_asset")
    .select(ASSET_SELECT)
    .eq("trip_id", tripId)
    .order("position", { ascending: true });
  if (error) {
    if (isMissingAssetSchema(error)) return {};
    throw new Error(error.message);
  }
  const grouped: Record<string, TripActivityAsset[]> = {};
  for (const row of (data ?? []) as TripActivityAsset[]) {
    (grouped[row.activity_id] ??= []).push(row);
  }
  for (const key of Object.keys(grouped)) grouped[key] = sortAssets(grouped[key]);
  return grouped;
}

export async function fetchAssetsForActivity(activityId: string): Promise<TripActivityAsset[]> {
  const { data, error } = await supabase
    .from("trip_activity_asset")
    .select(ASSET_SELECT)
    .eq("activity_id", activityId)
    .order("position", { ascending: true });
  if (error) {
    if (isMissingAssetSchema(error)) return [];
    throw new Error(error.message);
  }
  return sortAssets((data ?? []) as TripActivityAsset[]);
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Arquivo local escolhido no aparelho (foto da galeria ou documento). */
export interface LocalAssetFile {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
}

export async function uploadActivityFileAsset(params: {
  tripId: string;
  activityId: string;
  file: LocalAssetFile;
  label?: string | null;
  existing?: readonly TripActivityAsset[];
}): Promise<TripActivityAsset> {
  const userId = await getCurrentUserId();
  const { tripId, activityId, file } = params;

  const ext = fileExtension(file.name);
  const path = `${tripId}/${activityId}/${newId()}${ext ? `.${ext}` : ""}`;
  const body = await (await fetch(file.uri)).arrayBuffer();

  const { error: uploadError } = await supabase.storage.from(TRIP_ASSET_BUCKET).upload(path, body, {
    upsert: false,
    contentType: file.mimeType || "application/octet-stream",
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase
    .from("trip_activity_asset")
    .insert({
      trip_id: tripId,
      activity_id: activityId,
      kind: "file",
      label: normalizeAssetLabel(params.label) ?? normalizeAssetLabel(file.name),
      storage_path: path,
      mime_type: file.mimeType || null,
      size_bytes: file.size ?? body.byteLength,
      position: nextAssetPosition(params.existing ?? []),
      created_by_user_id: userId,
    })
    .select(ASSET_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as TripActivityAsset;
}

/** `url` já normalizada por `normalizeAssetUrl` (a tela mostra a recusa no campo). */
export async function addActivityLinkAsset(params: {
  tripId: string;
  activityId: string;
  url: string;
  label?: string | null;
  existing?: readonly TripActivityAsset[];
}): Promise<TripActivityAsset> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("trip_activity_asset")
    .insert({
      trip_id: params.tripId,
      activity_id: params.activityId,
      kind: "link",
      label: normalizeAssetLabel(params.label),
      url: params.url,
      position: nextAssetPosition(params.existing ?? []),
      created_by_user_id: userId,
    })
    .select(ASSET_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as TripActivityAsset;
}

export async function renameActivityAsset(id: string, label: string): Promise<void> {
  const { error } = await supabase
    .from("trip_activity_asset")
    .update({ label: normalizeAssetLabel(label) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteActivityAsset(
  asset: Pick<TripActivityAsset, "id" | "kind" | "storage_path">
): Promise<void> {
  if (asset.kind === "file" && asset.storage_path) {
    const { error } = await supabase.storage.from(TRIP_ASSET_BUCKET).remove([asset.storage_path]);
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase.from("trip_activity_asset").delete().eq("id", asset.id);
  if (error) throw new Error(error.message);
}

export async function signedAssetUrl(asset: TripActivityAsset): Promise<string> {
  if (asset.kind === "link") {
    const url = asset.url?.trim();
    if (!url) throw new Error("Esse link está vazio.");
    return url;
  }
  const path = asset.storage_path?.trim();
  if (!path) throw new Error("Esse arquivo não tem caminho no armazenamento.");

  const inline = isInlineViewableMime(asset.mime_type);
  const { data, error } = await supabase.storage
    .from(TRIP_ASSET_BUCKET)
    .createSignedUrl(path, TRIP_ASSET_SIGNED_URL_TTL_SECONDS, {
      ...(inline ? {} : { download: downloadFileName(asset) }),
    });
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error("Não foi possível abrir o arquivo.");
  return data.signedUrl;
}

function downloadFileName(asset: TripActivityAsset): string {
  const stored = fileNameFromPath(asset.storage_path);
  const ext = fileExtension(stored);
  const label = normalizeAssetLabel(asset.label);
  if (!label) return stored || "arquivo";
  if (!ext || fileExtension(label) === ext) return label;
  return `${label}.${ext}`;
}
