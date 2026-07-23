import { letterboxdToTen } from "@/domain/movies";

export type ImportSource = "letterboxd" | "tvtime" | "generic";

export interface ImportedWatch {
  title: string;
  year: number | null;
  rating: number | null;
  watchedDate: string | null;
  notes: string | null;
  /** Letterboxd URI or other external id when present. */
  externalUrl?: string | null;
  source: ImportSource;
}

export interface ParseImportResult {
  source: ImportSource;
  rows: ImportedWatch[];
  errors: string[];
}

/**
 * Parse CSV exports from Letterboxd, TV Time–style backups, or a generic layout.
 *
 * Letterboxd diary/ratings typically has: Date, Name, Year, Letterboxd URI, Rating, ...
 * TV Time / generic: Title|Name|Show, Year, Rating|Score, Watched Date|Date, Notes|Review
 */
export function parseMovieImportCsv(csvText: string): ParseImportResult {
  const { headers, rows } = parseCsv(csvText);
  if (!headers.length) {
    return { source: "generic", rows: [], errors: ["CSV vazio ou inválido."] };
  }

  const source = detectSource(headers);
  const mapped = rows
    .map((row) => mapRow(headers, row, source))
    .filter((r): r is ImportedWatch => r != null);

  const errors: string[] = [];
  if (mapped.length === 0) {
    errors.push(
      "Nenhuma linha válida encontrada. Confira se o CSV tem colunas de título (Name/Title)."
    );
  }

  return { source, rows: mapped, errors };
}

function detectSource(headers: string[]): ImportSource {
  const h = headers.map((x) => x.toLowerCase());
  if (h.some((x) => x.includes("letterboxd"))) return "letterboxd";
  if (
    h.some((x) => x.includes("tv time") || x === "tvtime" || x.includes("episode"))
  ) {
    return "tvtime";
  }
  // Letterboxd diary often has Name + Letterboxd URI without the word in header of Name
  if (h.includes("name") && h.includes("year") && h.includes("rating")) {
    return "letterboxd";
  }
  return "generic";
}

function mapRow(
  headers: string[],
  row: string[],
  source: ImportSource
): ImportedWatch | null {
  const get = (...names: string[]) => {
    for (const name of names) {
      const idx = headers.findIndex(
        (h) => h.toLowerCase().trim() === name.toLowerCase()
      );
      if (idx >= 0 && row[idx]?.trim()) return row[idx].trim();
    }
    // partial match
    for (const name of names) {
      const idx = headers.findIndex((h) =>
        h.toLowerCase().includes(name.toLowerCase())
      );
      if (idx >= 0 && row[idx]?.trim()) return row[idx].trim();
    }
    return null;
  };

  const title =
    get("Name", "Title", "Film", "Movie", "Show Name", "Show") ?? null;
  if (!title) return null;

  const yearRaw = get("Year", "Release Year");
  const year = yearRaw ? parseInt(yearRaw, 10) : null;

  const ratingRaw = get("Rating", "Score", "My Rating", "Stars");
  let rating: number | null = null;
  if (ratingRaw) {
    const n = parseFloat(ratingRaw.replace(",", "."));
    if (!Number.isNaN(n)) {
      // Letterboxd is 0–5; others may already be 0–10
      if (source === "letterboxd" || n <= 5) {
        rating = letterboxdToTen(n);
      } else {
        rating = Math.min(10, Math.max(0, n));
      }
    }
  }

  const watchedDate =
    normalizeDate(
      get("Watched Date", "Date", "Watch Date", "Completed", "Last Watched")
    ) ?? null;

  const notes = get("Notes", "Review", "Comment", "Tags") ?? null;
  const externalUrl = get("Letterboxd URI", "URL", "Link") ?? null;

  return {
    title,
    year: year && !Number.isNaN(year) ? year : null,
    rating,
    watchedDate,
    notes,
    externalUrl,
    source,
  };
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  // DD/MM/YYYY
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const [, d, m, y] = br;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // MM/DD/YYYY
  const us = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

/** Minimal CSV parser supporting quoted fields. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = splitCsvLines(text.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvRow(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map(splitCsvRow).filter((r) => r.some((c) => c.trim()));
  return { headers, rows };
}

function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (current.trim()) lines.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) lines.push(current);
  return lines;
}

function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}
