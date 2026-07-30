/**
 * Helpers compartilhados de insights de entretenimento (Cinema / Livros / Música).
 *
 * Onda 2 (não nesta entrega): `buildYearRecap(year, { movies, books, albums })`
 * + share canvas — reutilizar `isEntertainmentFavorite`, `datesTouchYear` e as
 * stats de cada domínio. Entrada discreta no módulo/Conta; mínimo ~3 itens no ano.
 */

export const ENTERTAINMENT_FAVORITE_MIN_RATING = 8;

export function isEntertainmentFavorite(item: {
  rating?: number | null;
  would_recommend?: boolean | null;
}): boolean {
  if (item.would_recommend === true) return true;
  return item.rating != null && item.rating >= ENTERTAINMENT_FAVORITE_MIN_RATING;
}

/** Normaliza datas ISO / Date para `YYYY-MM-DD`. */
export function normalizeEntertainmentDates(
  dates: Array<string | Date> | null | undefined
): string[] {
  if (!dates?.length) return [];
  return dates.map((d) =>
    d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
  );
}

export function datesTouchYear(
  dates: Array<string | Date> | null | undefined,
  year: number
): boolean {
  const prefix = `${year}-`;
  return normalizeEntertainmentDates(dates).some((d) => d.startsWith(prefix));
}

export function pickRandomItem<T>(items: T[]): T | null {
  if (!items.length) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? null;
}
