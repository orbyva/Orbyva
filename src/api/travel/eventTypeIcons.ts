import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { indexEventTypeIcons, type EventTypeIconMap } from "@/domain/travel/eventTypes";
import type { EventTypeIconRow } from "@/types/travel";

/**
 * I/O de `public.event_type_icon` (feature 258) — o ícone que o usuário escolheu para cada tipo de
 * evento do roteiro.
 *
 * Toda função filtra por `user_id` explicitamente, mesmo com RLS ligada: a RLS é a última linha de
 * defesa, não a primeira, e o filtro é o que faz a consulta usar `event_type_icon_user_idx`.
 *
 * Diferente de `iconAssets.ts`, aqui não há arquivo nenhum: o que se guarda é a **escolha** (um
 * preset lucide ou a URL de um ícone da biblioteca da feature 086). Excluir o ícone da biblioteca
 * não toca nestas linhas — é por isso que a coluna guarda a URL e não o id.
 */

const SELECT = "id, user_id, category, icon_key, icon_url, created_at";

/** `true` quando o erro é "a migration ainda não foi aplicada", e não uma falha de verdade.
 * Entre o deploy do front e o `supabase db push` existe uma janela, e nela o roteiro tem de
 * continuar abrindo sem personalização em vez de não abrir — mesmo tratamento que
 * `isMissingAssetSchema` dá à feature 102. */
export function isMissingEventTypeIconSchema(error: {
  message?: string | null;
  code?: string | null;
} | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return String(error.message ?? "").includes("event_type_icon");
}

/**
 * As personalizações do usuário, já indexadas por categoria.
 *
 * Devolve o mapa (e não as linhas) porque é o que todo consumidor quer: o card do roteiro pergunta
 * "qual é o ícone de museu?", nunca "quais linhas existem". A indexação mora no domínio, que é onde
 * a regra de categoria desconhecida e de fonte única é decidida.
 */
export async function fetchEventTypeIcons(): Promise<EventTypeIconMap> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("event_type_icon")
    .select(SELECT)
    .eq("user_id", userId);

  if (error) {
    if (isMissingEventTypeIconSchema(error)) return {};
    throw new Error(error.message);
  }
  return indexEventTypeIcons((data ?? []) as EventTypeIconRow[]);
}

/**
 * Define (ou troca) o ícone de um tipo — upsert por `(user_id, category)`, que é o que a `unique`
 * da tabela permite.
 *
 * `icon_url` vence `icon_key`: as duas colunas são mutuamente exclusivas e o `check` do banco
 * recusa as duas preenchidas. Zerar aqui, e não confiar em quem chama, é o que impede uma tela nova
 * de gravar um estado que a UI não sabe desenhar.
 */
export async function setEventTypeIcon(
  category: string,
  choice: { icon_key?: string | null; icon_url?: string | null }
): Promise<void> {
  const iconUrl = choice.icon_url?.trim() || null;
  const iconKey = iconUrl ? null : (choice.icon_key?.trim() || null);
  if (!iconUrl && !iconKey) {
    // Tirar a personalização é apagar a linha. Gravar dois nulos seria uma linha que não
    // personaliza nada — o `check` do banco recusa, e a mensagem de lá não diria o que fazer.
    throw new Error("Escolha um ícone ou remova a personalização do tipo.");
  }

  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("event_type_icon")
    .upsert(
      { user_id: userId, category, icon_key: iconKey, icon_url: iconUrl },
      { onConflict: "user_id,category" }
    );
  if (error) throw new Error(error.message);
}

/** Tira a personalização: o tipo volta a desenhar o ícone padrão de `PLACE_TYPE_META`. Apaga a
 * linha em vez de zerar as colunas — é o que o `check` da tabela exige e o que mantém "sem linha"
 * como o único jeito de dizer "sem personalização". */
export async function clearEventTypeIcon(category: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("event_type_icon")
    .delete()
    .eq("user_id", userId)
    .eq("category", category);
  if (error) throw new Error(error.message);
}
