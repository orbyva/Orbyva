import { parseCsv } from "@/lib/movieImport";
import { downloadCsv, rowsToCsv, stampFilename } from "@/lib/csv";
import type { Class } from "@/types/finance";
import type { TransactionCreateRequest } from "@/types/finance";

export const FINANCE_CSV_HEADERS = [
  "id",
  "data",
  "descricao",
  "valor",
  "classe",
  "tipo",
  "natureza",
] as const;

export type FinanceImportRow = {
  data: string;
  descricao: string;
  valor: number;
  classe: string;
  tipo?: string;
  natureza?: string;
  classId?: number;
  line: number;
};

export type ParseFinanceImportResult = {
  rows: FinanceImportRow[];
  errors: string[];
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function colIndex(headers: string[], ...names: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const name of names) {
    const target = normalizeHeader(name);
    const idx = normalized.indexOf(target);
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseFinanceValue(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  // BR: 1.234,56 → 1234.56
  if (/^\d{1,3}(\.\d{3})*,\d+$/.test(t) || /^\d+,\d+$/.test(t)) {
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(t.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseFinanceDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const [, d, m, y] = br;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = Date.parse(t);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

/** Parse CSV no formato Orbyva (mesmo de exportFinanceCsv). */
export function parseFinanceImportCsv(csvText: string): ParseFinanceImportResult {
  const { headers, rows } = parseCsv(csvText);
  if (!headers.length) {
    return { rows: [], errors: ["CSV vazio ou inválido."] };
  }

  const iData = colIndex(headers, "data", "date", "transaction_at");
  const iDesc = colIndex(headers, "descricao", "description", "desc");
  const iValor = colIndex(headers, "valor", "value", "amount");
  const iClasse = colIndex(headers, "classe", "class", "categoria");
  const iTipo = colIndex(headers, "tipo", "type");
  const iNatureza = colIndex(headers, "natureza", "nature");

  if (iData < 0 || iDesc < 0 || iValor < 0 || iClasse < 0) {
    return {
      rows: [],
      errors: [
        "Cabeçalho inválido. Use o modelo Orbyva: data, descricao, valor, classe (tipo e natureza opcionais).",
      ],
    };
  }

  const out: FinanceImportRow[] = [];
  const errors: string[] = [];

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const data = parseFinanceDate(row[iData] ?? "");
    const descricao = (row[iDesc] ?? "").trim();
    const valor = parseFinanceValue(row[iValor] ?? "");
    const classe = (row[iClasse] ?? "").trim();
    const tipo = iTipo >= 0 ? (row[iTipo] ?? "").trim() : "";
    const natureza = iNatureza >= 0 ? (row[iNatureza] ?? "").trim() : "";

    if (!data && !descricao && valor == null && !classe) return;

    if (!data) {
      errors.push(`Linha ${line}: data inválida.`);
      return;
    }
    if (!descricao) {
      errors.push(`Linha ${line}: descrição vazia.`);
      return;
    }
    if (valor == null || valor === 0) {
      errors.push(`Linha ${line}: valor inválido.`);
      return;
    }
    if (!classe) {
      errors.push(`Linha ${line}: classe vazia.`);
      return;
    }

    out.push({
      data,
      descricao,
      valor,
      classe,
      tipo: tipo || undefined,
      natureza: natureza || undefined,
      line,
    });
  });

  if (!out.length && !errors.length) {
    errors.push("Nenhuma linha válida encontrada.");
  }

  return { rows: out, errors };
}

/** Resolve class_id a partir do nome (e tipo/natureza quando houver ambiguidade). */
export function resolveFinanceImportRows(
  rows: FinanceImportRow[],
  classes: Class[]
): { ready: FinanceImportRow[]; errors: string[] } {
  const ready: FinanceImportRow[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const name = row.classe.trim().toLowerCase();
    let matches = classes.filter(
      (c) => c.name.trim().toLowerCase() === name
    );

    if (row.tipo) {
      const tipo = row.tipo.trim().toLowerCase();
      const filtered = matches.filter(
        (c) => (c.type?.name ?? "").trim().toLowerCase() === tipo
      );
      if (filtered.length) matches = filtered;
    }

    if (row.natureza) {
      const nat = row.natureza.trim().toLowerCase();
      const filtered = matches.filter(
        (c) => (c.type?.nature?.name ?? "").trim().toLowerCase() === nat
      );
      if (filtered.length) matches = filtered;
    }

    if (matches.length === 0) {
      errors.push(
        `Linha ${row.line}: classe "${row.classe}" não encontrada. Crie-a em Dimensões.`
      );
      continue;
    }
    if (matches.length > 1) {
      errors.push(
        `Linha ${row.line}: classe "${row.classe}" ambígua (${matches.length}). Informe tipo/natureza no CSV.`
      );
      continue;
    }

    ready.push({ ...row, classId: matches[0].id });
  }

  return { ready, errors };
}

export function financeImportToCreateRequest(
  row: FinanceImportRow
): TransactionCreateRequest {
  if (!row.classId) throw new Error("classId ausente");
  return {
    class_id: row.classId,
    value: row.valor,
    description: row.descricao,
    transaction_at: `${row.data}T12:00:00.000Z`,
  };
}

export function downloadFinanceImportTemplate(): void {
  const csv = rowsToCsv([...FINANCE_CSV_HEADERS], [
    [
      "",
      "2026-01-15",
      "Mercado exemplo",
      "150.90",
      "Mercado",
      "Alimentação",
      "Despesa",
    ],
  ]);
  downloadCsv(stampFilename("orbyva-financas-modelo"), csv);
}
