import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import {
  SVG_ICON_REJECTION_MESSAGES,
  prepareSvgIcon,
} from "@/domain/tasks/svgIcon";
import type { IconAsset } from "@/types/tasks";

/**
 * I/O da biblioteca de ícones do usuário (feature 086) — `public.icon_asset` mais os arquivos em
 * `task-icons/{userId}/library/{uuid}.{ext}`.
 *
 * Toda função filtra por `user_id` explicitamente, mesmo com RLS ligada: a RLS é a última linha de
 * defesa, não a primeira, e o filtro é o que faz a consulta usar o índice
 * `icon_asset_user_created_idx`, que começa por `user_id`.
 */

/** Bucket público criado em `20260814010000_task_icon.sql` (feature 035). */
export const ICON_ASSET_BUCKET = "task-icons";

/** Subpasta dos ícones da biblioteca. O caminho continua começando pelo id do dono porque é o
 * `(storage.foldername(name))[1]` que as policies do bucket exigem — a pasta a mais não afrouxa
 * nada (provado em `supabase/tests/icon_asset/03_assert_behavior.sql`). */
export const ICON_ASSET_FOLDER = "library";

/** Os ícones da biblioteca, mais recentes primeiro — a ordem da seção "Meus ícones" do seletor. */
export async function fetchIconAssets(): Promise<IconAsset[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("icon_asset")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as IconAsset[];
}

/** De onde vem o ícone novo: um arquivo escolhido no seletor, ou o markup que o usuário colou. */
export type IconAssetSource = { file: File } | { svg: string };

const SVG_MIME = "image/svg+xml";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  [SVG_MIME]: "svg",
};

/**
 * Sobe um ícone para a biblioteca e devolve a linha criada.
 *
 * O caminho é `{userId}/library/{uuid}.{ext}` — por **ícone**, não por tarefa. É essa mudança que
 * faz o upload deixar de exigir uma tarefa já salva (a 073 precisava do id da origem da série só
 * para o arquivo não morrer com uma ocorrência) e que permite reusar o mesmo arquivo em quantas
 * tarefas o usuário quiser.
 *
 * **Todo conteúdo SVG passa por `prepareSvgIcon` aqui dentro**, venha ele do campo de colar ou de
 * um arquivo `.svg` escolhido no seletor — o que sobe é sempre o markup limpo, nunca o original.
 * A sanitização mora nesta função, e não só na tela, de propósito: o bucket é público e a URL do
 * arquivo pode ser aberta como navegação de topo, onde o modo restrito do `<img>` não vale. Se a
 * limpeza dependesse de o chamador lembrar de chamá-la, bastaria um chamador novo para reabrir o
 * buraco.
 *
 * Não é transação: se o insert falhar depois do upload, o arquivo fica órfão no bucket e o erro
 * sobe. Fingir atomicidade aqui (apagar o arquivo no catch) esconderia o erro real por trás de um
 * segundo erro possível; o órfão é invisível para o usuário e não custa nada.
 */
export async function uploadIconAsset(
  source: IconAssetSource,
  name?: string
): Promise<IconAsset> {
  const userId = await getCurrentUserId();
  const { body, contentType, ext, fallbackName } = await prepareUpload(source);

  const path = `${userId}/${ICON_ASSET_FOLDER}/${newId()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(ICON_ASSET_BUCKET)
    .upload(path, body, { upsert: false, contentType });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicData } = supabase.storage
    .from(ICON_ASSET_BUCKET)
    .getPublicUrl(path);
  const url = publicData.publicUrl;

  const { data, error } = await supabase
    .from("icon_asset")
    .insert({ user_id: userId, name: name?.trim() || fallbackName, url })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as IconAsset;
}

async function prepareUpload(source: IconAssetSource): Promise<{
  body: Blob;
  contentType: string;
  ext: string;
  fallbackName: string;
}> {
  if ("svg" in source) {
    return {
      body: cleanSvgBlob(source.svg),
      contentType: SVG_MIME,
      ext: "svg",
      fallbackName: "Ícone colado",
    };
  }

  const { file } = source;
  const fallbackName = file.name.replace(/\.[^.]+$/, "") || "Ícone";

  // Um `.svg` escolhido no seletor de arquivos é markup igual ao colado — mesma origem possível
  // (baixado de um site qualquer), mesmo bucket público, mesmo risco. Passa pela mesma barreira.
  if (file.type === SVG_MIME) {
    return {
      body: cleanSvgBlob(await file.text()),
      contentType: SVG_MIME,
      ext: "svg",
      fallbackName,
    };
  }

  return {
    body: file,
    contentType: file.type,
    ext: EXTENSION_BY_MIME[file.type] ?? "jpg",
    fallbackName,
  };
}

/** O markup **já limpo**, embrulhado no Blob que vai para o bucket. Recusa vira erro com a mensagem
 * fechada de `prepareSvgIcon` — a mesma que a tela mostra. */
function cleanSvgBlob(markup: string): Blob {
  const prepared = prepareSvgIcon(markup);
  if (!prepared.ok) throw new Error(SVG_ICON_REJECTION_MESSAGES[prepared.reason]);
  return new Blob([prepared.svg], { type: SVG_MIME });
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Renomeia o rótulo da lista. Não toca no arquivo nem em `task.icon_url` — o nome é só rótulo. */
export async function renameIconAsset(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("O ícone precisa de um nome.");
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("icon_asset")
    .update({ name: trimmed })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Tira o ícone da biblioteca — **só a linha**.
 *
 * O arquivo continua no bucket de propósito (decisão registrada na feature 086): as tarefas que já
 * apontam para aquela URL continuam mostrando o ícone. Apagar o arquivo quebraria em silêncio o
 * ícone de tarefas antigas, que é destrutivo e não foi pedido. Por isso não há `storage.remove`
 * aqui — e há um teste que afirma justamente a ausência dessa chamada.
 */
export async function deleteIconAsset(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("icon_asset")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
