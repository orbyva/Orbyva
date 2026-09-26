import { formatLocalIsoDate } from "@/lib/dates";

export { formatLocalIsoDate } from "@/lib/dates";

/**
 * Helpers compartilhados de insights de entretenimento (Cinema / Livros / Música).
 *
 * Onda 2 (não nesta entrega): `buildYearRecap(year, { movies, books, albums })`
 * + share canvas, reutilizar `isEntertainmentFavorite`, `datesTouchYear` e as
 * stats de cada domínio. Entrada discreta no módulo/Conta; mínimo ~3 itens no ano.
 */

export function isEntertainmentFavorite(item: {
  is_favorite?: boolean | null;
}): boolean {
  return item.is_favorite === true;
}

/** Acrescenta o dia de hoje quando o item passa a “concluído”, sem duplicar. */
export function appendActivityDate(dates: string[], todayIso: string): string[] {
  if (dates.includes(todayIso)) return dates;
  return [...dates, todayIso];
}

function parseOneDateToken(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return formatLocalIsoDate(raw);
  }
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const value = String(raw).trim();
  if (!value) return null;

  // ISO / timestamp
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // BR DD/MM/YYYY
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }

  // Date.toString() residual, tenta parse
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return formatLocalIsoDate(parsed);
  }
  return null;
}

/**
 * Normaliza listas de datas vindas do Supabase / formulários
 * (Date[], ISO, JSON stringificado, literal Postgres `{a,b}`).
 */
export function normalizeEntertainmentDates(
  dates: unknown
): string[] {
  if (dates == null) return [];

  let list: unknown[] = [];
  if (Array.isArray(dates)) {
    list = dates;
  } else if (typeof dates === "string") {
    const trimmed = dates.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        /* ignore */
      }
    } else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      list = trimmed
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    } else {
      list = [trimmed];
    }
  } else {
    return [];
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const iso = parseOneDateToken(item);
    if (!iso || seen.has(iso)) continue;
    seen.add(iso);
    out.push(iso);
  }
  return out;
}

export function datesTouchYear(
  dates: unknown,
  year: number
): boolean {
  const prefix = `${year}-`;
  return normalizeEntertainmentDates(dates).some((d) => d.startsWith(prefix));
}

/**
 * Ano civil da atividade: datas explícitas; se vazias, usa `created_at`
 * (proxy para itens marcados sem data).
 */
export function activityTouchesYear(
  dates: unknown,
  year: number,
  createdAt?: string | Date | null
): boolean {
  const normalized = normalizeEntertainmentDates(dates);
  if (normalized.length > 0) {
    return normalized.some((d) => d.startsWith(`${year}-`));
  }
  if (createdAt == null || createdAt === "") return false;
  return datesTouchYear([createdAt], year);
}

export function pickRandomItem<T>(items: T[]): T | null {
  if (!items.length) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? null;
}
