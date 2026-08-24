import { normalizeEntertainmentDates } from "@/domain/entertainment/insights";

/**
 * Campos escalares comuns aos 3 módulos de entretenimento (movie/book/album),
 * usados no merge não-destrutivo de upsert (ver `upsertMovie` em `api/movies.ts`).
 */
export interface EntertainmentScalarFields {
  status: string;
  rating?: number | null;
  notes?: string | null;
  would_recommend?: boolean;
  is_favorite?: boolean;
}

/**
 * Merge não-destrutivo: um valor ausente/vazio no `incoming` preserva o
 * `existing` em vez de apagá-lo. Espelha a lógica já usada em `upsertMovie`.
 */
export function mergeEntertainmentScalars<T extends EntertainmentScalarFields>(
  existing: T,
  incoming: Pick<T, "status"> & Partial<Omit<T, "status">>
): Pick<T, "status" | "rating" | "notes" | "would_recommend" | "is_favorite"> {
  return {
    status: incoming.status,
    rating: incoming.rating ?? existing.rating,
    notes: incoming.notes?.trim() ? incoming.notes : existing.notes,
    would_recommend: incoming.would_recommend ?? existing.would_recommend,
    is_favorite: incoming.is_favorite ?? existing.is_favorite,
  } as Pick<T, "status" | "rating" | "notes" | "would_recommend" | "is_favorite">;
}

/** União (sem duplicatas) de datas de atividade — rewatches/releituras/reescutas acumulam. */
export function mergeEntertainmentDates(
  existingDates: unknown,
  incomingDates: unknown
): string[] {
  return Array.from(
    new Set([
      ...normalizeEntertainmentDates(existingDates),
      ...normalizeEntertainmentDates(incomingDates),
    ])
  );
}

/** Merge raso de notas por faixa (álbuns): incoming sobrescreve só as chaves informadas. */
export function mergeTrackRatings(
  existing: Record<string, number> | undefined,
  incoming: Record<string, number> | undefined
): Record<string, number> | undefined {
  if (!incoming || Object.keys(incoming).length === 0) return existing;
  return { ...existing, ...incoming };
}
