import type { ToolDefinition } from "./registry.ts";

const TABLE_BY_MODULE: Record<string, string> = {
  movies: "movie",
  books: "book",
  albums: "album",
};

export const queryRecentEntertainmentTool: ToolDefinition = {
  name: "query_recent_entertainment",
  description:
    "Lê itens recentes de um módulo de Entretenimento do próprio usuário (filmes/livros/álbuns), opcionalmente filtrando por status. Use quando o bootstrap não tiver contexto suficiente (ex.: 'o filme que comecei ontem').",
  input_schema: {
    type: "object",
    properties: {
      module: { type: "string", enum: ["movies", "books", "albums"] },
      status: { type: "string", description: "Status pra filtrar, se souber (ex.: watching, reading, to_listen)" },
    },
    required: ["module"],
  },
  handler: async (input, ctx) => {
    const moduleName = String(input.module ?? "");
    const table = TABLE_BY_MODULE[moduleName];
    if (!table) return { error: "module inválido" };

    let query = ctx.client
      .from(table)
      .select("title, status, rating")
      .eq("user_id", ctx.userId)
      .limit(10);
    if (input.status) query = query.eq("status", String(input.status));

    const { data, error } = await query;
    if (error) return { error: error.message };
    return { items: data ?? [] };
  },
};
