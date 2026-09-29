/**
 * A API DE DADOS da Orb (feature 100): `describe_data` para entender o banco, `query_data` para
 * consultá-lo com filtro composto, ordenação e paginação.
 *
 * Por que ela existe, se já há 34 tools de intenção: aquelas respondem a pergunta prevista, e bem.
 * Esta responde a imprevista — "as tarefas de alta prioridade sem projeto criadas depois de agosto,
 * ordenadas por prazo" não é uma tool, é uma consulta. Sem ela, a Orb responderia "não consigo" a
 * um pedido que o banco responde em milissegundos.
 *
 * O que NÃO existe aqui, de propósito:
 * - SQL cru. O modelo não escreve SQL; ele descreve a consulta e o código monta o PostgREST. Tabela,
 *   coluna e operador saem de uma whitelist (`../schema.ts`); nada mais atravessa.
 * - Junção arbitrária. O PostgREST embute relação (`class(name)`), mas cada junção nova é uma
 *   superfície de erro e de custo; quem precisa de dado cruzado usa a tool de intenção, que já sabe
 *   fazer o join certo, ou faz duas consultas.
 * - Escrita. Continua valendo o P0: `query_data` é `select`.
 */

import type { OrbTool, OrbToolContext } from "../types.ts";
import { OrbToolError } from "../types.ts";
import { bool, clampLimit, ilikePattern, num, ownedIds, str, unwrap } from "../helpers.ts";
import {
  describeOrbTable,
  describeOrbTables,
  findOrbTable,
  ORB_TABLE_NAMES,
  type OrbColumn,
  type OrbTable,
} from "../schema.ts";

/** Teto de linhas por consulta. Acima disso o resultado não cabe no contexto sem virar ruído. */
const LIMITE_PADRAO = 25;
const LIMITE_MAXIMO = 200;

/** Operadores expostos ao modelo, com o método do PostgREST de cada um. */
const OPERADORES = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains_text",
  "starts_with",
  "in",
  "is_null",
  "not_null",
  "array_contains",
] as const;
type Operador = (typeof OPERADORES)[number];

interface Filtro {
  column: string;
  op: Operador;
  value?: unknown;
}

function ehRegistro(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
}

function coluna(tabela: OrbTable, nome: string): OrbColumn {
  const achada = tabela.columns.find((item) => item.name === nome);
  if (!achada) {
    throw new OrbToolError(
      `A tabela "${tabela.name}" não tem a coluna "${nome}". Colunas: ` +
        `${tabela.columns.map((item) => item.name).join(", ")}.`
    );
  }
  return achada;
}

/** Lista de colunas do `select`, sempre a partir da whitelist — nunca `*`. */
function colunasPedidas(tabela: OrbTable, input: Record<string, unknown>): string[] {
  const bruto = input.columns;
  if (bruto === undefined || bruto === null) return [...tabela.defaultColumns];
  const lista = Array.isArray(bruto) ? bruto : [bruto];
  const nomes = lista.map((item) => String(item).trim()).filter(Boolean);
  if (nomes.length === 0) return [...tabela.defaultColumns];
  for (const nome of nomes) coluna(tabela, nome);
  return nomes;
}

function lerFiltros(tabela: OrbTable, input: Record<string, unknown>): Filtro[] {
  const bruto = input.filters;
  if (bruto === undefined || bruto === null) return [];
  if (!Array.isArray(bruto)) {
    throw new OrbToolError(
      'O campo "filters" é uma lista de objetos {column, op, value}. Exemplo: ' +
        '[{"column":"status","op":"eq","value":"todo"}].'
    );
  }

  return bruto.map((item) => {
    if (!ehRegistro(item)) {
      throw new OrbToolError('Cada filtro é um objeto {column, op, value}.');
    }
    const nome = String(item.column ?? "").trim();
    const op = String(item.op ?? "eq").trim() as Operador;
    if (!OPERADORES.includes(op)) {
      throw new OrbToolError(
        `Operador "${op}" não existe. Use um destes: ${OPERADORES.join(", ")}.`
      );
    }
    const definicao = coluna(tabela, nome);

    const precisaDeValor = op !== "is_null" && op !== "not_null";
    if (precisaDeValor && (item.value === undefined || item.value === null)) {
      throw new OrbToolError(`O filtro em "${nome}" com "${op}" precisa de "value".`);
    }
    if (definicao.enum && (op === "eq" || op === "neq")) {
      const valor = String(item.value);
      if (!definicao.enum.includes(valor)) {
        throw new OrbToolError(
          `A coluna "${nome}" aceita apenas: ${definicao.enum.join(", ")}. Recebi "${valor}".`
        );
      }
    }
    if (op === "in" && !Array.isArray(item.value)) {
      throw new OrbToolError(`O filtro "in" em "${nome}" precisa de uma lista em "value".`);
    }
    return { column: nome, op, value: item.value };
  });
}

/** Aplica um filtro no builder. Cada `op` tem um método — nada é interpolado em texto de query. */
// deno-lint-ignore no-explicit-any
function aplicar(query: any, filtro: Filtro): any {
  switch (filtro.op) {
    case "eq":
      return query.eq(filtro.column, filtro.value);
    case "neq":
      return query.neq(filtro.column, filtro.value);
    case "gt":
      return query.gt(filtro.column, filtro.value);
    case "gte":
      return query.gte(filtro.column, filtro.value);
    case "lt":
      return query.lt(filtro.column, filtro.value);
    case "lte":
      return query.lte(filtro.column, filtro.value);
    case "contains_text":
      // `ilikePattern` escapa `%` e `_` do termo: um "50%" digitado pelo usuário é texto, não curinga.
      return query.ilike(filtro.column, ilikePattern(String(filtro.value)));
    case "starts_with":
      return query.ilike(filtro.column, `${String(filtro.value).replace(/[%_]/g, "\\$&")}%`);
    case "in":
      return query.in(filtro.column, filtro.value as unknown[]);
    case "is_null":
      return query.is(filtro.column, null);
    case "not_null":
      return query.not(filtro.column, "is", null);
    case "array_contains":
      return query.contains(
        filtro.column,
        Array.isArray(filtro.value) ? filtro.value : [filtro.value]
      );
  }
}

/**
 * Ids do pai, quando a tabela é do grupo que não tem `user_id`. Buscados ANTES de montar a query —
 * e não dentro de uma função que devolva o builder — porque o builder do PostgREST é *thenable*:
 * devolvê-lo de uma função `async` faria o `await` EXECUTAR a consulta e entregar `{data, error}` no
 * lugar do builder, com o escopo pela metade.
 */
async function idsDoPai(tabela: OrbTable, ctx: OrbToolContext): Promise<string[] | null> {
  if (tabela.scope.kind !== "parent") return null;
  return await ownedIds(ctx, tabela.scope.parent);
}

/**
 * Escopo por dono, lido do catálogo. É o ponto que a REGRA DE ESCOPO POR TABELA de `types.ts`
 * protege: `.eq("user_id")` numa tabela-filha dá 42703 em runtime, e o erro chega ao modelo como
 * "não consegui consultar" — dado ausente disfarçado de falha.
 */
// deno-lint-ignore no-explicit-any
function escopar(query: any, tabela: OrbTable, ctx: OrbToolContext, idsDoDono: string[] | null): any {
  if (tabela.scope.kind === "user_id") return query.eq("user_id", ctx.userId);
  if (tabela.scope.kind === "global") return query;
  return query.in(tabela.scope.column, idsDoDono ?? []);
}

export const describeData: OrbTool = {
  name: "describe_data",
  title: "Estrutura dos dados",
  description:
    "Mostra a estrutura do banco do usuário: tabelas, colunas, tipos, valores aceitos e como elas se ligam. " +
    "Chame ANTES de usar query_data numa tabela que você ainda não consultou nesta conversa — sem isso você não sabe o nome exato das colunas. " +
    "Sem argumento, lista as tabelas com uma linha cada.\n\nTabelas:\n" +
    describeOrbTables(),
  inputSchema: {
    type: "object",
    properties: {
      table: {
        type: "string",
        enum: [...ORB_TABLE_NAMES],
        description: "Tabela a detalhar. Omita para a lista completa.",
      },
    },
    additionalProperties: false,
  },
  run: (input) => {
    const nome = str(input, "table");
    if (!nome) {
      return Promise.resolve({
        tables: ORB_TABLE_NAMES.map((tabela) => {
          const definicao = findOrbTable(tabela)!;
          return {
            table: definicao.name,
            label: definicao.label,
            description: definicao.description,
            prefer_tool: definicao.preferTool ?? null,
          };
        }),
      });
    }
    const tabela = findOrbTable(nome);
    if (!tabela) {
      throw new OrbToolError(
        `Não existe a tabela "${nome}". Tabelas: ${ORB_TABLE_NAMES.join(", ")}.`,
        "nao_encontrado"
      );
    }
    return Promise.resolve(describeOrbTable(tabela));
  },
};

export const queryData: OrbTool = {
  name: "query_data",
  title: "Consulta livre",
  description:
    "Consulta genérica sobre uma tabela do usuário, com filtros compostos, ordenação e paginação. " +
    "Use quando nenhuma tool de intenção responder ao pedido: filtro incomum, coluna que as outras não devolvem, ordenação específica, contagem exata. " +
    "Quando existir tool de intenção para o assunto (o campo prefer_tool de describe_data diz qual), PREFIRA ela: já traz o cálculo pronto e custa menos. " +
    "Peça só as colunas que vai usar, e use count_only quando a pergunta for 'quantos'. " +
    "As colunas exatas vêm de describe_data — não adivinhe nome de coluna.",
  inputSchema: {
    type: "object",
    properties: {
      table: {
        type: "string",
        enum: [...ORB_TABLE_NAMES],
        description: "Tabela a consultar.",
      },
      columns: {
        type: "array",
        items: { type: "string" },
        description: "Colunas a trazer. Omita para as principais da tabela.",
      },
      filters: {
        type: "array",
        description:
          'Lista de {column, op, value}. Operadores: eq, neq, gt, gte, lt, lte, contains_text (texto contém, sem caixa), starts_with, in (value é lista), is_null, not_null, array_contains (para colunas de lista, como tag_ids). Todos os filtros valem juntos (E).',
        items: {
          type: "object",
          properties: {
            column: { type: "string" },
            op: { type: "string", enum: [...OPERADORES] },
            value: {},
          },
          required: ["column", "op"],
        },
      },
      order_by: { type: "string", description: "Coluna para ordenar." },
      descending: { type: "boolean", description: "true ordena do maior/mais recente para o menor." },
      limit: { type: "number", description: `Máximo de linhas (1 a ${LIMITE_MAXIMO}, padrão ${LIMITE_PADRAO}).` },
      offset: { type: "number", description: "Pular N linhas — para ver a página seguinte." },
      count_only: {
        type: "boolean",
        description:
          "true devolve SÓ a contagem exata, sem baixar linha nenhuma. É o jeito certo de responder 'quantos'.",
      },
      include_total: {
        type: "boolean",
        description: "true devolve, além das linhas, o total que casou os filtros.",
      },
    },
    required: ["table"],
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const nome = str(input, "table") ?? "";
    const tabela = findOrbTable(nome);
    if (!tabela) {
      throw new OrbToolError(
        `Não existe a tabela "${nome}". Tabelas: ${ORB_TABLE_NAMES.join(", ")}.`,
        "nao_encontrado"
      );
    }

    const colunas = colunasPedidas(tabela, input);
    const filtros = lerFiltros(tabela, input);
    const somenteContagem = bool(input, "count_only") === true;
    const querTotal = somenteContagem || bool(input, "include_total") === true;
    const limite = clampLimit(num(input, "limit"), LIMITE_PADRAO, LIMITE_MAXIMO);
    const salto = Math.max(0, Math.trunc(num(input, "offset") ?? 0));

    const ordenar = str(input, "order_by");
    if (ordenar) coluna(tabela, ordenar);
    const ordem = ordenar
      ? { column: ordenar, ascending: bool(input, "descending") !== true }
      : tabela.defaultOrder;

    // `head: true` faz o PostgREST responder só com o cabeçalho de contagem: a pergunta "quantas
    // tarefas atrasadas eu tenho?" vira uma resposta de bytes, em vez de baixar 300 linhas para
    // contá-las no isolate.
    const idsDoDono = await idsDoPai(tabela, ctx);
    let query = ctx.db
      .from(tabela.name)
      .select(colunas.join(", "), querTotal ? { count: "exact", head: somenteContagem } : undefined);
    query = escopar(query, tabela, ctx, idsDoDono);
    for (const filtro of filtros) query = aplicar(query, filtro);
    if (ordem) query = query.order(ordem.column, { ascending: ordem.ascending });
    if (!somenteContagem) query = query.range(salto, salto + limite - 1);

    const resposta = await query;
    const linhas = unwrap<Record<string, unknown>[]>(resposta, `a tabela ${tabela.name}`);
    const total = typeof resposta?.count === "number" ? resposta.count : undefined;

    if (somenteContagem) {
      return { table: tabela.name, count: total ?? 0, filters_applied: filtros.length };
    }

    return {
      table: tabela.name,
      columns: colunas,
      returned: linhas.length,
      ...(total !== undefined ? { total_matching: total } : {}),
      ...(linhas.length === limite
        ? {
            truncated: true,
            truncated_warning: `Vieram ${limite} linhas, que é o limite pedido. Pode haver mais — use offset ${
              salto + limite
            } para a página seguinte, ou count_only para saber o total.`,
          }
        : {}),
      rows: linhas,
    };
  },
};

export const dataTools: OrbTool[] = [describeData, queryData];
