/**
 * Resolver NOME → ID no banco do usuário (feature 100).
 *
 * "as tarefas do Sacada" e "lança 80 reais em mercado" têm o mesmo problema: o modelo fala em nome,
 * o banco trabalha com id. As duas saídas ruins seriam deixá-lo inventar o id (erro silencioso) ou
 * obrigá-lo a uma rodada extra de listagem antes de cada chamada (latência e token em toda
 * interação). Aqui a própria tool resolve, com três desfechos possíveis e distintos:
 *
 *   - um casamento (ou um nome exato entre vários) → segue;
 *   - nenhum → `nao_encontrado`, com o nome que foi procurado;
 *   - vários → erro pedindo desempate, COM a lista de candidatos, para o modelo perguntar em vez de
 *     escolher por conta própria (é a regra de lacuna do prompt, aplicada em código).
 */

import type { OrbToolContext } from "./types.ts";
import { OrbToolError } from "./types.ts";
import { ilikePattern, isUuid, unwrap } from "./helpers.ts";

/** Teto de candidatos numa desambiguação: a lista existe para perguntar, não para ler. */
export const MAX_CANDIDATOS = 8;

export interface OrbLookupHit {
  id: string;
  label: string;
}

export interface OrbLookupSpec {
  table: string;
  /** Coluna do nome legível. */
  column: string;
  /** Como falar da coisa numa frase: "o projeto", "a viagem". */
  artigo: string;
  oQue: string;
  /** Colunas extras a trazer (o chamador lê em `extra`). */
  select?: string;
}

export const LOOKUPS = {
  project: { table: "project", column: "name", artigo: "o", oQue: "projeto" },
  tag: { table: "tag", column: "name", artigo: "a", oQue: "etiqueta" },
  trip: { table: "trip", column: "title", artigo: "a", oQue: "viagem" },
  note: { table: "note", column: "title", artigo: "a", oQue: "nota" },
  shopping_category: {
    table: "shopping_category",
    column: "name",
    artigo: "a",
    oQue: "categoria de compras",
  },
  finance_type: {
    table: "type",
    column: "name",
    artigo: "o",
    oQue: "tipo financeiro",
  },
  finance_class: {
    table: "class",
    column: "name",
    artigo: "a",
    oQue: "categoria financeira",
    select: "type:type_id(id, name, nature:nature_id(name))",
  },
} as const satisfies Record<string, OrbLookupSpec>;

export type OrbLookupKind = keyof typeof LOOKUPS;

export interface OrbLookupResult extends OrbLookupHit {
  /** A linha inteira, para quem precisa de mais que id e nome (a natureza de uma categoria). */
  row: Record<string, unknown>;
}

/**
 * Acha uma linha pelo nome (ou confere um id). `id` inventado pelo modelo NÃO passa direto: ele é
 * conferido no banco, senão a tela abriria vazia sem ninguém saber por quê.
 */
export async function lookupByName(
  ctx: OrbToolContext,
  kind: OrbLookupKind,
  termo: string
): Promise<OrbLookupResult> {
  const spec: OrbLookupSpec = LOOKUPS[kind];
  const colunas = ["id", spec.column, spec.select].filter(Boolean).join(", ");

  if (isUuid(termo) || /^\d+$/.test(termo)) {
    const chave = /^\d+$/.test(termo) ? Number(termo) : termo;
    const linhas = unwrap<Record<string, unknown>[]>(
      await ctx.db.from(spec.table).select(colunas).eq("user_id", ctx.userId).eq("id", chave).limit(1),
      spec.oQue
    );
    if (linhas.length === 0) {
      throw new OrbToolError(
        `Não achei ${spec.artigo} ${spec.oQue} com esse id. Procure pelo nome.`,
        "nao_encontrado"
      );
    }
    return montar(linhas[0], spec);
  }

  const linhas = unwrap<Record<string, unknown>[]>(
    await ctx.db
      .from(spec.table)
      .select(colunas)
      .eq("user_id", ctx.userId)
      .ilike(spec.column, ilikePattern(termo))
      .order(spec.column, { ascending: true })
      .limit(MAX_CANDIDATOS + 1),
    spec.oQue
  );

  if (linhas.length === 0) {
    throw new OrbToolError(
      `Não achei ${spec.artigo} ${spec.oQue} com "${termo}". Confira o nome antes de continuar.`,
      "nao_encontrado"
    );
  }

  // Nome exato (sem caixa) desempata sozinho: "Casa" não vira pergunta só porque existe "Casa nova".
  const exato = linhas.find(
    (linha) => String(linha[spec.column] ?? "").toLowerCase() === termo.toLowerCase()
  );
  if (exato) return montar(exato, spec);

  if (linhas.length > 1) {
    const nomes = linhas
      .slice(0, MAX_CANDIDATOS)
      .map((linha) => `"${String(linha[spec.column])}"`)
      .join(", ");
    throw new OrbToolError(
      `"${termo}" casa com mais de uma opção de ${spec.oQue}: ${nomes}. Pergunte qual e chame de novo com o nome inteiro.`
    );
  }

  return montar(linhas[0], spec);
}

function montar(linha: Record<string, unknown>, spec: OrbLookupSpec): OrbLookupResult {
  return {
    id: String(linha.id),
    label: String(linha[spec.column] ?? spec.oQue),
    row: linha,
  };
}

/**
 * Natureza financeira é global (sem `user_id`): Receita, Despesa, Investimento.
 * Não passa por `lookupByName` porque aquele sempre filtra por dono.
 */
export async function lookupNature(
  ctx: OrbToolContext,
  termo: string
): Promise<OrbLookupResult> {
  const linhas = unwrap<Record<string, unknown>[]>(
    await ctx.db
      .from("nature")
      .select("id, name")
      .ilike("name", ilikePattern(termo))
      .order("name", { ascending: true })
      .limit(MAX_CANDIDATOS + 1),
    "naturezas"
  );

  if (linhas.length === 0) {
    throw new OrbToolError(
      `Não achei a natureza "${termo}". Use Receita, Despesa ou Investimento.`,
      "nao_encontrado"
    );
  }

  const exato = linhas.find(
    (linha) => String(linha.name ?? "").toLowerCase() === termo.toLowerCase()
  );
  if (exato) {
    return { id: String(exato.id), label: String(exato.name), row: exato };
  }
  if (linhas.length > 1) {
    const nomes = linhas
      .slice(0, MAX_CANDIDATOS)
      .map((linha) => `"${String(linha.name)}"`)
      .join(", ");
    throw new OrbToolError(
      `"${termo}" casa com mais de uma natureza: ${nomes}. Chame ask_user e use o nome exato.`
    );
  }
  return { id: String(linhas[0].id), label: String(linhas[0].name), row: linhas[0] };
}
