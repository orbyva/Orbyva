import type { ToolDefinition } from "../registry.ts";
import { resolveAlbumDetail, searchAlbums } from "../../catalog/music.ts";
import { summarizeAlbumProposal } from "../../summary.ts";

export const searchAlbumCatalogTool: ToolDefinition = {
  name: "search_album_catalog",
  description:
    "Busca álbuns no catálogo (Spotify, com fallback MusicBrainz). Informe título, ou só o artista quando o usuário não souber o nome do álbum (ex.: 'o novo álbum do Drake') — nesse caso os candidatos vêm do mais recente pro mais antigo. Devolve id+source — use exatamente esses valores em propose_mark_album, nunca invente.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Título do álbum, se souber" },
      artist: { type: "string", description: "Artista" },
    },
    // Um dos dois basta: sem título, busca a discografia do artista.
    required: [],
  },
  handler: async (input, ctx) => {
    const title = String(input.title ?? "").trim();
    const artist = input.artist ? String(input.artist).trim() : "";
    if (!title && !artist) {
      return { error: "Informe ao menos title ou artist." };
    }

    // `artist:` é filtro nativo do Spotify — sem título, restringe a busca à
    // discografia em vez de casar o nome do artista com títulos de álbum.
    const query = title
      ? artist
        ? `${title} ${artist}`
        : title
      : `artist:${artist}`;

    const candidates = await searchAlbums(query, ctx.supabaseUrl, ctx.authHeader);

    if (!title) {
      // Busca por artista: "o mais novo" é a pergunta usual, então ordena por
      // ano desc. Sem ano vai pro fim, não pro topo.
      candidates.sort(
        (a, b) => (b.release_year ?? -Infinity) - (a.release_year ?? -Infinity)
      );
      return { candidates, sorted_by: "release_year_desc" };
    }
    return { candidates };
  },
};

export const proposeMarkAlbumTool: ToolDefinition = {
  name: "propose_mark_album",
  description:
    "Propõe marcar um álbum (já resolvido via search_album_catalog) com status/nota. Não grava direto — só cria uma proposta que o usuário confirma na interface.",
  input_schema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "id do candidato devolvido por search_album_catalog",
      },
      source: { type: "string", enum: ["spotify", "musicbrainz"] },
      status: { type: "string", enum: ["to_listen", "listened"] },
      rating: {
        type: "number",
        description: "Nota de 0 a 10, só se o usuário informou explicitamente",
      },
      listened_date: {
        type: "string",
        description: "Data ISO (YYYY-MM-DD); se omitido e status=listened, usa hoje",
      },
      notes: { type: "string" },
      would_recommend: { type: "boolean" },
      is_favorite: { type: "boolean" },
    },
    required: ["id", "source", "status"],
  },
  handler: async (input, ctx) => {
    const id = String(input.id ?? "").trim();
    const source = input.source === "musicbrainz" ? "musicbrainz" : "spotify";
    if (!id) return { error: "id é obrigatório." };

    const album = await resolveAlbumDetail(id, source, ctx.supabaseUrl, ctx.authHeader);
    if (!album) {
      return {
        error:
          "Não encontrei esse álbum no catálogo. Chame search_album_catalog de novo.",
      };
    }

    const status = String(input.status ?? "to_listen");
    const listenedDate = input.listened_date
      ? String(input.listened_date)
      : status === "listened"
        ? ctx.todayIso
        : null;

    const payload = {
      musicbrainz_id: album.id,
      title: album.title,
      artists: album.artists,
      release_year: album.release_year,
      album_type: album.album_type,
      cover_url: album.cover_url,
      source,
      status,
      rating: input.rating != null ? Number(input.rating) : null,
      listened_dates: listenedDate ? [listenedDate] : [],
      notes: (input.notes as string | undefined) ?? null,
      would_recommend: (input.would_recommend as boolean | undefined) ?? true,
      is_favorite: (input.is_favorite as boolean | undefined) ?? false,
    };

    const summary = summarizeAlbumProposal(payload);
    ctx.proposals.push({
      tool_name: "propose_mark_album",
      module: "albums",
      payload,
      summary,
    });
    return { ok: true, summary };
  },
};
