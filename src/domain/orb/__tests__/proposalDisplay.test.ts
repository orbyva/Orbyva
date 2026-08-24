import { describe, expect, it } from "vitest";
import { proposalDisplay, titleWithYear } from "@/domain/orb/proposalDisplay";
import type { OrbProposal } from "@/types/orb";

function proposal(over: Partial<OrbProposal>): OrbProposal {
  return {
    id: "p1",
    tool_name: "propose_mark_movie",
    module: "movies",
    payload: {},
    summary: "",
    status: "pending",
    ...over,
  } as OrbProposal;
}

describe("proposalDisplay", () => {
  it("extrai capa e ano de filme", () => {
    const d = proposalDisplay(
      proposal({
        tool_name: "propose_mark_movie",
        payload: {
          title: "Cidade de Deus",
          year: 2002,
          poster: "https://image.tmdb.org/x.jpg",
          type: "movie",
        },
      } as Partial<OrbProposal>)
    );
    expect(d).toMatchObject({
      title: "Cidade de Deus",
      year: 2002,
      cover: "https://image.tmdb.org/x.jpg",
      kind: "movie",
      kindLabel: "Filme",
    });
  });

  it("distingue série de filme", () => {
    const d = proposalDisplay(
      proposal({
        payload: { title: "Lanternas", year: 2026, type: "series" },
      } as Partial<OrbProposal>)
    );
    expect(d.kind).toBe("series");
    expect(d.kindLabel).toBe("Série");
  });

  it("usa release_year/cover_url no álbum", () => {
    const d = proposalDisplay(
      proposal({
        tool_name: "propose_mark_album",
        module: "albums",
        payload: {
          title: "Clube da Esquina",
          release_year: 1972,
          cover_url: "https://i.scdn.co/x.jpg",
        },
      } as Partial<OrbProposal>)
    );
    expect(d).toMatchObject({
      year: 1972,
      cover: "https://i.scdn.co/x.jpg",
      kindLabel: "Álbum",
    });
  });

  it("livro não traz capa nem ano (resolvidos só ao aplicar)", () => {
    const d = proposalDisplay(
      proposal({
        tool_name: "propose_mark_book",
        module: "books",
        payload: { google_id: "abc", title: "Dom Casmurro", status: "read" },
      } as Partial<OrbProposal>)
    );
    expect(d.cover).toBeNull();
    expect(d.year).toBeNull();
    expect(d.title).toBe("Dom Casmurro");
  });

  it("titleWithYear omite o ano quando ausente", () => {
    expect(
      titleWithYear({
        title: "Lanternas",
        year: 2026,
        cover: null,
        kind: "series",
        kindLabel: "Série",
      })
    ).toBe("Lanternas (2026)");
    expect(
      titleWithYear({
        title: "Dom Casmurro",
        year: null,
        cover: null,
        kind: "book",
        kindLabel: "Livro",
      })
    ).toBe("Dom Casmurro");
  });
});
