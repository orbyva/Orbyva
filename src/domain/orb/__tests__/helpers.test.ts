import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifyDbError,
  exclusiveEnd,
  ilikeOr,
  ilikePattern,
  instantFromLocalTime,
  limitInfo,
  localDateInTz,
  monthsAgoRange,
  paginate,
  unwrap,
} from "../../../../supabase/functions/_shared/orb/helpers.ts";
import { OrbToolError } from "../../../../supabase/functions/_shared/orb/types.ts";

/**
 * Helpers puros das tools da Orb. Moram fora de `src/` (rodam também no Deno da Edge e no Node do
 * MCP) e o Vitest é o único runtime do projeto que os executa — por isso o teto de qualidade deles
 * é este arquivo.
 */

describe("exclusiveEnd", () => {
  it("devolve o dia seguinte, que é a fronteira certa para timestamptz", () => {
    expect(exclusiveEnd("2026-09-30")).toBe("2026-10-01");
  });

  it("atravessa fim de mês e de ano", () => {
    // 2026 não é bissexto: fevereiro fecha no dia 28.
    expect(exclusiveEnd("2026-02-28")).toBe("2026-03-01");
    expect(exclusiveEnd("2026-12-31")).toBe("2027-01-01");
  });
});

describe("monthsAgoRange", () => {
  it("usa meses de calendário fechados e exclui o mês corrente", () => {
    expect(monthsAgoRange("2026-09-07", 3)).toEqual({
      start: "2026-06-01",
      end: "2026-08-31",
      months: 3,
    });
  });

  it("atravessa a virada do ano", () => {
    expect(monthsAgoRange("2026-01-15", 3)).toEqual({
      start: "2025-10-01",
      end: "2025-12-31",
      months: 3,
    });
  });

  it("não muda de janela conforme o dia da pergunta dentro do mesmo mês", () => {
    // É o bug B7: com janela de 30×N dias, perguntar dia 7 ou dia 28 dava médias diferentes.
    expect(monthsAgoRange("2026-09-28", 3)).toEqual(monthsAgoRange("2026-09-07", 3));
  });

  it("clampeia o número de meses em 1..12", () => {
    expect(monthsAgoRange("2026-09-07", 0).months).toBe(1);
    expect(monthsAgoRange("2026-09-07", Number.NaN).months).toBe(1);
    expect(monthsAgoRange("2026-09-07", 24)).toEqual({
      start: "2025-09-01",
      end: "2026-08-31",
      months: 12,
    });
  });
});

describe("localDateInTz", () => {
  it("devolve a data civil de quem perguntou, não a do UTC", () => {
    const instante = "2026-09-15T23:30:00-03:00";
    expect(localDateInTz(instante, "America/Sao_Paulo")).toBe("2026-09-15");
    // Mesmo instante, outro fuso: já é dia 16 em UTC. É exatamente o bug B6.
    expect(localDateInTz(instante, "UTC")).toBe("2026-09-16");
  });

  it("funciona para fuso a leste de Greenwich", () => {
    expect(localDateInTz("2026-09-15T23:30:00Z", "Asia/Tokyo")).toBe("2026-09-16");
  });

  it("não lança com fuso inválido — cai para a data do próprio ISO", () => {
    expect(() => localDateInTz("2026-09-15T23:30:00Z", "Nao/Existe")).not.toThrow();
    expect(localDateInTz("2026-09-15T23:30:00Z", "Nao/Existe")).toBe("2026-09-15");
  });
});

/** Uma página com `quantidade` linhas, como o PostgREST devolveria. */
function pagina(de: number, quantidade: number) {
  return Promise.resolve({
    data: Array.from({ length: quantidade }, (_, indice) => ({ i: de + indice })),
    error: null,
  });
}

describe("paginate", () => {
  it("junta as páginas até vir uma curta", async () => {
    const chamadas: [number, number][] = [];
    const { rows, truncated } = await paginate<{ i: number }>((de, ate) => {
      chamadas.push([de, ate]);
      return pagina(de, de === 0 ? 1000 : 3);
    }, "as transações");

    expect(rows).toHaveLength(1003);
    expect(truncated).toBe(false);
    expect(chamadas).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    // Sem paginação o PostgREST cortaria em 1000 em silêncio, e a soma sairia errada com cara de
    // exata — o modo de falha que a paginação existe para matar.
    expect(rows[1002]).toEqual({ i: 1002 });
  });

  it("para no teto e avisa quando a página nunca acaba", async () => {
    let chamadas = 0;
    const { rows, truncated } = await paginate<{ i: number }>((de) => {
      chamadas += 1;
      return pagina(de, 1000);
    }, "as transações");

    expect(rows).toHaveLength(5000);
    expect(truncated).toBe(true);
    expect(chamadas).toBe(5);
  });

  it("respeita pageSize e max customizados", async () => {
    const { rows, truncated } = await paginate<{ i: number }>(
      (de) => pagina(de, 2),
      "as transações",
      { pageSize: 2, max: 4 }
    );

    expect(rows).toHaveLength(4);
    expect(truncated).toBe(true);
  });

  it("propaga erro do banco como OrbToolError, com o rótulo em PT-BR", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        paginate(() => Promise.resolve({ data: null, error: { message: "boom" } }), "as transações")
      ).rejects.toThrow("Não consegui ler as transações agora.");
    } finally {
      log.mockRestore();
    }
  });
});

/**
 * Bug B12: `unwrap` concatenava `result.error.message` na mensagem que vai para o modelo — nome de
 * coluna, nome de constraint e trecho de SQL vazavam para o usuário final. O detalhe passou a viver
 * em `error.detail` + log, e a causa em `error.code`, que é o que o host usa para reautenticar.
 */
describe("unwrap", () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
  });

  /** Executa `unwrap` e devolve o `OrbToolError` que ele lançou. */
  function erroDe(result: { data: unknown; error: unknown; status?: number }): OrbToolError {
    try {
      unwrap(result, "as transações");
    } catch (erro) {
      return erro as OrbToolError;
    }
    throw new Error("unwrap não lançou");
  }

  it("devolve data, e lista vazia quando data é null", () => {
    expect(unwrap<number[]>({ data: [1, 2], error: null }, "as transações")).toEqual([1, 2]);
    expect(unwrap<number[]>({ data: null, error: null }, "as transações")).toEqual([]);
  });

  it("não vaza o texto do Postgrest na mensagem, mas guarda em detail e no log", () => {
    const erro = erroDe({
      data: null,
      error: {
        message: "column task.user_id does not exist",
        code: "42703",
        hint: 'Perhaps you meant to reference the column "task.id".',
      },
    });

    expect(erro).toBeInstanceOf(OrbToolError);
    expect(erro.message).toBe("Não consegui ler as transações agora.");
    expect(erro.message).not.toContain("user_id");
    expect(erro.code).toBe("erro_de_banco");
    expect(erro.detail).toContain("42703");
    expect(erro.detail).toContain("column task.user_id does not exist");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("42703"));
  });

  it("classifica sessão expirada com code próprio, para o host reautenticar", () => {
    expect(erroDe({ data: null, error: { message: "JWT expired" } }).code).toBe("auth_expirada");
    expect(erroDe({ data: null, error: { message: "boom" }, status: 401 }).code).toBe(
      "auth_expirada"
    );
    expect(erroDe({ data: null, error: { message: "boom", code: "PGRST301" } }).code).toBe(
      "auth_expirada"
    );
    expect(erroDe({ data: null, error: { message: "JWT expired" } }).message).toContain(
      "sessão expirou"
    );
  });
});

/**
 * A lista de sinais é a mesma que `mcp/server.ts` procurava por regex no texto do erro. Se um
 * padrão sair daqui sem substituto, a reautenticação automática morre em silêncio.
 */
describe("classifyDbError", () => {
  it("reconhece todos os sinais de sessão expirada que o host já tratava", () => {
    for (const message of [
      "JWT expired",
      "jwt is expired",
      "token is expired",
      "invalid JWT",
      "invalid claim: missing sub claim",
      "PGRST301",
      "request failed with 401",
    ]) {
      expect(classifyDbError({ message }), message).toBe("auth_expirada");
    }
    expect(classifyDbError(undefined, 401)).toBe("auth_expirada");
    expect(classifyDbError({ code: "PGRST302", message: "anonymous access" })).toBe(
      "auth_expirada"
    );
  });

  it("trata o resto como erro de banco", () => {
    expect(classifyDbError({ message: "column task.foo does not exist", code: "42703" })).toBe(
      "erro_de_banco"
    );
    expect(classifyDbError(new Error("network timeout"))).toBe("erro_de_banco");
    expect(classifyDbError(undefined)).toBe("erro_de_banco");
  });
});

/**
 * Avaliador de LIKE do Postgres, o bastante para provar o que o escape MUDA: `%` casa qualquer
 * sequência, `_` casa um caractere e `\` escapa o seguinte.
 *
 * Existe porque comparar só a string do padrão prova a FORMA, não o EFEITO — e o efeito é o bug:
 * um `%` não escapado casa a tabela inteira e o modelo apresenta o resultado como "a sua busca".
 */
function casaLike(padrao: string, valor: string): boolean {
  const literal = (caractere: string) => caractere.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let regex = "";
  for (let i = 0; i < padrao.length; i += 1) {
    const atual = padrao[i];
    if (atual === "\\") {
      const proximo = padrao[i + 1];
      i += 1;
      regex += proximo === undefined ? "\\\\" : literal(proximo);
      continue;
    }
    if (atual === "%") {
      regex += "[\\s\\S]*";
      continue;
    }
    if (atual === "_") {
      regex += "[\\s\\S]";
      continue;
    }
    regex += literal(atual);
  }
  return new RegExp(`^${regex}$`).test(valor);
}

describe("ilikePattern", () => {
  it("envolve o termo em % e não mexe em texto comum", () => {
    expect(ilikePattern("mercado")).toBe("%mercado%");
  });

  it("neutraliza o % do termo: '50%' procura '50%', não 'qualquer coisa com 50'", () => {
    expect(ilikePattern("50%")).toBe("%50\\%%");

    // A prova que morde: sem o escape o padrão vira `%50%%`, que casa QUALQUER linha com "50".
    expect(casaLike(ilikePattern("50%"), "Uber 50% off")).toBe(true);
    expect(casaLike(ilikePattern("50%"), "Mercado 5000 reais")).toBe(false);
    expect(casaLike("%50%%", "Mercado 5000 reais")).toBe(true);
  });

  it("neutraliza o _ do termo: 'a_b' procura 'a_b', não 'a<qualquer>b'", () => {
    expect(ilikePattern("a_b")).toBe("%a\\_b%");

    expect(casaLike(ilikePattern("a_b"), "casa_bonita")).toBe(true);
    expect(casaLike(ilikePattern("a_b"), "axb")).toBe(false);
    expect(casaLike("%a_b%", "axb")).toBe(true);
  });

  it("escapa a \\ antes de tudo, senão ela viraria escape do que veio depois", () => {
    // `\%` digitado tem que procurar `\` seguido de `%`, não "escape de %".
    expect(ilikePattern("100\\%")).toBe("%100\\\\\\%%");
    expect(casaLike(ilikePattern("100\\%"), "desconto 100\\% ao ano")).toBe(true);
    expect(casaLike(ilikePattern("100\\%"), "desconto 100 ao ano")).toBe(false);
  });
});

describe("ilikeOr", () => {
  it("repete o padrão por coluna, com o valor aspado para o .or() do PostgREST", () => {
    expect(ilikeOr(["name", "notes"], "bar")).toBe('name.ilike."%bar%",notes.ilike."%bar%"');
  });

  it("carrega o mesmo escape de curinga que ilikePattern", () => {
    expect(ilikeOr(["name"], "50%")).toBe('name.ilike."%50\\%%"');
  });

  it("dobra a aspa do termo, que é o que separa valor de sintaxe dentro do .or()", () => {
    // `,` `.` `(` `)` dentro do termo só sobrevivem porque o valor viaja aspado; a aspa do próprio
    // termo fecharia esse par cedo demais e quebraria o filtro inteiro.
    expect(ilikeOr(["name"], 'bar do "Zé", 2')).toBe('name.ilike."%bar do ""Zé"", 2%"');
  });
});

describe("limitInfo", () => {
  it("não inventa truncagem quando a página veio curta", () => {
    expect(limitInfo(7, 30, "lançamentos")).toEqual({ limit: 30 });
  });

  it("avisa quando a página veio cheia, que é o único sinal disponível de corte", () => {
    const info = limitInfo(30, 30, "lançamentos") as {
      limit: number;
      truncated: boolean;
      truncated_warning: string;
    };
    expect(info.limit).toBe(30);
    expect(info.truncated).toBe(true);
    expect(info.truncated_warning).toContain("30 lançamentos");
    expect(info.truncated_warning).toContain("estreite o filtro");
  });
});

describe("instantFromLocalTime", () => {
  it("resolve a hora de parede pelo offset do fuso, não por UTC", () => {
    // 14:00 em São Paulo (UTC-3) é 17:00Z. Sem isto o Postgres leria "14:00" como UTC e o evento
    // apareceria às 11:00 na agenda.
    expect(instantFromLocalTime("2026-09-20", "14:00", "America/Sao_Paulo")).toBe(
      "2026-09-20T17:00:00.000Z"
    );
  });

  it("usa o offset que vale NAQUELE dia (horário de verão)", () => {
    // Lisboa: WEST (UTC+1) no verão, WET (UTC+0) no inverno.
    expect(instantFromLocalTime("2026-07-15", "09:00", "Europe/Lisbon")).toBe(
      "2026-07-15T08:00:00.000Z"
    );
    expect(instantFromLocalTime("2026-01-15", "09:00", "Europe/Lisbon")).toBe(
      "2026-01-15T09:00:00.000Z"
    );
  });

  it("atravessa o dia quando o fuso está à frente de UTC", () => {
    expect(instantFromLocalTime("2026-09-20", "08:00", "Asia/Tokyo")).toBe(
      "2026-09-19T23:00:00.000Z"
    );
  });

  it("cai para UTC quando o fuso vindo do browser é inválido", () => {
    expect(instantFromLocalTime("2026-09-20", "14:00", "Fuso/Inexistente")).toBe(
      "2026-09-20T14:00:00.000Z"
    );
  });
});
