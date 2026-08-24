import { describe, expect, it } from "vitest";
import { buildProposalSummary } from "@/domain/orb/proposalSummary";
import { MovieStatus } from "@/types/movies";
import type { OrbMoviePayload, OrbBookPayload, OrbAlbumPayload } from "@/types/orb";

describe("buildProposalSummary", () => {
  it("filme assistido com nota inteira", () => {
    const payload: OrbMoviePayload = {
      imdb_id: "tt123",
      title: "Gente Grande 2",
      year: 2013,
      genre: [],
      actors: [],
      type: "movie",
      status: MovieStatus.WATCHED,
      rating: 4,
      watched_dates: ["2026-08-19"],
    };
    expect(buildProposalSummary("propose_mark_movie", payload)).toBe(
      'Marcar "Gente Grande 2" como assistido, nota 4'
    );
  });

  it("filme sem nota (ex.: só marcar pra assistir)", () => {
    const payload: OrbMoviePayload = {
      imdb_id: "tt123",
      title: "Duna",
      year: 2021,
      genre: [],
      actors: [],
      type: "movie",
      status: MovieStatus.TO_WATCH,
      watched_dates: [],
    };
    expect(buildProposalSummary("propose_mark_movie", payload)).toBe(
      'Marcar "Duna" como pra assistir'
    );
  });

  it("livro em leitura, sem nota", () => {
    const payload: OrbBookPayload = {
      google_id: "abc",
      title: "Psicologia Financeira",
      status: "reading",
    };
    expect(buildProposalSummary("propose_mark_book", payload)).toBe(
      'Marcar "Psicologia Financeira" como lendo'
    );
  });

  it("álbum com nota quebrada formata com uma casa decimal", () => {
    const payload: OrbAlbumPayload = {
      musicbrainz_id: "mb1",
      title: "Slime Cry",
      artists: ["NBA YoungBoy"],
      album_type: "album",
      source: "spotify",
      status: "listened",
      rating: 8.5,
      listened_dates: ["2026-08-19"],
    };
    expect(buildProposalSummary("propose_mark_album", payload)).toBe(
      'Marcar "Slime Cry" como ouvido, nota 8.5'
    );
  });
});
