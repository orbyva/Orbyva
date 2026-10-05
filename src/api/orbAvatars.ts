import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type { OrbAvatar } from "@/types/orb";

/**
 * I/O das versões da Orb geradas por IA (feature 151) — `public.orb_avatar` mais os arquivos em
 * `orb-avatars/{userId}/{uuid}.png`.
 *
 * Toda função filtra por `user_id` explicitamente, mesmo com RLS ligada: a RLS é a última linha de
 * defesa, não a primeira, e o filtro é o que faz a consulta usar o índice
 * `orb_avatar_user_created_idx`, que começa por `user_id`.
 *
 * Nada aqui gera imagem (isso é a 152) nem desenha tela (153/154): esta camada só lê, ativa e
 * apaga.
 */

/** Bucket público criado em `20260924113000_orb_avatar.sql`: teto de 5 MB, só `image/png`. Próprio,
 * e não `task-icons`, porque o de lá tem teto de 1 MB e um PNG de 1024² estoura isso com folga. */
export const ORB_AVATAR_BUCKET = "orb-avatars";

export type OrbAvatarReference = { mime: "image/png" | "image/jpeg" | "image/webp"; data: string };

/** Erro da `orb-avatar` com a mensagem em PT-BR que ela devolveu; `remaining` vem no 429 da cota. */
export class OrbAvatarGenerateError extends Error {
  readonly remaining?: number;

  constructor(message: string, remaining?: number) {
    super(message);
    this.name = "OrbAvatarGenerateError";
    this.remaining = remaining;
  }
}

/**
 * Gera uma versão nova pela Edge Function `orb-avatar` (feature 152), que sobe o PNG e grava a
 * linha ela mesma — aqui só se chama e se lê a resposta.
 *
 * Em status ≠ 2xx o `invoke` devolve só "Edge Function returned a non-2xx status code"; a mensagem
 * útil (cota do dia, imagem grande, recusa do modelo) está no corpo, em `error.context`.
 */
export async function generateOrbAvatar(input: {
  prompt: string;
  references: OrbAvatarReference[];
}): Promise<{ avatar: OrbAvatar; remaining: number }> {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

  const { data, error } = await supabase.functions.invoke("orb-avatar", {
    body: { prompt: input.prompt, references: input.references, today, timezone },
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    let payload: { error?: unknown; remaining?: unknown } | null = null;
    if (context && typeof context.json === "function") {
      try {
        payload = await context.json();
      } catch {
        payload = null;
      }
    }
    if (payload && typeof payload.error === "string" && payload.error) {
      throw new OrbAvatarGenerateError(
        payload.error,
        typeof payload.remaining === "number" ? payload.remaining : undefined
      );
    }
    throw new Error(error.message || "Não foi possível gerar a versão da Orb.");
  }

  const { remaining, ...avatar } = data as OrbAvatar & { remaining: number };
  return { avatar, remaining };
}

/** As versões do usuário, mais recentes primeiro — a ordem da galeria. */
export async function fetchOrbAvatars(): Promise<OrbAvatar[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("orb_avatar")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OrbAvatar[];
}

/**
 * A versão que o app deve mostrar, ou `null`.
 *
 * `maybeSingle` e não `single`: **nenhuma ativa é estado válido** — é o estado de todo usuário
 * hoje, e nele a esfera continua sendo a CSS. `single` transformaria o caso normal em erro.
 *
 * Uma só linha pode voltar daqui porque o índice parcial `orb_avatar_one_active_idx` garante isso
 * no banco; o client não precisa desempatar nada.
 */
export async function fetchActiveOrbAvatar(): Promise<OrbAvatar | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("orb_avatar")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OrbAvatar | null) ?? null;
}

/**
 * Troca a versão ativa — uma chamada de RPC, nunca dois updates daqui.
 *
 * Com o índice único parcial, desligar a velha e ligar a nova na ordem errada viola a constraint, e
 * duas chamadas separadas podem parar no meio (rede caindo entre elas), deixando o usuário sem
 * nenhuma ativa. A RPC `security definer` faz as duas escritas numa transação só e recusa id que
 * não seja do próprio dono.
 */
export async function setActiveOrbAvatar(id: string): Promise<void> {
  const { error } = await supabase.rpc("orb_avatar_set_active", { p_id: id });
  if (error) throw new Error(error.message);
}

/**
 * Apaga a versão — a linha **e** o arquivo.
 *
 * Ao contrário de `deleteIconAsset` (onde o arquivo fica porque tarefas antigas apontam para a
 * URL), aqui nada mais referencia o PNG depois que a linha some, e é um arquivo grande.
 *
 * A ordem é arquivo primeiro, linha depois, e um `remove` que falha **não** aborta o delete da
 * linha: o que o usuário pediu foi tirar a versão da galeria. Parar no meio deixaria a linha viva
 * apontando para um arquivo que talvez já tenha sumido — pior que um arquivo órfão, que é invisível
 * e não custa nada.
 */
export async function deleteOrbAvatar(avatar: OrbAvatar): Promise<void> {
  const userId = await getCurrentUserId();

  const path = orbAvatarStoragePath(avatar.url);
  if (path) {
    // Erro aqui é ignorado de propósito (inclusive o rejeitado): ver o comentário acima.
    try {
      await supabase.storage.from(ORB_AVATAR_BUCKET).remove([path]);
    } catch {
      // segue para o delete da linha
    }
  }

  const { error } = await supabase
    .from("orb_avatar")
    .delete()
    .eq("id", avatar.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * O caminho dentro do bucket a partir da URL pública — `{userId}/{uuid}.png`.
 *
 * A URL pública da Supabase é `.../object/public/{bucket}/{caminho}`, então o caminho é o que vem
 * depois do nome do bucket. Query string e fragmento são cortados (uma URL pode chegar com
 * `?t=...` de cache-busting), e URL que não aponte para este bucket devolve `null` — sem isso, um
 * caminho inventado iria para o `remove`, que responde sucesso para arquivo inexistente e
 * esconderia o engano.
 */
export function orbAvatarStoragePath(url: string): string | null {
  const marker = `/${ORB_AVATAR_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const rest = url.slice(index + marker.length).split("?")[0].split("#")[0];
  return rest || null;
}
