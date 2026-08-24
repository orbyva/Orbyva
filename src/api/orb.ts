import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { upsertMovie } from "@/api/movies";
import { upsertBook } from "@/api/books";
import { upsertAlbum } from "@/api/albums";
import { fetchGoogleBookById } from "@/lib/googleBooks";
import type { MovieCreateRequest } from "@/types/movies";
import type { BookCreateRequest } from "@/types/books";
import type { AlbumCreateRequest } from "@/types/music";
import type {
  OrbAgentResponse,
  OrbBookPayload,
  OrbMoviePayload,
  OrbAlbumPayload,
  OrbMessage,
  OrbProposal,
  OrbThread,
} from "@/types/orb";

async function invokeOrb<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("orb-agent", {
    body,
  });

  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const parsed = (await ctx.clone().json()) as { error?: string };
        if (parsed?.error) detail = parsed.error;
      } catch {
        /* ignore */
      }
    }
    if (
      data &&
      typeof data === "object" &&
      "error" in data &&
      (data as { error?: unknown }).error
    ) {
      detail = String((data as { error: unknown }).error);
    }
    throw new Error(detail);
  }

  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    (data as { error?: unknown }).error
  ) {
    throw new Error(String((data as { error: unknown }).error));
  }

  return data as T;
}

export async function sendOrbMessage(
  threadId: string | null,
  message: string
): Promise<OrbAgentResponse> {
  return invokeOrb<OrbAgentResponse>({
    thread_id: threadId,
    message,
    locale: "pt-BR",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

/**
 * Aplica uma proposal pendente: resolve o tipo pelo `module`, chama o
 * upsert normal do domínio (mesmo caminho do CRUD manual — gates de plano
 * já valem) e marca a proposal como `applied`. Devolve o id da entidade
 * criada/atualizada.
 */
export async function applyOrbProposal(proposal: OrbProposal): Promise<string> {
  let entityId: string;

  try {
    if (proposal.module === "movies") {
      const payload = proposal.payload as OrbMoviePayload;
      await upsertMovie(payload as MovieCreateRequest);
      entityId = payload.imdb_id;
    } else if (proposal.module === "books") {
      const payload = proposal.payload as OrbBookPayload;
      const full = await fetchGoogleBookById(payload.google_id);
      if (!full) {
        throw new Error(
          "Não encontrei mais esse livro no catálogo pra aplicar."
        );
      }
      const request: BookCreateRequest = {
        ...full,
        status: payload.status,
        rating: payload.rating ?? null,
        current_page: payload.current_page ?? null,
        notes: payload.notes ?? null,
        would_recommend: payload.would_recommend ?? true,
        is_favorite: payload.is_favorite ?? false,
        read_dates: payload.read_date ? [payload.read_date] : [],
      };
      await upsertBook(request);
      entityId = payload.google_id;
    } else {
      const payload = proposal.payload as OrbAlbumPayload;
      await upsertAlbum(payload as AlbumCreateRequest);
      entityId = payload.musicbrainz_id;
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  const userId = await getCurrentUserId();
  const { error: updateError } = await supabase
    .from("orb_proposal")
    .update({
      status: "applied",
      applied_entity_id: entityId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", proposal.id)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);

  return entityId;
}

export async function dismissOrbProposal(proposalId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("orb_proposal")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function fetchOrbThread(threadId: string): Promise<{
  thread: OrbThread | null;
  messages: OrbMessage[];
  proposalsByMessageId: Record<string, OrbProposal[]>;
}> {
  const userId = await getCurrentUserId();

  const [threadRes, messagesRes, proposalsRes] = await Promise.all([
    supabase
      .from("orb_thread")
      .select("*")
      .eq("id", threadId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("orb_message")
      .select("*")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("orb_proposal")
      .select("*")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  if (threadRes.error) throw new Error(threadRes.error.message);
  if (messagesRes.error) throw new Error(messagesRes.error.message);
  if (proposalsRes.error) throw new Error(proposalsRes.error.message);

  const proposalsByMessageId: Record<string, OrbProposal[]> = {};
  for (const row of proposalsRes.data ?? []) {
    const messageId = row.message_id as string | null;
    if (!messageId) continue;
    (proposalsByMessageId[messageId] ??= []).push(row as OrbProposal);
  }

  return {
    thread: (threadRes.data as OrbThread | null) ?? null,
    messages: (messagesRes.data ?? []) as OrbMessage[],
    proposalsByMessageId,
  };
}
