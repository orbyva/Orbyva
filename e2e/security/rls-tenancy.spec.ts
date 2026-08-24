import { expect, test } from "@playwright/test";
import { e2eEnv, passwordGrant, rest } from "../helpers/auth";

/**
 * Varredura de tenancy: para cada tabela com dono, tudo que o PostgREST devolve
 * ao usuário logado pertence a ele.
 *
 * Complementa `rls.spec.ts` — lá se prova que a conta B não alcança a linha
 * específica da conta A; aqui se prova que nenhuma tabela devolve linha de
 * terceiro. É o teste que pega policy esquecida em tabela nova, e custa uma
 * chamada REST por tabela: nenhuma massa criada, nenhuma limpeza necessária.
 *
 * Limite conhecido: tabela vazia passa sem provar nada. Não é motivo para não
 * ter o teste — é motivo para não confundi-lo com cobertura de leitura.
 */
const env = e2eEnv();

/** Tabelas com `user_id` próprio e policy `user_id = auth.uid()`. */
const OWNED_TABLES = [
  "transaction",
  "recurring_transaction",
  "monthly_budget",
  "class",
  "type",
  "personal_goal",
  "habit",
  "place_visit",
  "trip",
  "vehicle",
  "movie",
  "movie_episode",
  "album",
  "book",
  "book_note",
];

test.describe("tenancy por tabela", { tag: ["@critical", "@security"] }, () => {
  test.skip(!env.hasAuth, "Credenciais E2E ausentes");

  test("nenhuma tabela devolve linha de outro usuário", async () => {
    const session = await passwordGrant(env.email!, env.password!);
    const meuId = session.user.id;
    const vazamentos: string[] = [];
    const semDado: string[] = [];

    for (const table of OWNED_TABLES) {
      const { res, json, text } = await rest(table, session.access_token, {
        method: "GET",
        query: "select=user_id&limit=200",
      });

      // 404 = tabela inexistente; a lista acima ficou desatualizada.
      expect(res.status, `${table}: resposta inesperada — ${text}`).not.toBe(
        404
      );
      if (!res.ok) continue; // policy que nega leitura não é vazamento

      const rows = (json as { user_id: string | null }[]) ?? [];
      if (rows.length === 0) {
        semDado.push(table);
        continue;
      }

      const alheias = rows.filter((r) => r.user_id !== meuId).length;
      if (alheias > 0) {
        vazamentos.push(`${table}: ${alheias} de ${rows.length} linhas`);
      }
    }

    // Diagnóstico no relatório: tabela vazia não provou nada.
    if (semDado.length) {
      console.info(
        `[tenancy] sem dado na conta E2E (verificação vazia): ${semDado.join(", ")}`
      );
    }

    expect(vazamentos, "tabelas devolvendo linha de outro usuário").toEqual([]);
  });
});
