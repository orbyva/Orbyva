import { describe, expect, it } from "vitest";
import {
  captureTarget,
  cleanPageTitle,
  contentLinkFromPage,
  contentLinkTypeForUrl,
  countPendingShopping,
  countToConsumeLinks,
  existingCatalogForKind,
  existingForPage,
  externalLinkDraftFromPage,
  findExistingContentLink,
  medicationDoseWhen,
  nextDueMedicationDose,
  noteDraftFromPage,
  openDayTasks,
  shoppingItemFromPage,
  taskTitleFromPage,
  visibleDayTasks,
} from "@/domain/extension/dayBoard";
import { emptyExtractedPage, type ExtractedPage } from "@/domain/extension/pageContext";
import type { Task } from "@/types/tasks";

function task(overrides: Partial<Pick<Task, "id" | "status" | "due_date">>): Pick<
  Task,
  "id" | "status" | "due_date"
> {
  return {
    id: overrides.id ?? "t",
    status: overrides.status ?? "todo",
    due_date: overrides.due_date !== undefined ? overrides.due_date : "2026-09-03",
  };
}

function page(url: string, extra: Partial<ExtractedPage> = {}): ExtractedPage {
  return { ...emptyExtractedPage(), url, title: "Título", ...extra };
}

describe("openDayTasks", () => {
  it("separa atrasadas e hoje e ignora concluídas e sem prazo", () => {
    const { overdue, today } = openDayTasks(
      [
        task({ id: "late", due_date: "2026-09-01" }),
        task({ id: "now", due_date: "2026-09-03" }),
        task({ id: "done", due_date: "2026-09-03", status: "done" }),
        task({ id: "later", due_date: "2026-09-10" }),
        task({ id: "none", due_date: null }),
        task({ id: "doing", due_date: "2026-09-03", status: "doing" }),
        {
          id: "dose",
          status: "todo",
          due_date: "2026-09-03",
          is_medication: true,
        },
      ],
      "2026-09-03"
    );
    expect(overdue.map((t) => t.id)).toEqual(["late"]);
    expect(today.map((t) => t.id)).toEqual(["now", "doing"]);
  });
});

describe("visibleDayTasks", () => {
  it("atrasadas primeiro e corta no limite", () => {
    const tasks = [
      task({ id: "late", due_date: "2026-09-01" }),
      task({ id: "a", due_date: "2026-09-03" }),
      task({ id: "b", due_date: "2026-09-03" }),
    ];
    const { items, hidden } = visibleDayTasks(tasks, "2026-09-03", 2);
    expect(items.map((row) => row.task.id)).toEqual(["late", "a"]);
    expect(items[0]?.bucket).toBe("overdue");
    expect(hidden).toBe(1);
  });
});

describe("contadores", () => {
  it("conta compras pendentes e links para consumir", () => {
    expect(
      countPendingShopping([
        { status: "pending" },
        { status: "purchased" },
        { status: "pending" },
      ])
    ).toBe(2);
    expect(
      countToConsumeLinks([
        { status: "to_consume" },
        { status: "consumed" },
        { status: "to_consume" },
      ])
    ).toBe(2);
  });
});

describe("captureTarget", () => {
  it("cataloga, compra ou link conforme o tipo da página", () => {
    expect(captureTarget("movie")).toBe("catalog");
    expect(captureTarget("product")).toBe("shopping");
    expect(captureTarget("unknown")).toBe("link");
  });
});

describe("contentLinkTypeForUrl", () => {
  it("vídeo no YouTube e site no restante", () => {
    expect(contentLinkTypeForUrl("https://youtube.com/watch?v=1")).toBe("video");
    expect(contentLinkTypeForUrl("https://example.com/post")).toBe("website");
  });
});

describe("rascunhos a partir da página", () => {
  it("limpa título de catálogo e monta link, compra e tarefa", () => {
    expect(cleanPageTitle("Dune (2021) | IMDb")).toBe("Dune");
    expect(taskTitleFromPage(page("https://x.com", { title: "Dune | IMDb" }))).toBe(
      "Dune"
    );
    expect(externalLinkDraftFromPage(page("https://github.com/orbyva"))).toEqual({
      url: "https://github.com/orbyva",
      comment: null,
      position: 0,
    });
    expect(externalLinkDraftFromPage(null)).toBeNull();

    const link = contentLinkFromPage(
      page("https://youtu.be/abc", { title: "Talk", description: "desc" })
    );
    expect(link).toMatchObject({
      title: "Talk",
      url: "https://youtu.be/abc",
      type: "video",
      status: "to_consume",
      notes: "desc",
      is_favorite: false,
      tag_ids: [],
    });

    const item = shoppingItemFromPage(
      page("https://www.mercadolivre.com.br/x", { title: "Fone | Mercado Livre" })
    );
    expect(item).toMatchObject({
      shopping_category_id: null,
      title: "Fone",
      provider_link: "https://www.mercadolivre.com.br/x",
      status: "pending",
    });
    expect(
      shoppingItemFromPage(page("https://x.com"), "cat-1").shopping_category_id
    ).toBe("cat-1");
    expect(
      noteDraftFromPage(
        page("https://example.com/post", {
          title: "Como fazer X",
          description: "Um guia.",
        })
      )
    ).toEqual({
      title: "Como fazer X",
      content: "https://example.com/post\n\nUm guia.",
      project_id: null,
    });
  });
});

describe("já existe", () => {
  it("acha o mesmo URL em links e compras, ignorando www e barra final", () => {
    expect(
      findExistingContentLink(
        [{ url: "https://www.example.com/post/" }],
        "https://example.com/post"
      )?.url
    ).toBe("https://www.example.com/post/");
    expect(
      existingForPage("link", page("https://example.com/post"), {
        links: [{ url: "https://example.com/post" }],
        shopping: [],
      })
    ).toEqual({ href: "/links", label: "Links" });
    expect(
      existingForPage("shopping", page("https://www.mercadolivre.com.br/x"), {
        links: [],
        shopping: [{ provider_link: "https://mercadolivre.com.br/x" }],
      })
    ).toEqual({ href: "/shopping-list", label: "Lista de compras" });
  });

  it("acha filme, livro, álbum e lugar no catálogo", () => {
    expect(
      existingCatalogForKind("movie", page("https://imdb.com/title/tt1", { imdbId: "tt1" }), {
        movies: [{ imdb_id: "tt1", title: "Dune" }],
      })
    ).toEqual({ href: "/movies", label: "Cinema" });
    expect(
      existingCatalogForKind("book", page("https://books.google.com/x", { isbn: "123" }), {
        books: [{ google_id: "g", isbn13: "123", title: "Duna" }],
      })
    ).toEqual({ href: "/books", label: "Livros" });
    expect(
      existingCatalogForKind("album", page("https://open.spotify.com/album/1", { title: "A Love Supreme" }), {
        albums: [{ title: "A Love Supreme" }],
      })
    ).toEqual({ href: "/music", label: "Música" });
    expect(
      existingCatalogForKind("place", page("https://maps.google.com", { title: "Padaria" }), {
        places: [{ name: "Padaria" }],
      })
    ).toEqual({ href: "/places", label: "Lugares" });
  });
});

describe("próxima dose", () => {
  it("escolhe a mais antiga pendente até hoje e formata o horário", () => {
    const dose = nextDueMedicationDose(
      [
        {
          id: "later",
          status: "todo",
          due_date: "2026-09-04",
          due_time: "08:00",
          is_medication: true,
        },
        {
          id: "old",
          status: "todo",
          due_date: "2026-09-01",
          due_time: "20:00",
          is_medication: true,
        },
        {
          id: "today",
          status: "todo",
          due_date: "2026-09-03",
          due_time: "08:00",
          is_medication: true,
        },
        {
          id: "done",
          status: "done",
          due_date: "2026-09-01",
          due_time: "08:00",
          is_medication: true,
        },
      ],
      "2026-09-03"
    );
    expect(dose?.id).toBe("old");
    expect(medicationDoseWhen({ due_date: "2026-09-03", due_time: "08:00:00" }, "2026-09-03")).toBe(
      "08:00"
    );
    expect(medicationDoseWhen({ due_date: "2026-09-01", due_time: "20:00" }, "2026-09-03")).toBe(
      "2026-09-01 · 20:00"
    );
  });
});
