/**
 * Cliente da Edge Function `orb-agent`.
 *
 * Usa `fetch` cru em vez de `supabase.functions.invoke` de propósito: o invoke resolve a promise só
 * com o corpo inteiro, e o ponto desta tela é ver a Orb respondendo enquanto ela pensa.
 */

import { supabase } from "@/lib/supabase";
import { createOrbStreamParser } from "@/domain/orb/stream";
import type { OrbStreamEvent, OrbTurnRequest } from "@/types/orb";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface OrbTurnOptions extends OrbTurnRequest {
  onEvent: (event: OrbStreamEvent) => void;
  signal?: AbortSignal;
}

export async function streamOrbTurn({
  messages,
  today,
  timezone,
  onEvent,
  signal,
}: OrbTurnOptions): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sessão expirada. Entre de novo para falar com a Orb.");

  const response = await fetch(`${FUNCTIONS_BASE}/orb-agent`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ messages, today, timezone }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => null);
    throw new Error(
      (detail as { error?: string } | null)?.error ??
        "A Orb não respondeu agora. Tente de novo em instantes."
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createOrbStreamParser();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      onEvent(event);
    }
  }
  for (const event of parser.flush()) onEvent(event);
}
