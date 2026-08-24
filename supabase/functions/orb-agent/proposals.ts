import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { OrbProposalDraft } from "./types.ts";

/** Persiste as proposals do turno como `pending` e devolve com o `id` gerado. */
export async function persistProposals(
  client: SupabaseClient,
  userId: string,
  threadId: string,
  messageId: string,
  drafts: OrbProposalDraft[]
): Promise<Array<OrbProposalDraft & { id: string }>> {
  if (drafts.length === 0) return [];

  const { data, error } = await client
    .from("orb_proposal")
    .insert(
      drafts.map((d) => ({
        thread_id: threadId,
        message_id: messageId,
        user_id: userId,
        tool_name: d.tool_name,
        payload: d.payload,
        status: "pending",
      }))
    )
    .select("id, tool_name, payload");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row, i) => ({
    ...drafts[i],
    id: row.id as string,
  }));
}
