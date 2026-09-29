/**
 * Regras puras de Lugares, compartilhadas entre a tela (`src/domain/places`) e a tool
 * `query_places` (`tools/places.ts`).
 *
 * Mora deste lado, e não em `src/domain/places`, pelo mesmo motivo de `recurring.ts`: este
 * diretório roda nos dois runtimes (Deno da Edge e Node do MCP) e não pode importar de `src/`.
 * Reimplementar a normalização do lado da Orb criaria uma segunda verdade sobre o que é um lugar
 * "visitado" — e ela divergiria da tela no primeiro registro legado.
 */

/** Espelha `PlaceStatus` (`src/types/places.ts`): to_visit = para visitar, visited = já visitado. */
export type PlaceStatus = "to_visit" | "visited";

/**
 * Status efetivo de um lugar.
 *
 * `place_visit.status` só existe desde `20260727210000_place_trip_wishlist.sql`; linha gravada
 * antes disso chega com `status` nulo e a única pista do que ela é fica em `visited_date`. Por isso
 * a normalização é sempre EM MEMÓRIA: filtrar `status` direto no banco (`.eq("status", "visited")`)
 * deixa essas linhas antigas de fora e faz a lista mentir por omissão, dizendo "você nunca foi lá"
 * sobre um lugar que está registrado.
 */
export function normalizePlaceStatus(
  status?: string | null,
  visitedDate?: string | null
): PlaceStatus {
  if (status === "to_visit" || status === "visited") return status;
  return visitedDate ? "visited" : "to_visit";
}
