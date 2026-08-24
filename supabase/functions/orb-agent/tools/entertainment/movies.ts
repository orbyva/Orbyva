import type { ToolDefinition } from "../registry.ts";
import {
  isTmdbConfigured,
  resolveMovieByImdbId,
  searchMoviesTmdb,
} from "../../catalog/tmdb.ts";
import { findMovieByTitleYearOmdb } from "../../catalog/omdb.ts";
import { summarizeMovieProposal } from "../../summary.ts";

export const searchMovieCatalogTool: ToolDefinition = {
  name: "search_movie_catalog",
  description:
    "Busca filmes/séries no catálogo (TMDB, com fallback OMDb) por título e ano opcional. Devolve candidatos com imdb_id — use exatamente esse imdb_id em propose_mark_movie, nunca invente um.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Título do filme ou série" },
      year: { type: "integer", description: "Ano de lançamento, se souber" },
    },
    required: ["title"],
  },
  handler: async (input) => {
    const title = String(input.title ?? "").trim();
    const year = input.year != null ? Number(input.year) : null;
    if (!title) return { candidates: [] };

    if (isTmdbConfigured()) {
      const hits = await searchMoviesTmdb(title, year);
      if (hits.length) return { candidates: hits };
    }

    const omdb = await findMovieByTitleYearOmdb(title, year);
    return {
      candidates: omdb
        ? [
            {
              imdb_id: omdb.imdb_id,
              title: omdb.title,
              year: omdb.year,
              media_type: omdb.type === "series" ? "tv" : "movie",
            },
          ]
        : [],
    };
  },
};

export const proposeMarkMovieTool: ToolDefinition = {
  name: "propose_mark_movie",
  description:
    "Propõe marcar um filme/série (já resolvido via search_movie_catalog) com status/nota/data. Não grava direto — só cria uma proposta que o usuário confirma na interface.",
  input_schema: {
    type: "object",
    properties: {
      imdb_id: {
        type: "string",
        description: "imdb_id devolvido por search_movie_catalog",
      },
      status: {
        type: "string",
        enum: ["to_watch", "watching", "watched", "abandoned"],
      },
      rating: {
        type: "number",
        description: "Nota de 0 a 10, só se o usuário informou explicitamente",
      },
      watched_date: {
        type: "string",
        description: "Data ISO (YYYY-MM-DD); se omitido e status=watched, usa hoje",
      },
      notes: { type: "string" },
      would_recommend: { type: "boolean" },
      is_favorite: { type: "boolean" },
    },
    required: ["imdb_id", "status"],
  },
  handler: async (input, ctx) => {
    const imdbId = String(input.imdb_id ?? "").trim();
    if (!imdbId) return { error: "imdb_id é obrigatório." };

    const movie = await resolveMovieByImdbId(imdbId);
    if (!movie) {
      return {
        error:
          "Não encontrei esse filme/série no catálogo. Chame search_movie_catalog de novo.",
      };
    }

    const status = String(input.status ?? "to_watch");
    const watchedDate = input.watched_date
      ? String(input.watched_date)
      : status === "watched"
        ? ctx.todayIso
        : null;

    const payload = {
      imdb_id: movie.imdb_id,
      title: movie.title,
      year: movie.year,
      poster: movie.poster,
      genre: movie.genre,
      director: movie.director,
      actors: movie.actors,
      plot: movie.plot,
      type: movie.type,
      score_imdb: movie.score_imdb,
      tmdb_tv_id: movie.tmdb_tv_id,
      status,
      rating: input.rating != null ? Number(input.rating) : null,
      watched_dates: watchedDate ? [watchedDate] : [],
      notes: (input.notes as string | undefined) ?? null,
      would_recommend: (input.would_recommend as boolean | undefined) ?? true,
      is_favorite: (input.is_favorite as boolean | undefined) ?? false,
    };

    const summary = summarizeMovieProposal(payload);
    ctx.proposals.push({
      tool_name: "propose_mark_movie",
      module: "movies",
      payload,
      summary,
    });
    return { ok: true, summary };
  },
};
