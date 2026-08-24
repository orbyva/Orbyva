/** Porta mínima de `src/lib/googleBooks.ts` pra Deno — busca ranqueada por título/autor. */

const API = "https://www.googleapis.com/books/v1/volumes";

export type BookCandidate = {
  google_id: string;
  title: string;
  authors: string[];
  published_year: number | null;
};

function apiKey(): string | null {
  const key = (Deno.env.get("GOOGLE_BOOKS_API_KEY") ?? "").trim();
  return key || null;
}

export function isGoogleBooksConfigured(): boolean {
  return apiKey() != null;
}

type GoogleVolume = {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    language?: string;
  };
};

function yearFromDate(publishedDate?: string): number | null {
  if (!publishedDate) return null;
  const y = Number(publishedDate.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type RankedHit = BookCandidate & { language?: string | null };

function hitFromVolume(volume: GoogleVolume): RankedHit | null {
  const info = volume.volumeInfo;
  if (!volume.id || !info?.title?.trim()) return null;
  return {
    google_id: volume.id,
    title: info.title.trim(),
    authors: info.authors ?? [],
    published_year: yearFromDate(info.publishedDate),
    language: info.language ?? null,
  };
}

function scoreHit(hit: RankedHit, queryNorm: string): number {
  const titleNorm = normalizeText(hit.title);
  const authorsNorm = normalizeText(hit.authors.join(" "));
  const words = queryNorm.split(" ").filter((w) => w.length > 1);

  let score = 0;
  if (titleNorm === queryNorm) score += 120;
  else if (titleNorm.startsWith(queryNorm)) score += 90;
  else if (titleNorm.includes(queryNorm)) score += 70;

  if (words.length > 0) {
    const titleHits = words.filter((w) => titleNorm.includes(w)).length;
    const authorHits = words.filter((w) => authorsNorm.includes(w)).length;
    score += (titleHits / words.length) * 40;
    score += (authorHits / words.length) * 55;
  }

  if (authorsNorm.includes(queryNorm)) score += 50;
  if (hit.authors.length > 0) score += 8;
  if (hit.language === "pt" || hit.language === "pt-BR") score += 12;

  return score;
}

/**
 * Catálogo fora do ar ≠ livro inexistente.
 *
 * Uma chave do Google Books restrita por referer (as `VITE_*`, feitas pro
 * browser) responde 403 quando chamada da Edge, que não manda referer. Se isso
 * for tratado como "nada encontrado", todo livro — inclusive Dom Casmurro —
 * cai no cadastro manual, sem capa nem ISBN. A distinção precisa chegar ao
 * agente pra ele dizer "não consegui consultar" em vez de "não existe".
 */
export class BookCatalogUnavailableError extends Error {
  constructor(readonly status: number) {
    super(
      status === 403 || status === 401
        ? `Google Books recusou a chave (${status}). Chave restrita por referer não funciona na Edge — use uma chave de servidor.`
        : `Google Books indisponível (${status}).`
    );
    this.name = "BookCatalogUnavailableError";
  }
}

function isUnavailable(err: unknown): err is BookCatalogUnavailableError {
  return err instanceof BookCatalogUnavailableError;
}

async function fetchVolumeHits(q: string, key: string): Promise<RankedHit[]> {
  const url = new URL(API);
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "20");
  url.searchParams.set("printType", "books");
  url.searchParams.set("orderBy", "relevance");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  if (!res.ok) throw new BookCatalogUnavailableError(res.status);
  const data = (await res.json()) as { items?: GoogleVolume[] };
  return (data.items ?? [])
    .map(hitFromVolume)
    .filter((h): h is RankedHit => Boolean(h));
}

/** Busca por título/autor, combina frase + intitle + inauthor e ranqueia. */
export async function searchBooksGoogle(
  query: string
): Promise<BookCandidate[]> {
  const key = apiKey();
  const q = query.trim();
  if (!key || !q) return [];

  const queries = [`"${q}"`, `intitle:${q}`, `inauthor:${q}`];
  const settled = await Promise.all(
    queries.map((part) =>
      fetchVolumeHits(part, key).then(
        (hits) => ({ hits, err: null as unknown }),
        (err) => ({ hits: [] as RankedHit[], err })
      )
    )
  );
  // Se TODAS falharam por indisponibilidade, é a API que está fora — não dá pra
  // concluir que o livro não existe.
  if (settled.every((r) => isUnavailable(r.err))) {
    throw settled[0].err;
  }
  const batches = settled.map((r) => r.hits);

  const queryNorm = normalizeText(q);
  const byId = new Map<string, RankedHit>();
  for (const hit of batches.flat()) {
    if (!byId.has(hit.google_id)) byId.set(hit.google_id, hit);
  }

  const ranked = [...byId.values()]
    .map((hit) => ({ hit, score: scoreHit(hit, queryNorm) }))
    .filter(({ score }) => score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ hit }) => {
      const { language: _lang, ...rest } = hit;
      void _lang;
      return rest;
    });

  if (ranked.length > 0) return ranked;

  // Aqui pode engolir: se chegamos até este ponto, alguma query já respondeu,
  // então a API está no ar e uma falha isolada é só ausência de resultado.
  const loose = await fetchVolumeHits(q, key).catch(() => [] as RankedHit[]);
  return loose.slice(0, 8).map(({ language: _l, ...rest }) => {
    void _l;
    return rest;
  });
}
