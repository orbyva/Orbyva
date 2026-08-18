import { describe, expect, it } from "vitest";
import {
  classifyPage,
  extractImdbId,
  extractIsbnFromUrl,
  extractSpotifyAlbumId,
  type ExtractedPage,
} from "@/domain/extension/pageContext";

function page(url: string, extra: Partial<ExtractedPage> = {}): ExtractedPage {
  return {
    url,
    title: "Título",
    description: null,
    image: null,
    siteName: null,
    price: null,
    installmentCount: null,
    installmentValue: null,
    imdbId: null,
    isbn: null,
    googleBookId: null,
    spotifyAlbumId: null,
    ...extra,
  };
}

describe("extractors", () => {
  it("lê IMDb, Spotify e ISBN da Amazon", () => {
    expect(extractImdbId("https://www.imdb.com/title/tt1375666/")).toBe(
      "tt1375666"
    );
    expect(
      extractSpotifyAlbumId("https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy")
    ).toBe("4aawyAB9vmqN3uQ7FjRGTy");
    expect(
      extractIsbnFromUrl("https://www.amazon.com.br/dp/8535911669")
    ).toBe("8535911669");
  });
});

describe("classifyPage", () => {
  it("classifica cinema, livro, álbum, lugar e produto", () => {
    expect(classifyPage(page("https://www.imdb.com/title/tt1375666/"))).toBe(
      "movie"
    );
    expect(classifyPage(page("https://letterboxd.com/film/dune/"))).toBe(
      "movie"
    );
    expect(classifyPage(page("https://www.goodreads.com/book/show/1"))).toBe(
      "book"
    );
    expect(
      classifyPage(page("https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy"))
    ).toBe("album");
    expect(
      classifyPage(page("https://www.google.com/maps/place/Padaria"))
    ).toBe("place");
    expect(
      classifyPage(page("https://www.mercadolivre.com.br/x/p/123", { price: 99 }))
    ).toBe("product");
    expect(classifyPage(page("https://example.com/artigo"))).toBe("unknown");
  });
});
