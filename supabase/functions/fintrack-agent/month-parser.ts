const MONTH_NAMES: Record<string, number> = {
  janeiro: 1,
  jan: 1,
  fevereiro: 2,
  fev: 2,
  marco: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  maio: 5,
  mai: 5,
  junho: 6,
  jun: 6,
  julho: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  setembro: 9,
  set: 9,
  outubro: 10,
  out: 10,
  novembro: 11,
  nov: 11,
  dezembro: 12,
  dez: 12,
};

/** Ordem de tamanho decrescente — evita "jun" dentro de "junho" e "mai" dentro de "maio". */
const MONTH_NAME_ORDER = Object.entries(MONTH_NAMES).sort(
  (a, b) => b[0].length - a[0].length
);

export interface MonthRef {
  year: number;
  month: number;
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function defaultYear(text: string): number {
  const yearMatch = normalizeText(text).match(/\b(20\d{2})\b/);
  return yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
}

function previousMonthRef(ref: MonthRef): MonthRef {
  if (ref.month === 1) return { year: ref.year - 1, month: 12 };
  return { year: ref.year, month: ref.month - 1 };
}

function currentMonthRef(): MonthRef {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Extrai todos os meses mencionados no texto, na ordem em que aparecem. */
export function parseAllMonthsFromText(text: string): MonthRef[] {
  const normalized = normalizeText(text);
  const year = defaultYear(text);
  const found: Array<{ index: number; month: number }> = [];

  for (const [name, num] of MONTH_NAME_ORDER) {
    const regex = new RegExp(`\\b${name}\\b`, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(normalized)) !== null) {
      if (!found.some((f) => f.index === match!.index)) {
        found.push({ index: match.index, month: num });
      }
    }
  }

  if (/mes passado|mes anterior/.test(normalized)) {
    const prev = previousMonthRef(currentMonthRef());
    if (!found.some((f) => f.month === prev.month)) {
      found.push({ index: normalized.search(/mes passado|mes anterior/), month: prev.month });
    }
  }

  if (/mes atual|este mes|esse mes/.test(normalized)) {
    const cur = currentMonthRef();
    if (!found.some((f) => f.month === cur.month)) {
      found.push({ index: normalized.search(/mes atual|este mes|esse mes/), month: cur.month });
    }
  }

  return found
    .sort((a, b) => a.index - b.index)
    .map((f) => ({ year, month: f.month }));
}

export function hasExplicitMonth(text: string): boolean {
  return parseAllMonthsFromText(text).length > 0;
}

/** Primeiro mês mencionado (compatibilidade). */
export function parseMonthFromText(text: string): MonthRef {
  const all = parseAllMonthsFromText(text);
  if (all.length > 0) return all[0];
  return currentMonthRef();
}

export function isComparisonQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  if (parseAllMonthsFromText(text).length >= 2) return true;
  return /compar|entre|versus|\bvs\.?\b| x |percentual|evolu|variacao|diferenca|mês anterior|mes anterior|mes passado/.test(
    normalized
  );
}

/** Meses a buscar para comparação (mínimo 2). */
export function resolveComparisonMonths(text: string): MonthRef[] {
  const explicit = parseAllMonthsFromText(text);
  if (explicit.length >= 2) return explicit;

  if (explicit.length === 1 && isComparisonQuestion(text)) {
    const prev = previousMonthRef(explicit[0]);
    return [prev, explicit[0]];
  }

  const normalized = normalizeText(text);
  if (/mes passado|mes anterior|mês anterior/.test(normalized)) {
    const cur = currentMonthRef();
    return [previousMonthRef(cur), cur];
  }

  if (isComparisonQuestion(text)) {
    const cur = currentMonthRef();
    return [previousMonthRef(cur), cur];
  }

  return explicit;
}

export function monthLabel(year: number, month: number): string {
  const label = new Date(year, month - 1, 1).toLocaleString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function spendingRatePercent(income: number, expense: number): number | null {
  if (income <= 0) return null;
  return Math.round((expense / income) * 1000) / 10;
}
