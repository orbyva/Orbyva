/**
 * Formatação do resultado de tool para o cartão mobile — sem dump de JSON.
 */

export interface OrbToolTable {
  colunas: string[];
  linhas: unknown[][];
}

function ehObjetoSimples(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function ehEscalar(valor: unknown): boolean {
  return (
    valor === null ||
    valor === undefined ||
    typeof valor === "string" ||
    typeof valor === "number" ||
    typeof valor === "boolean"
  );
}

function linhasCandidatas(summary: unknown): unknown[] | null {
  if (Array.isArray(summary)) return summary;
  if (!ehObjetoSimples(summary)) return null;
  const listas = Object.values(summary).filter(Array.isArray) as unknown[][];
  return listas.length === 1 ? listas[0] : null;
}

/** Lista homogênea de objetos rasos → tabela; senão `null`. */
export function resumoDeToolParaTabela(summary: unknown): OrbToolTable | null {
  const candidatas = linhasCandidatas(summary);
  if (!candidatas || candidatas.length === 0) return null;

  const primeira = candidatas[0];
  if (!ehObjetoSimples(primeira)) return null;
  const colunas = Object.keys(primeira);
  if (colunas.length === 0) return null;

  const linhas: unknown[][] = [];
  for (const item of candidatas) {
    if (!ehObjetoSimples(item)) return null;
    if (Object.keys(item).length !== colunas.length) return null;
    if (!colunas.every((coluna) => coluna in item)) return null;
    const celulas = colunas.map((coluna) => item[coluna]);
    if (!celulas.every(ehEscalar)) return null;
    linhas.push(celulas);
  }

  return { colunas, linhas };
}

const PREFERRED_TITLE_KEYS = [
  "class_name",
  "name",
  "title",
  "description",
  "label",
  "type_name",
];

/** Colunas preferidas para uma linha compacta no mobile (título + 1 meta). */
export function colunasCompactas(colunas: string[]): { titulo: string; meta?: string } {
  const titulo =
    PREFERRED_TITLE_KEYS.find((k) => colunas.includes(k)) ??
    colunas.find((c) => !/_id$/.test(c) && c !== "id") ??
    colunas[0];
  const meta = colunas.find(
    (c) =>
      c !== titulo &&
      (c === "nature" ||
        c === "type_name" ||
        c === "status" ||
        c === "value" ||
        c === "amount")
  );
  return { titulo, meta };
}

export function formatarCelulaCurta(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(valor);
  }
  return String(valor);
}

/**
 * Uma linha para o cabeçalho do cartão fechado. Nunca devolve JSON.
 * `null` = não mostrar corpo (só o rótulo da tool).
 */
export function resumoCurtoDeTool(summary: unknown): string | null {
  if (summary === null || summary === undefined) return null;
  if (typeof summary === "string") {
    const t = summary.trim();
    return t ? (t.length > 120 ? `${t.slice(0, 117)}…` : t) : null;
  }

  const tabela = resumoDeToolParaTabela(summary);
  if (tabela) {
    const n = tabela.linhas.length;
    return n === 1 ? "1 item" : `${n} itens`;
  }

  if (ehObjetoSimples(summary)) {
    if (typeof summary.error === "string" && summary.error.trim()) {
      return summary.error.trim();
    }
    if (summary.truncated === true) {
      const itens = summary.itens ?? summary.count ?? summary.total;
      if (typeof itens === "number") return `Resumo · ${itens} itens`;
      return "Resultado grande (resumido)";
    }
  }

  return null;
}

export const MAX_LINHAS_TOOL_CARD = 8;

export function linhasCompactasVisiveis(tabela: OrbToolTable): {
  tituloIdx: number;
  metaIdx: number | null;
  linhas: { titulo: string; meta?: string }[];
  restantes: number;
} {
  const { titulo, meta } = colunasCompactas(tabela.colunas);
  const tituloIdx = tabela.colunas.indexOf(titulo);
  const metaIdx = meta ? tabela.colunas.indexOf(meta) : -1;
  const slice = tabela.linhas.slice(0, MAX_LINHAS_TOOL_CARD);
  const linhas = slice.map((linha) => ({
    titulo: formatarCelulaCurta(linha[tituloIdx]),
    meta: metaIdx >= 0 ? formatarCelulaCurta(linha[metaIdx]) : undefined,
  }));
  return {
    tituloIdx,
    metaIdx: metaIdx >= 0 ? metaIdx : null,
    linhas,
    restantes: Math.max(0, tabela.linhas.length - slice.length),
  };
}
