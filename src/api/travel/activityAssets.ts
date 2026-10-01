import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
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
 * I/O de `public.trip_activity_asset` (feature 102) — os arquivos e links pendurados numa linha do
 * roteiro, visita ou deslocamento.
 *
 * Duas coisas separam este módulo de `iconAssets.ts`, e as duas vêm da mesma razão (o conteúdo é
 * documento pessoal, não ícone):
 *
 * 1. **O bucket é privado.** Não há `getPublicUrl` em lugar nenhum daqui; abrir um arquivo é
 *    `signedAssetUrl`, que assina por 5 minutos. Um cartão de embarque tem nome completo, número de
 *    documento e localizador — num bucket público a URL *é* a senha, e URL vaza.
 * 2. **Excluir apaga o arquivo.** Em `deleteIconAsset` o arquivo fica, porque a URL pode estar em
 *    uso por outra tarefa. Aqui o arquivo tem um dono único e óbvio (esta linha do roteiro) e
 *    ninguém mais aponta para ele.
 *
 * As consultas filtram por `trip_id` (não por `user_id`): o escopo de um asset é a **viagem**, que é
 * o que a RLS exige (`is_trip_member`) e o que o índice `trip_activity_asset_trip_idx` começa por —
 * filtrar por `user_id` esconderia do grupo o documento que o grupo precisa achar.
 */

/** Bucket **privado** criado em `20260930120000_trip_activity_asset.sql`. */
export const TRIP_ASSET_BUCKET = "trip-assets";

/** Validade da URL assinada. Curta de propósito: é o tempo de abrir o arquivo, não de guardar o
 * link — um link que durasse horas voltaria a ser a senha que o bucket privado foi criado para não
 * ter. */
export const TRIP_ASSET_SIGNED_URL_TTL_SECONDS = 300;

const ASSET_SELECT =
  "id, trip_id, activity_id, kind, label, url, storage_path, mime_type, size_bytes, position, created_by_user_id, created_at";

/** `true` quando o erro é "a feature ainda não foi aplicada no banco" (tabela ou bucket ausentes),
 * e não uma falha de verdade. Entre o deploy do front e o `supabase db push` existe uma janela, e
 * nela o roteiro tem de continuar abrindo sem assets em vez de não abrir. Mesmo tratamento que
 * `fetchTripDetailBundle` já dá a `trip_stop` e `trip_member`. */
export function isMissingAssetSchema(error: {
  message?: string | null;
  code?: string | null;
} | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = String(error.message ?? "");
  return msg.includes("trip_activity_asset") || msg.includes("trip-assets");
}

/**
 * Os assets de uma viagem inteira, agrupados por `activity_id` — uma consulta, não uma por linha do
 * roteiro.
 *
 * É esta função que o bundle chama na wave 1, e é por ela que `trip_id` existe denormalizado:
 * agrupar por atividade no cliente custa nada, e a alternativa seria uma terceira ida ao banco que
 * só poderia começar depois de as atividades chegarem.
 *
 * Atividade sem asset **não** aparece no mapa (sem chave, não com array vazio) — quem consome faz
 * `map[id] ?? []`, e a ausência é a resposta certa para "não há nada anexado".
 */
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
  for (const key of Object.keys(grouped)) {
    grouped[key] = sortAssets(grouped[key]);
  }
  return grouped;
}

/** Os assets de uma atividade só, na ordem de exibição — o que o diálogo lê ao abrir e recarrega
 * depois de cada escrita. */
export async function fetchAssetsForActivity(
  activityId: string
): Promise<TripActivityAsset[]> {
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

/**
 * Sobe um arquivo para a linha do roteiro e devolve a linha criada.
 *
 * O caminho é `{tripId}/{activityId}/{uuid}.{ext}` — a **primeira pasta é o `trip_id`** porque é o
 * que `public.trip_assets_path_member` lê para decidir a permissão no bucket. Trocar a ordem das
 * pastas quebraria as policies em silêncio (tudo passaria a ser negado), então a montagem do
 * caminho mora só aqui.
 *
 * Não é transação: se o insert falhar depois do upload, o arquivo fica órfão no bucket e o erro
 * sobe. Mesma escolha (e mesma razão) de `uploadIconAsset`: apagar o arquivo no `catch` esconderia o
 * erro real atrás de um segundo erro possível, e o órfão é invisível para o usuário.
 */
export async function uploadActivityFileAsset(params: {
  tripId: string;
  activityId: string;
  file: File;
  label?: string | null;
  /** Assets já conhecidos da atividade — só para calcular a próxima `position` sem ir ao banco. */
  existing?: readonly TripActivityAsset[];
}): Promise<TripActivityAsset> {
  const userId = await getCurrentUserId();
  const { tripId, activityId, file } = params;

  const ext = fileExtension(file.name);
  const path = `${tripId}/${activityId}/${newId()}${ext ? `.${ext}` : ""}`;

  const { error: uploadError } = await supabase.storage
    .from(TRIP_ASSET_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase
    .from("trip_activity_asset")
    .insert({
      trip_id: tripId,
      activity_id: activityId,
      kind: "file",
      // Sem rótulo explícito, o nome do arquivo escolhido é o melhor rótulo que existe — e é o
      // único lugar onde ele sobrevive, porque o caminho no bucket é um uuid.
      label: normalizeAssetLabel(params.label) ?? normalizeAssetLabel(file.name),
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      position: nextAssetPosition(params.existing ?? []),
      created_by_user_id: userId,
    })
    .select(ASSET_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as TripActivityAsset;
}

/**
 * Anexa um link à linha do roteiro. `url` é assumida já normalizada por `normalizeAssetUrl` — a tela
 * normaliza antes de salvar, para poder mostrar a recusa no campo em vez de num toast.
 */
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

/** Renomeia o rótulo. Não toca no arquivo nem na URL — rótulo é rótulo. Vazio volta a `null`, e a
 * lista cai para o host/nome do arquivo. */
export async function renameActivityAsset(
  id: string,
  label: string
): Promise<void> {
  const { error } = await supabase
    .from("trip_activity_asset")
    .update({ label: normalizeAssetLabel(label) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Exclui o asset — e, quando é arquivo, **o arquivo também**.
 *
 * O `storage.remove` roda antes do delete da linha de propósito: se ele falhar, a linha fica e o
 * erro sobe. Perder a referência de um arquivo que continua existindo (e continua sendo cobrado) é
 * pior que não apagar, porque depois dali ninguém mais sabe que ele está lá.
 *
 * É o oposto de `deleteIconAsset`, e a diferença é real: um ícone da biblioteca pode estar em uso
 * por tarefas antigas via URL pública; este arquivo tem um dono único, que é esta linha.
 */
export async function deleteActivityAsset(
  asset: Pick<TripActivityAsset, "id" | "kind" | "storage_path">
): Promise<void> {
  if (asset.kind === "file" && asset.storage_path) {
    const { error } = await supabase.storage
      .from(TRIP_ASSET_BUCKET)
      .remove([asset.storage_path]);
    if (error) throw new Error(error.message);
  }

  const { error } = await supabase
    .from("trip_activity_asset")
    .delete()
    .eq("id", asset.id);
  if (error) throw new Error(error.message);
}

/**
 * A URL para abrir um asset: a própria `url` quando é link; uma **URL assinada** de 5 min quando é
 * arquivo.
 *
 * `download` é passado para todo mime que não seja pdf nem imagem — e é essa regra que substitui a
 * allowlist de mime do bucket. Sem ela, a URL assinada de um `.html` ou `.svg` renderizaria no
 * domínio do Storage, com o conteúdo que o usuário recebeu de terceiros; com ela, o navegador baixa.
 * Documento que não é pdf nem imagem também não ganha nada sendo renderizado.
 *
 * O nome no `download` é o rótulo do usuário (com a extensão do arquivo real), e não o uuid do
 * bucket: o arquivo que chega na pasta de Downloads tem de ser reconhecível.
 */
export async function signedAssetUrl(
  asset: TripActivityAsset
): Promise<string> {
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

/** Nome que o arquivo baixado recebe: o rótulo do usuário, garantindo a extensão do arquivo real
 * (sem ela o SO não sabe com o que abrir). Cai para o nome no bucket quando não há rótulo. */
function downloadFileName(asset: TripActivityAsset): string {
  const stored = fileNameFromPath(asset.storage_path);
  const ext = fileExtension(stored);
  const label = normalizeAssetLabel(asset.label);
  if (!label) return stored || "arquivo";
  if (!ext || fileExtension(label) === ext) return label;
  return `${label}.${ext}`;
}
