import type {
  OrbAlbumPayload,
  OrbBookPayload,
  OrbManualBookPayload,
  OrbMoviePayload,
  OrbProposal,
} from "@/types/orb";

export type OrbProposalKind = "movie" | "series" | "book" | "album";

export interface OrbProposalDisplay {
  title: string;
  /** Ano da obra — `null` quando o catálogo não devolve (caso dos livros). */
  year: number | null;
  /** URL da capa — `null` quando o payload não a carrega (caso dos livros). */
  cover: string | null;
  kind: OrbProposalKind;
  /** Rótulo curto pro badge ("Filme", "Série", "Livro", "Álbum"). */
  kindLabel: string;
}

const KIND_LABEL: Record<OrbProposalKind, string> = {
  movie: "Filme",
  series: "Série",
  book: "Livro",
  album: "Álbum",
};

/**
 * Extrai os campos de exibição do payload da proposta.
 *
 * Filmes e álbuns já trazem capa e ano resolvidos pela Edge; livros não —
 * `search_book_catalog` só devolve o `google_id`, e o detalhe (capa, ano) é
 * buscado pelo client na hora de aplicar. Por isso `cover`/`year` são anuláveis.
 */
export function proposalDisplay(proposal: OrbProposal): OrbProposalDisplay {
  switch (proposal.tool_name) {
    case "propose_mark_movie": {
      const p = proposal.payload as OrbMoviePayload;
      const kind: OrbProposalKind = p.type === "series" ? "series" : "movie";
      return {
        title: p.title,
        year: p.year ?? null,
        cover: p.poster ?? null,
        kind,
        kindLabel: KIND_LABEL[kind],
      };
    }
    case "propose_mark_album": {
      const p = proposal.payload as OrbAlbumPayload;
      return {
        title: p.title,
        year: p.release_year ?? null,
        cover: p.cover_url ?? null,
        kind: "album",
        kindLabel: KIND_LABEL.album,
      };
    }
    case "propose_mark_book": {
      const p = proposal.payload as OrbBookPayload;
      return {
        title: p.title,
        year: null,
        cover: null,
        kind: "book",
        kindLabel: KIND_LABEL.book,
      };
    }
    case "propose_manual_book": {
      // Livro ditado pelo usuário: o ano só existe se ele mesmo informou.
      const p = proposal.payload as OrbManualBookPayload;
      return {
        title: p.title,
        year: p.published_year ?? null,
        cover: null,
        kind: "book",
        kindLabel: KIND_LABEL.book,
      };
    }
  }
}

/** `Lanternas (2026)` — o ano some quando o catálogo não o forneceu. */
export function titleWithYear(display: OrbProposalDisplay): string {
  return display.year ? `${display.title} (${display.year})` : display.title;
}
