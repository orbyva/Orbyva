import type { ToolDefinition } from "../registry.ts";
import { searchBooksGoogle } from "../../catalog/googleBooks.ts";
import { summarizeBookProposal } from "../../summary.ts";

export const searchBookCatalogTool: ToolDefinition = {
  name: "search_book_catalog",
  description:
    "Busca livros no catálogo (Google Books) por título e autor opcional. Devolve candidatos com google_id — use exatamente esse google_id e o title devolvido em propose_mark_book, nunca invente.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Título do livro" },
      author: { type: "string", description: "Autor, se souber" },
    },
    required: ["title"],
  },
  handler: async (input) => {
    const title = String(input.title ?? "").trim();
    const author = input.author ? String(input.author).trim() : "";
    if (!title) return { candidates: [] };
    const query = author ? `${title} ${author}` : title;
    const candidates = await searchBooksGoogle(query);
    return { candidates };
  },
};

export const proposeMarkBookTool: ToolDefinition = {
  name: "propose_mark_book",
  description:
    "Propõe marcar um livro (já resolvido via search_book_catalog) com status/nota/página. Não grava direto — só cria uma proposta que o usuário confirma na interface.",
  input_schema: {
    type: "object",
    properties: {
      google_id: {
        type: "string",
        description: "google_id devolvido por search_book_catalog",
      },
      title: {
        type: "string",
        description: "Título exato devolvido por search_book_catalog",
      },
      status: {
        type: "string",
        enum: ["to_read", "reading", "read", "abandoned"],
      },
      rating: {
        type: "number",
        description: "Nota de 0 a 10, só se o usuário informou explicitamente",
      },
      read_date: {
        type: "string",
        description: "Data ISO (YYYY-MM-DD); se omitido e status=read, usa hoje",
      },
      current_page: { type: "integer" },
      notes: { type: "string" },
      would_recommend: { type: "boolean" },
      is_favorite: { type: "boolean" },
    },
    required: ["google_id", "title", "status"],
  },
  handler: async (input, ctx) => {
    const googleId = String(input.google_id ?? "").trim();
    const title = String(input.title ?? "").trim();
    if (!googleId || !title) {
      return { error: "google_id e title são obrigatórios." };
    }

    const status = String(input.status ?? "to_read");
    const readDate = input.read_date
      ? String(input.read_date)
      : status === "read"
        ? ctx.todayIso
        : null;

    const payload = {
      google_id: googleId,
      title,
      status,
      rating: input.rating != null ? Number(input.rating) : null,
      read_date: readDate,
      current_page: input.current_page != null ? Number(input.current_page) : null,
      notes: (input.notes as string | undefined) ?? null,
      would_recommend: (input.would_recommend as boolean | undefined) ?? true,
      is_favorite: (input.is_favorite as boolean | undefined) ?? false,
    };

    const summary = summarizeBookProposal(payload);
    ctx.proposals.push({
      tool_name: "propose_mark_book",
      module: "books",
      payload,
      summary,
    });
    return { ok: true, summary };
  },
};
