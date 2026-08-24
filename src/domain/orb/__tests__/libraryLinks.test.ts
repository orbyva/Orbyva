import { describe, expect, it } from "vitest";
import { libraryLink } from "@/domain/orb/libraryLinks";

describe("libraryLink", () => {
  it("monta a rota dos três módulos", () => {
    expect(libraryLink("movies", "watched")).toEqual({
      to: "/admin/movies?status=watched",
      label: "Já assisti",
    });
    expect(libraryLink("books", "read")?.to).toBe("/admin/books?status=read");
    expect(libraryLink("albums", "listened")?.to).toBe(
      "/admin/music?status=listened"
    );
  });

  it("recusa par módulo/status inexistente", () => {
    // 'listened' é de álbum, não de filme — levaria a uma aba vazia.
    expect(libraryLink("movies", "listened")).toBeNull();
    expect(libraryLink("albums", "watched")).toBeNull();
  });

  it("recusa módulo desconhecido e entrada suja", () => {
    expect(libraryLink("financas", "watched")).toBeNull();
    expect(libraryLink(null, undefined)).toBeNull();
    expect(libraryLink("movies", "../../etc/passwd")).toBeNull();
  });
});
