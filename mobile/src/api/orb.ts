/**
 * Cliente da Edge Function `orb-agent` (mobile).
 *
 * Usa `fetch` cru em vez de `supabase.functions.invoke`: o invoke espera o corpo inteiro, e o ponto
 * desta tela é ver a Orb respondendo enquanto ela pensa. Se o runtime não expuser `getReader`,
 * cai no fallback de buffer + parse (mesmo parser).
 */

import { createOrbStreamParser } from "@/domain/orb/stream";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import type { OrbStreamEvent, OrbTurnRequest } from "@/types/orb";

const FUNCTIONS_BASE = `${supabaseUrl}/functions/v1`;

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
      apikey: supabaseAnonKey,
      "x-orbyva-client": "mobile",
    },
    body: JSON.stringify({ messages, today, timezone }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(
      (detail as { error?: string } | null)?.error ??
        "A Orb não respondeu agora. Tente de novo em instantes."
    );
  }

  const parser = createOrbStreamParser();
  const body = response.body;

  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        onEvent(event);
      }
    }
  } else {
    const text = await response.text();
    for (const event of parser.push(text)) onEvent(event);
  }

  for (const event of parser.flush()) onEvent(event);
}
