/** Tool de compras da Orb: a lista de compras agrupada por categoria. Somente leitura. */

import type { OrbTool } from "../types.ts";
import { clampLimit, ilikePattern, num, str, unwrap } from "../helpers.ts";

interface ShoppingCategoryRow {
  id: string;
  name: string;
  project_id: string | null;
}

interface ShoppingItemRow {
  id: string;
  shopping_category_id: string | null;
  title: string;
  description: string | null;
  /** `numeric` no Postgres — o PostgREST pode devolver como texto; sempre passe por `Number`. */
  quantity: number | string | null;
  unit: string | null;
  provider_link: string | null;
  status: string;
}

/**
 * Rótulo do pseudo-grupo dos itens sem categoria. É o MESMO texto de
 * `UNCATEGORIZED_GROUP_LABEL` (`src/domain/shopping/filters.ts`) de propósito: a tela e a Orb têm
 * que chamar a mesma coisa pelo mesmo nome.
 *
 * `shopping_item.shopping_category_id` é nulo desde `20260819090000_shopping_item_optional_category.sql`
 * (feature 066) — item sem categoria é o fluxo de captura rápida ("pilha AA"), não uma anomalia.
 * Ignorá-lo faria a Orb responder "não falta nada" com a lista cheia.
 */
const SEM_CATEGORIA = "Sem categoria";

/** Chave interna do pseudo-grupo — não é id de linha nenhuma, só indexa o agrupamento. */
const SEM_CATEGORIA_KEY = "__sem_categoria__";

/** Descrição do item cortada neste tamanho: é campo de texto livre e o retorno tem teto. */
const MAX_DESCRICAO = 200;

function corta(texto: string | null): string | null {
  if (!texto) return null;
  const limpo = texto.trim();
  if (limpo === "") return null;
  return limpo.length > MAX_DESCRICAO ? `${limpo.slice(0, MAX_DESCRICAO)}…` : limpo;
}

/** Um item já no formato que vai para o modelo. */
interface ItemSaida {
  id: string;
  title: string;
  status: string;
  quantity: number | null;
  unit: string | null;
  description: string | null;
  provider_link: string | null;
}

interface Grupo {
  category_id: string | null;
  category_name: string;
  project_id: string | null;
  pending: number;
  purchased: number;
  items: ItemSaida[];
}

export const queryShoppingList: OrbTool = {
  name: "query_shopping_list",
  title: "Lista de compras",
  description:
    "Itens da lista de compras agrupados por categoria, com quantidade, unidade, link do " +
    "fornecedor e o status (pending = ainda falta comprar, purchased = já comprado). Use para " +
    "'o que falta comprar?', 'o que tem na lista do mercado?', 'já comprei a furadeira?'. " +
    "Item sem categoria aparece no grupo 'Sem categoria'. Não existe preço na lista de compras " +
    "do app, então não há total em dinheiro — só contagem de itens.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["pending", "purchased"],
        description:
          "Filtra por status. 'pending' é o que ainda falta comprar. Omita para trazer os dois.",
      },
      category: {
        type: "string",
        description:
          "Nome (ou parte do nome) da categoria, ex.: 'mercado'. Use 'sem categoria' para os " +
          "itens soltos. Quando nenhuma categoria casa, a resposta traz a lista de nomes existentes.",
      },
      project_id: {
        type: "string",
        description:
          "Id do projeto (ver query_projects) — traz só as categorias vinculadas a ele. O vínculo " +
          "com projeto é da categoria, nunca do item.",
      },
      search: { type: "string", description: "Texto a procurar no título do item." },
      limit: { type: "number", description: "Máximo de itens (1 a 200, padrão 50)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 50, 200);
    const status = str(input, "status");
    const categoria = str(input, "category");
    const projectId = str(input, "project_id");
    const search = str(input, "search");

    const categorias = unwrap<ShoppingCategoryRow[]>(
      await ctx.db
        .from("shopping_category")
        .select("id, name, project_id")
        .eq("user_id", ctx.userId)
        .order("name", { ascending: true }),
      "as categorias de compras"
    );

    // Filtro por nome resolvido em memória e convertido em `.in(ids)`: filtrar depois de ler
    // esconderia itens (o teto do banco é aplicado antes), e `ilike` na categoria exigiria um join
    // que o PostgREST só faz com embed.
    let idsPermitidos: string[] | null = null;
    let somenteSemCategoria = false;

    if (projectId) {
      idsPermitidos = categorias
        .filter((linha) => linha.project_id === projectId)
        .map((linha) => linha.id);
      if (idsPermitidos.length === 0) {
        return {
          project_id: projectId,
          groups: [],
          total_items: 0,
          warning: "Nenhuma categoria de compras está vinculada a este projeto.",
        };
      }
    }

    if (categoria) {
      const alvo = categoria.trim().toLowerCase();
      if (alvo === SEM_CATEGORIA.toLowerCase() || alvo === "sem") {
        // Item solto não pertence a projeto nenhum (o vínculo com projeto é da categoria —
        // feature 052), então a combinação com `project_id` é vazia por definição, não por falta
        // de dado.
        if (projectId) {
          return {
            project_id: projectId,
            groups: [],
            total_items: 0,
            warning:
              "Item sem categoria não pertence a projeto nenhum — o vínculo com projeto é da " +
              "categoria.",
          };
        }
        somenteSemCategoria = true;
        idsPermitidos = null;
      } else {
        const doProjeto = idsPermitidos;
        const candidatas = doProjeto
          ? categorias.filter((linha) => doProjeto.includes(linha.id))
          : categorias;
        const casadas = candidatas.filter((linha) => linha.name.toLowerCase().includes(alvo));
        if (casadas.length === 0) {
          return {
            groups: [],
            total_items: 0,
            warning: `Nenhuma categoria de compras com "${categoria}" no nome.`,
            available_categories: categorias.map((linha) => linha.name).concat(SEM_CATEGORIA),
          };
        }
        idsPermitidos = casadas.map((linha) => linha.id);
      }
    }

    let query = ctx.db
      .from("shopping_item")
      .select(
        "id, shopping_category_id, title, description, quantity, unit, provider_link, status"
      )
      .eq("user_id", ctx.userId);
    if (somenteSemCategoria) query = query.is("shopping_category_id", null);
    else if (idsPermitidos) query = query.in("shopping_category_id", idsPermitidos);
    if (status) query = query.eq("status", status);
    if (search) query = query.ilike("title", ilikePattern(search));

    const itens = unwrap<ShoppingItemRow[]>(
      await query.order("created_at", { ascending: true }).limit(limit),
      "a lista de compras"
    );

    const porId = new Map<string, ShoppingCategoryRow>();
    for (const linha of categorias) porId.set(linha.id, linha);

    const grupos = new Map<string, Grupo>();
    for (const item of itens) {
      // `== null` (e não `=== null`) pelo mesmo motivo de `groupItemsByCategory`
      // (`src/domain/shopping/filters.ts`): ausência de categoria é ausência, venha ela como
      // `null` do banco ou como campo faltando.
      const categoriaDoItem =
        item.shopping_category_id == null ? undefined : porId.get(item.shopping_category_id);
      const chave = categoriaDoItem?.id ?? SEM_CATEGORIA_KEY;
      let grupo = grupos.get(chave);
      if (!grupo) {
        grupo = {
          category_id: categoriaDoItem?.id ?? null,
          category_name: categoriaDoItem?.name ?? SEM_CATEGORIA,
          project_id: categoriaDoItem?.project_id ?? null,
          pending: 0,
          purchased: 0,
          items: [],
        };
        grupos.set(chave, grupo);
      }
      if (item.status === "purchased") grupo.purchased += 1;
      else grupo.pending += 1;
      grupo.items.push({
        id: item.id,
        title: item.title,
        status: item.status,
        quantity: item.quantity === null ? null : Number(item.quantity),
        unit: item.unit,
        description: corta(item.description),
        provider_link: item.provider_link,
      });
    }

    // Mesma ordenação da tela (`groupItemsByCategory`): categorias em ordem alfabética, o
    // pseudo-grupo "Sem categoria" sempre por último, e dentro do grupo o que falta comprar antes
    // do que já foi comprado.
    const ordenados = [...grupos.values()].sort((a, b) => {
      if (a.category_id === null) return 1;
      if (b.category_id === null) return -1;
      return a.category_name.localeCompare(b.category_name, "pt-BR");
    });
    for (const grupo of ordenados) {
      grupo.items = [
        ...grupo.items.filter((item) => item.status === "pending"),
        ...grupo.items.filter((item) => item.status !== "pending"),
      ];
    }

    const pendentes = ordenados.reduce((soma, grupo) => soma + grupo.pending, 0);
    const comprados = ordenados.reduce((soma, grupo) => soma + grupo.purchased, 0);

    return {
      total_items: itens.length,
      pending_items: pendentes,
      purchased_items: comprados,
      groups: ordenados,
      // Bateu o teto: as contagens acima valem só para o que voltou, não para a lista inteira.
      ...(itens.length >= limit
        ? {
            truncated: true,
            truncated_warning:
              `A lista foi cortada em ${limit} itens — as contagens valem só para os que ` +
              "vieram. Peça de novo com filtro de categoria ou status para ver o resto.",
          }
        : {}),
    };
  },
};

export const shoppingTools: OrbTool[] = [queryShoppingList];
