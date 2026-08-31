export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Formata número para input: `1234.5` → `1.234,50`. */
export function formatMoneyInput(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Interpreta digitação pt-BR (`1.234,56` / `1234,56`) ou en-US (`1234.56`).
 * Retorna `null` se vazio/inválido.
 */
export function parseMoneyInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");

  let normalized = trimmed.replace(/[^\d.,-]/g, "");

  if (hasComma && hasDot) {
    // 1.234,56 → remove milhares, vírgula vira decimal
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = normalized.replace(",", ".");
  }
  // só ponto: trata como decimal en-US (1234.56)

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Extrai só dígitos e interpreta como centavos (`123456` → `1234.56`). */
export function moneyFromDigits(digits: string): number | null {
  const cleaned = digits.replace(/\D/g, "");
  if (!cleaned) return null;
  return Number(cleaned) / 100;
}

/** Placeholder de "sem data". Era um travessão até a troca por "·" — a comparação em
 *  `formatDateTimeBR` depende deste valor, então ele vive numa constante só. */
export const EMPTY_DATE = "·";

export function formatDateBR(isoDate: string | null | undefined): string {
  if (!isoDate) return EMPTY_DATE;
  const datePart = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return isoDate;
  return datePart.split("-").reverse().join("/");
}

/** `formatDateBR` + hora opcional (HH:mm ou HH:mm:ss) → "dd/mm/yyyy" ou "dd/mm/yyyy HH:mm". */
export function formatDateTimeBR(
  isoDate: string | null | undefined,
  time?: string | null
): string {
  const datePart = formatDateBR(isoDate);
  if (datePart === EMPTY_DATE || !time) return datePart;
  return `${datePart} ${time.slice(0, 5)}`;
}
