/**
 * Fake do PostgREST usado pelos testes da Orb: encadeável, thenable e registrando o que foi
 * filtrado em cada tabela. É o log de filtros que sustenta as asserções que importam — o fake não
 * executa filtro nenhum, então o que se prova aqui é a QUERY que a tool monta, não o resultado do
 * Postgres.
 *
 * `.range()` e `.limit()` recortam as linhas de verdade, porque é disso que `paginate` depende para
 * saber que a página acabou.
 *
 * Duas extensões existem para os casos em que "não executa filtro nenhum" impediria o teste:
 * - as linhas de uma tabela podem ser uma FUNÇÃO do que foi filtrado (`(entry) => linhas`), para
 *   uma tool que lê a MESMA tabela duas vezes com filtros diferentes — `query_time_tracking` lê
 *   `task_time_entry` por período e depois com `.is("ended_at", null)`, e sem isso a segunda
 *   leitura devolveria também as sessões fechadas, matando justamente a regra sob teste;
 * - `erros` faz uma tabela responder `{ data: null, error }`, que é o único jeito de provar que
 *   `query_upcoming` continua respondendo quando UM módulo cai.
 */

import type { OrbDb } from "../../../../supabase/functions/_shared/orb/types.ts";

export type Recorded = { table: string; filters: [string, unknown][] };

/** Linhas de uma tabela: fixas, ou decididas pelo teste a partir dos filtros já registrados. */
export type FakeRows = unknown[] | ((entry: Recorded) => unknown[]);

/** Erro cru do PostgREST, na forma que `unwrap`/`classifyDbError` leem. */
export type FakeErro = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  /** HTTP da resposta — vem no envelope, ao lado de `data`/`error`. */
  status?: number;
};

/** Métodos que só registram e devolvem o próprio builder. */
const ENCADEAVEIS = [
  "select",
  "eq",
  "neq",
  "in",
  "gte",
  "lte",
  "gt",
  "lt",
  "is",
  "ilike",
  "like",
  "or",
  "not",
  "contains",
  "overlaps",
  "order",
];

/**
 * @param rowsByTable linhas por tabela; tabela ausente cai em `padrao`.
 * @param log acumulador compartilhado — uma entrada por `.from()`, na ordem em que aconteceram.
 * @param padrao linhas de qualquer tabela não listada (o guard de escopo precisa que TODA tabela
 *   devolva algo, senão a tool para antes de chegar na tabela-filha que se quer vigiar).
 * @param erros tabelas que respondem erro em vez de linhas, por nome.
 */
export function fakeDb(
  rowsByTable: Record<string, FakeRows>,
  log: Recorded[] = [],
  padrao: FakeRows = [],
  erros: Record<string, FakeErro> = {}
): OrbDb {
  return {
    from(table: string) {
      const entry: Recorded = { table, filters: [] };
      log.push(entry);
      const fonte = rowsByTable[table] ?? padrao;

      let inicio = 0;
      /** `undefined` = até o fim. Só `.limit()`/`.range()` mexem. */
      let fim: number | undefined;

      const resolver = () => {
        const erro = erros[table];
        if (erro) {
          const { status, ...corpo } = erro;
          return { data: null, error: corpo, status };
        }
        const rows = typeof fonte === "function" ? fonte(entry) : fonte;
        return { data: rows.slice(inicio, fim), error: null };
      };

      const builder: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolver()).then(resolve),
      };
      for (const method of ENCADEAVEIS) {
        builder[method] = (column?: string, value?: unknown) => {
          if (column) entry.filters.push([`${method}:${column}`, value]);
          return builder;
        };
      }
      builder.limit = (quantidade: number) => {
        entry.filters.push(["limit", quantidade]);
        const candidato = inicio + quantidade;
        fim = fim === undefined ? candidato : Math.min(fim, candidato);
        return builder;
      };
      builder.range = (de: number, ate: number) => {
        entry.filters.push(["range", [de, ate]]);
        inicio = de;
        fim = ate + 1;
        return builder;
      };
      return builder;
    },
  };
}

/** Acha o valor registrado para um filtro (`"eq:user_id"`, `"limit"`, `"range"`). */
export function filtro(entry: Recorded, chave: string): unknown {
  return entry.filters.find(([nome]) => nome === chave)?.[1];
}

/** A primeira leitura registrada numa tabela. */
export function leituraDe(log: Recorded[], table: string): Recorded {
  const entry = log.find((item) => item.table === table);
  if (!entry) throw new Error(`Nenhuma leitura registrada em "${table}"`);
  return entry;
}

/** Todas as leituras de uma tabela, na ordem — para tool que lê a mesma tabela mais de uma vez. */
export function leiturasDe(log: Recorded[], table: string): Recorded[] {
  return log.filter((item) => item.table === table);
}

/** Existe algum filtro com esta chave? (`"eq:user_id"` — o que o guard de escopo procura.) */
export function temFiltro(entry: Recorded, chave: string): boolean {
  return entry.filters.some(([nome]) => nome === chave);
}
