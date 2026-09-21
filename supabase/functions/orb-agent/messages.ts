/**
 * Normalização do histórico que chega do client. Fica fora de `index.ts` por um motivo só: aquele
 * arquivo importa `npm:@google/genai` e `https://esm.sh/...` e chama `Deno.serve` no topo, então
 * nenhum teste do Vitest consegue importá-lo. Aqui é TS puro, sem import e sem API de runtime.
 */

/** Histórico enviado ao modelo. O client guarda a conversa inteira; aqui entra só a cauda. */
export const MAX_HISTORY_MESSAGES = 24;

export interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Normaliza o histórico para o que a Messages API aceita: primeiro turno do usuário e papéis
 * alternados.
 *
 * Mensagem vazia é descartada e duas do mesmo papel viram uma só, concatenadas — **descartar** a
 * segunda era o que travava a conversa para sempre (uma bolha vazia do assistente deixava dois
 * `user` seguidos e a API respondia 400 em todo turno seguinte).
 */
export function parseMessages(raw: unknown): IncomingMessage[] {
  if (!Array.isArray(raw)) return [];

  const colapsadas: IncomingMessage[] = [];
  for (const item of raw) {
    const role = (item as { role?: unknown })?.role;
    const content = (item as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const trimmed = content.trim();
    if (!trimmed) continue;

    const anterior = colapsadas[colapsadas.length - 1];
    if (anterior && anterior.role === role) {
      anterior.content = `${anterior.content}\n\n${trimmed}`;
      continue;
    }
    colapsadas.push({ role, content: trimmed });
  }

  const tail = colapsadas.slice(-MAX_HISTORY_MESSAGES);
  const firstUser = tail.findIndex((message) => message.role === "user");
  // Sem nenhum `user` na cauda não há turno para responder — devolver a cauda crua daria 400 na API.
  if (firstUser === -1) return [];
  return tail.slice(firstUser);
}
