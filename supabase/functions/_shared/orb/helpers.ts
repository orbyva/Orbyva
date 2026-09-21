/**
 * Utilitários das tools da Orb — sem import externo (ver `types.ts`).
 *
 * Tudo aqui é puro, exceto `paginate` e `ownedIds`: essas duas fazem I/O, mas só pelo client
 * injetado em `ctx.db`, nunca por API de runtime.
 */

import { OrbToolError } from "./types.ts";
import type { OrbToolContext, OrbToolErrorCode, OrbToolErrorDetail } from "./types.ts";

export function str(input: Record<string, unknown>, key: string): string | undefined {
  const raw = input[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  return String(raw);
}

export function num(input: Record<string, unknown>, key: string): number | undefined {
  const raw = input[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new OrbToolError(`"${key}" precisa ser um número.`);
  return parsed;
}

export function bool(input: Record<string, unknown>, key: string): boolean | undefined {
  const raw = input[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  return raw === true || raw === "true";
}

export function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(value)));
}

/**
 * Valor de um filtro `ilike` do PostgREST a partir de texto DIGITADO PELO USUÁRIO.
 *
 * PORQUÊ existir, e por que é UMA só: `%` e `_` são curingas do LIKE. Um `%` dentro do termo casa
 * a tabela inteira e um `_` casa qualquer caractere — a busca devolve linhas até o `limit` e o
 * modelo as apresenta como "o resultado da sua busca". Não é furo de escopo (o RLS e o
 * `.eq("user_id", …)` continuam de pé): é RESPOSTA ERRADA com cara de exata, que é pior. A `\` é
 * escapada primeiro porque é o próprio caractere de escape do LIKE.
 */
export function ilikePattern(termo: string): string {
  return `%${termo.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}

/**
 * O mesmo padrão pronto para dentro de um `.or(…)`: `coluna.ilike.<valor>` repetido por coluna.
 *
 * Ali o valor viaja numa lista, e `,` `.` `(` `)` do termo seriam lidos como SINTAXE do PostgREST —
 * o filtro inteiro quebra (e o erro chega ao usuário como "não consegui consultar") ou, pior, vira
 * uma condição a mais. Aspar o valor resolve; aspas do próprio termo dobram, como em CSV. É a mesma
 * forma de `src/api/search.ts`, a busca global do app.
 */
export function ilikeOr(colunas: string[], termo: string): string {
  const valor = `"${ilikePattern(termo).replace(/"/g, '""')}"`;
  return colunas.map((coluna) => `${coluna}.ilike.${valor}`).join(",");
}

/**
 * O `limit` aplicado + o aviso de lista cortada, para toda tool que corta no banco com `.limit()`.
 *
 * PORQUÊ o aviso precisa existir sempre que corta: `prompts.ts` manda o modelo avisar quando o
 * resultado traz `truncated: true`, e com essa instrução no ar a AUSÊNCIA do campo passa a ser lida
 * como "veio tudo" — antes dela o modelo não tinha opinião. Uma lista cortada em silêncio vira
 * "essas são todas as suas transações".
 *
 * Página cheia é o único sinal disponível sem pagar uma segunda query de contagem: `returned ===
 * limit` às vezes é a lista inteira por coincidência, e avisar à toa custa muito menos do que omitir.
 */
export function limitInfo(returned: number, limit: number, oQue: string): Record<string, unknown> {
  if (returned < limit) return { limit };
  return {
    limit,
    truncated: true,
    truncated_warning:
      `Vieram ${limit} ${oQue}, que é exatamente o limite pedido: a lista pode estar cortada. ` +
      "Avise que ela pode estar incompleta e estreite o filtro (período, texto, status) em vez de " +
      "subir o limit.",
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

export function isoDate(input: Record<string, unknown>, key: string): string | undefined {
  const raw = str(input, key);
  if (raw === undefined) return undefined;
  if (!ISO_DATE.test(raw)) throw new OrbToolError(`"${key}" precisa estar em YYYY-MM-DD.`);
  return raw;
}

/** `YYYY-MM` → primeiro dia do mês (`budget_month` é sempre dia 1 no banco). */
export function monthStart(input: Record<string, unknown>, key: string, today: string): string {
  const raw = str(input, key);
  if (raw === undefined) return `${today.slice(0, 7)}-01`;
  if (ISO_MONTH.test(raw)) return `${raw}-01`;
  if (ISO_DATE.test(raw)) return `${raw.slice(0, 7)}-01`;
  throw new OrbToolError(`"${key}" precisa estar em YYYY-MM.`);
}

/** Último dia do mês de `monthStartIso` (`YYYY-MM-01`), sem depender de fuso. */
export function monthEnd(monthStartIso: string): string {
  const year = Number(monthStartIso.slice(0, 4));
  const month = Number(monthStartIso.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthStartIso.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}

/** `daysBefore` dias antes de `iso` (inclusive), em `YYYY-MM-DD`. */
export function shiftDays(iso: string, days: number): string {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Fim EXCLUSIVO de uma janela de datas — o dia seguinte a `isoDate`.
 *
 * PORQUÊ existir em vez de `.lte(coluna, fim)`: `transaction_at` e `starts_at` são `timestamptz`,
 * e o Postgres lê `.lte("transaction_at", "2026-09-30")` como `2026-09-30T00:00:00Z` — o dia 30
 * inteiro some do total. O par certo é `.gte(coluna, inicio).lt(coluna, exclusiveEnd(fim))`.
 *
 * A fronteira é em UTC de propósito: é a convenção do app inteiro — a view
 * `vw_value_by_nature_year_month` agrupa por `transaction_at::date` em UTC
 * (`supabase/migrations/20260804150000_spend_month_sql.sql:11-12`) e `src/api/finance` usa
 * `…T23:59:59.999Z`. Converter para o fuso local aqui faria a Orb e a tela de Finanças darem
 * totais diferentes para o mesmo mês, que é um erro pior do que o que se está corrigindo.
 */
export function exclusiveEnd(isoDate: string): string {
  return shiftDays(isoDate, 1);
}

/**
 * Janela de meses de CALENDÁRIO fechados, terminando no mês anterior ao de `today`.
 * `monthsAgoRange("2026-09-07", 3)` → `{ start: "2026-06-01", end: "2026-08-31", months: 3 }`.
 *
 * PORQUÊ não `30 * N` dias: com janela deslizante, uma despesa fixa (aluguel do dia 8) cai 2 ou 3
 * vezes dentro dela conforme o dia em que a pergunta é feita, e a média mensal muda sozinha entre
 * duas perguntas idênticas. Mês fechado também exclui o mês corrente, que está pela metade.
 *
 * `Date.UTC` em vez do construtor local: o processo da Edge roda em UTC e o do MCP no fuso da
 * máquina — sem isso o mesmo `today` produziria janelas diferentes nos dois runtimes.
 */
export function monthsAgoRange(
  today: string,
  months: number
): { start: string; end: string; months: number } {
  const span = Math.max(1, Math.min(12, Number.isFinite(months) ? Math.trunc(months) : 1));
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  // Dia 0 do mês de `today` = último dia do mês anterior.
  const end = new Date(Date.UTC(year, month - 1, 0));
  const start = new Date(Date.UTC(year, month - 1 - span, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    months: span,
  };
}

/**
 * Data civil (`YYYY-MM-DD`) de um `timestamptz` no fuso do usuário. Use para decidir "em que dia
 * isto cai para quem perguntou" — offset fixo (`-03:00`) quebra no horário de verão e para quem
 * está fora do Brasil.
 *
 * `Intl` existe nos dois runtimes (Deno e Node), então não viola a regra deste diretório. Fuso
 * inválido vindo do browser cai para a data do próprio ISO em vez de derrubar a tool.
 */
export function localDateInTz(isoTimestamp: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(isoTimestamp));
  } catch {
    return isoTimestamp.slice(0, 10);
  }
}

/** Offset do fuso, em minutos, VALENDO no instante dado (respeita horário de verão). */
function offsetEmMinutos(instante: number, timeZone: string): number {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instante));
  const campo = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value ?? 0);
  // `% 24`: com `hour12: false` algumas versões de ICU devolvem "24" para meia-noite.
  const comoUtc = Date.UTC(
    campo("year"),
    campo("month") - 1,
    campo("day"),
    campo("hour") % 24,
    campo("minute"),
    campo("second")
  );
  return (comoUtc - instante) / 60_000;
}

/**
 * Hora de PAREDE no fuso do usuário (`2026-09-20` + `14:00`) → instante ISO em UTC.
 *
 * PORQUÊ existir: `project_event.starts_at` é `timestamptz`
 * (`20260820110000_project_event_project_optional.sql:20`). Mandar `"2026-09-20T14:00:00"` sem fuso
 * faz o Postgres castar no fuso da SESSÃO (UTC no Supabase) — o evento que a pessoa confirmou para
 * as 14:00 aparece na agenda às 11:00 em São Paulo. A tela manual não tem esse problema porque grava
 * `new Date(<datetime-local>).toISOString()`, ou seja, já resolve o offset no browser; a Orb roda no
 * servidor e precisa resolver aqui.
 *
 * Duas passadas de propósito: na virada do horário de verão o offset do palpite pode não ser o do
 * instante final, e a segunda passada converge.
 */
export function instantFromLocalTime(isoDate: string, hhmm: string, timeZone: string): string {
  const parede = Date.parse(`${isoDate}T${hhmm}:00Z`);
  if (!Number.isFinite(parede)) return `${isoDate}T${hhmm}:00.000Z`;
  try {
    const palpite = parede - offsetEmMinutos(parede, timeZone) * 60_000;
    const instante = parede - offsetEmMinutos(palpite, timeZone) * 60_000;
    return new Date(instante).toISOString();
  } catch {
    // Fuso inválido vindo do browser: UTC é melhor que derrubar a proposta inteira.
    return new Date(parede).toISOString();
  }
}

/** Tamanho de página padrão — é o `db.max_rows` default do Supabase. */
const PAGE_SIZE = 1000;
/** Teto duro de linhas por leitura, para um período absurdo não estourar a memória do isolate. */
const MAX_ROWS = 5000;

/**
 * Lê uma query em páginas via `.range(from, to)` até vir página curta ou bater o teto.
 *
 * PORQUÊ: sem isto o PostgREST corta em `db.max_rows` (1000 por padrão) **em silêncio** — a tool
 * soma o que veio e a Orb responde um total errado com cara de exato, que é o pior modo de falha
 * possível para um assistente financeiro. Quando o teto bate, `truncated: true` sobe até a
 * resposta para o modelo poder avisar que a base está incompleta.
 */
export async function paginate<T>(
  makeQuery: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown; error: unknown; status?: number }>,
  what: string,
  opts?: { pageSize?: number; max?: number }
): Promise<{ rows: T[]; truncated: boolean }> {
  const pageSize = Math.max(1, Math.trunc(opts?.pageSize ?? PAGE_SIZE));
  const max = Math.max(pageSize, Math.trunc(opts?.max ?? MAX_ROWS));
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const page = unwrap<T[]>(await makeQuery(from, from + pageSize - 1), what);
    for (const row of page) rows.push(row);
    if (page.length < pageSize) return { rows, truncated: false };
    if (rows.length >= max) return { rows: rows.slice(0, max), truncated: true };
  }
}

const PARENT_LABEL: Record<"trip" | "vehicle" | "habit", string> = {
  trip: "as viagens",
  vehicle: "os veículos",
  habit: "os hábitos",
};

/**
 * Ids das linhas da tabela-pai que pertencem ao usuário, para escopar as tabelas-filhas com
 * `.in("<pai>_id", await ownedIds(ctx, "<pai>"))`.
 *
 * É o único caminho válido para o grupo (b) da REGRA DE ESCOPO POR TABELA documentada no cabeçalho
 * de `types.ts`: essas tabelas não têm coluna `user_id` e `.eq("user_id", …)` nelas dá 42703 em
 * runtime, que `registry.ts` engole e transforma num "não consegui consultar" sem causa aparente.
 */
export async function ownedIds(
  ctx: OrbToolContext,
  parent: "trip" | "vehicle" | "habit"
): Promise<string[]> {
  const rows = unwrap<{ id: string }[]>(
    await ctx.db.from(parent).select("id").eq("user_id", ctx.userId),
    PARENT_LABEL[parent]
  );
  return rows.map((row) => row.id);
}

/**
 * Sinais de JWT morto no texto do erro. É a MESMA lista que `mcp/server.ts` usava por regex sobre a
 * mensagem final — mantida aqui, em cima do erro cru, porque agora a mensagem que sai é estável e
 * não dá mais para reconhecer sessão expirada por ela. Quem precisa da causa lê `code`.
 */
const SINAIS_DE_SESSAO_EXPIRADA =
  /jwt (expired|is expired)|token is expired|invalid jwt|invalid claim|pgrst301|\b401\b/i;

/**
 * Códigos do PostgREST para credencial recusada: `PGRST301` (JWT inválido ou expirado) e
 * `PGRST302` (acesso anônimo negado, que é o que sobra quando o header vai sem token).
 */
const CODIGOS_DE_AUTH = new Set(["PGRST301", "PGRST302"]);

/** Achata o erro cru num texto de log. NUNCA use o retorno numa mensagem para o modelo. */
export function describeDbError(error: unknown, status?: number): string {
  const bruto = (typeof error === "object" && error !== null ? error : {}) as OrbToolErrorDetail;
  const partes = [
    bruto.code ? `code=${bruto.code}` : undefined,
    status !== undefined ? `status=${status}` : undefined,
    bruto.message ?? (typeof error === "string" ? error : undefined),
    bruto.details ? `details=${bruto.details}` : undefined,
    bruto.hint ? `hint=${bruto.hint}` : undefined,
  ].filter((parte): parte is string => Boolean(parte));
  return partes.length > 0 ? partes.join(" | ") : String(error);
}

/**
 * Sessão expirada ou erro de banco? A distinção é o que permite ao host reautenticar e repetir a
 * chamada em vez de responder "não consegui consultar" — checa o dado estruturado (`code`, HTTP
 * 401) primeiro e só depois cai no texto, que é o único sinal em algumas respostas do GoTrue.
 */
export function classifyDbError(error: unknown, status?: number): OrbToolErrorCode {
  const bruto = (typeof error === "object" && error !== null ? error : {}) as OrbToolErrorDetail;
  if (status === 401 || bruto.status === 401) return "auth_expirada";
  if (bruto.code && CODIGOS_DE_AUTH.has(String(bruto.code).toUpperCase())) return "auth_expirada";
  const texto = bruto.message ?? (typeof error === "string" ? error : "");
  return SINAIS_DE_SESSAO_EXPIRADA.test(texto) ? "auth_expirada" : "erro_de_banco";
}

/**
 * Abre o `{ data, error }` do PostgREST e transforma erro em `OrbToolError` com mensagem ESTÁVEL.
 *
 * PORQUÊ não concatenar `result.error.message` (bug B12): esse texto traz nome de coluna, nome de
 * constraint e às vezes trecho de SQL, e ele ia inteiro para o modelo — que o repetia para o
 * usuário. O detalhe agora vive só em `error.detail` e no log; a causa vive em `error.code`.
 *
 * `console.error` é a ÚNICA API de runtime permitida neste diretório: existe idêntica no Deno da
 * Edge e no Node do MCP (ao contrário de `Deno.*`/`process.*`), e sem ela o detalhe técnico se
 * perderia por completo — trocar vazamento por cegueira não seria correção.
 */
export function unwrap<T>(
  // deno-lint-ignore no-explicit-any
  result: { data: any; error: any; status?: number },
  what: string
): T {
  if (result.error) {
    const code = classifyDbError(result.error, result.status);
    const detail = describeDbError(result.error, result.status);
    console.error(`[orb] falha ao ler ${what} (${code}): ${detail}`);
    throw new OrbToolError(
      code === "auth_expirada"
        ? "Sua sessão expirou. Entre de novo no Orbyva para eu poder consultar seus dados."
        : `Não consegui ler ${what} agora.`,
      code,
      detail
    );
  }
  return (result.data ?? []) as T;
}

/** Arredonda para centavos — evita `0.30000000000000004` no JSON que vai pro modelo. */
export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Id de banco (uuid v4 do Postgres). Vale como teste de "isto é um id, não um nome" — as tools que
 * aceitam `"Sacada"` ou o uuid do projeto decidem por aqui qual dos dois caminhos seguir.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(valor: string | undefined | null): boolean {
  return typeof valor === "string" && UUID_RE.test(valor);
}

/**
 * CAMPOS SÓ DE UI (feature 100).
 *
 * Uma tool pode devolver campos prefixados com `ui_` — capa de livro, pôster de filme, cor de
 * etiqueta. Eles existem para a tela desenhar um cartão de verdade, e são retirados antes do
 * resultado ir para o modelo: 30 URLs de pôster são ~2 mil tokens que não ajudam a responder nada,
 * pagos em toda rodada seguinte do turno porque o histórico volta inteiro.
 *
 * Quem consome o resultado como DADO (o modelo, nos dois hosts) chama isto; quem consome como TELA
 * (o evento `tool` do SSE) recebe o objeto inteiro.
 */
export function stripUiFields<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map((item) => stripUiFields(item)) as unknown as T;
  }
  if (valor && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      if (chave.startsWith("ui_")) continue;
      saida[chave] = stripUiFields(item);
    }
    return saida as unknown as T;
  }
  return valor;
}
