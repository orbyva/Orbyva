import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NoteLinksPanel } from "@/pages/admin/notes/NoteLinksPanel";
import type { NoteLink, NoteLinkDraft } from "@/types/notes";
import type { Project } from "@/types/tasks";

/**
 * Painel "Vínculos" (feature 056) — a nota apontando para qualquer entidade do app. Backend falso
 * em memória, como no resto do módulo: a skill `next` proíbe navegador, então "criar vínculo pelo
 * editor" precisa ser assertiva.
 */

const { store } = vi.hoisted(() => ({
  store: { links: [] as NoteLink[], seq: 0, failNext: false },
}));

vi.mock("@/api/notes/noteLinks", () => ({
  fetchLinksForNote: vi.fn(async (noteId: string) =>
    store.links.filter((link) => link.note_id === noteId).map((l) => ({ ...l }))
  ),
  addNoteLink: vi.fn(async (draft: NoteLinkDraft) => {
    if (store.failNext) {
      store.failNext = false;
      throw new Error("duplicate key value violates unique constraint");
    }
    const created: NoteLink = {
      id: `l${++store.seq}`,
      note_id: draft.note_id,
      entity_type: draft.entity_type,
      entity_id: draft.entity_id,
      label: draft.label?.trim() ? draft.label.trim() : null,
    };
    store.links.push(created);
    return { ...created };
  }),
  removeNoteLink: vi.fn(async (id: string) => {
    if (store.failNext) {
      store.failNext = false;
      throw new Error("permission denied");
    }
    store.links = store.links.filter((link) => link.id !== id);
  }),
}));

const { searchGlobalMock } = vi.hoisted(() => ({ searchGlobalMock: vi.fn() }));
vi.mock("@/api/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/search")>();
  return { ...actual, searchGlobal: searchGlobalMock };
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const PROJECTS: Project[] = [
  { id: "p1", name: "Obra da casa" } as Project,
  { id: "p2", name: "Setup do estúdio" } as Project,
];

function renderPanel(noteId = "n1") {
  return render(
    <MemoryRouter>
      <NoteLinksPanel noteId={noteId} projects={PROJECTS} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.links = [];
  store.seq = 0;
  store.failNext = false;
  searchGlobalMock.mockResolvedValue([]);
});

describe("NoteLinksPanel", () => {
  it("sem vínculo nenhum, mostra o estado vazio", async () => {
    renderPanel();
    expect(await screen.findByText("Nenhum vínculo ainda")).toBeInTheDocument();
  });

  it("lista os vínculos da nota com o tipo e o link para a entidade", async () => {
    store.links = [
      {
        id: "l1",
        note_id: "n1",
        entity_type: "goal",
        entity_id: "g1",
        label: "Correr 10km",
      },
      {
        id: "l2",
        note_id: "n1",
        entity_type: "trip",
        entity_id: "t1",
        label: "Chile",
      },
      // De outra nota: não pode aparecer aqui.
      {
        id: "l3",
        note_id: "n2",
        entity_type: "book",
        entity_id: "b1",
        label: "Duna",
      },
    ];
    renderPanel();

    const goal = await screen.findByRole("link", { name: /Correr 10km/ });
    expect(goal).toHaveAttribute("href", "/goals");
    expect(goal.textContent).toContain("Meta");
    // Viagem tem página própria por id; meta não tem, então cai na lista.
    expect(screen.getByRole("link", { name: /Chile/ })).toHaveAttribute(
      "href",
      "/travel/t1"
    );
    expect(screen.queryByText(/Duna/)).toBeNull();
  });

  it("vínculo cuja entidade sumiu aparece como referência removida, não some da lista", async () => {
    store.links = [
      { id: "l1", note_id: "n1", entity_type: "movie", entity_id: "m1", label: null },
    ];
    renderPanel();
    expect(await screen.findByText(/Referência removida/)).toBeInTheDocument();
  });

  it("vincular a um projeto grava o vínculo e ele aparece na lista", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /Vincular/ }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("option", {
        name: "Obra da casa",
      })
    );

    await waitFor(() => expect(store.links).toHaveLength(1));
    expect(store.links[0]).toMatchObject({
      note_id: "n1",
      entity_type: "project",
      entity_id: "p1",
      // O rótulo é congelado no vínculo, para a lista sobreviver à entidade.
      label: "Obra da casa",
    });
    expect(
      await screen.findByRole("link", { name: /Obra da casa/ })
    ).toHaveAttribute("href", "/tasks/projects/p1");
  });

  it("vincular pela busca global usa o tipo mapeado do resultado", async () => {
    const user = userEvent.setup();
    searchGlobalMock.mockResolvedValue([
      { id: "b1", kind: "book", title: "Duna", href: "/books" },
      // Lançamento não é vinculável (não está no check do banco) — não pode nem aparecer.
      { id: "tx1", kind: "transaction", title: "Duna (compra)", href: "/finance" },
      { id: "a1", kind: "music", title: "Duna (trilha)", href: "/music" },
    ]);
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /Vincular/ }));
    await user.type(screen.getByLabelText("Buscar em todo o app"), "duna");

    const option = await screen.findByText("Duna", {}, { timeout: 3000 });
    expect(screen.queryByText("Duna (compra)")).toBeNull();
    // "music" na busca é "album" no banco — o mapa entre os dois é testado aqui de ponta a ponta.
    expect(screen.getByText("Duna (trilha)")).toBeInTheDocument();

    await user.click(option);
    await waitFor(() => expect(store.links).toHaveLength(1));
    expect(store.links[0]).toMatchObject({
      entity_type: "book",
      entity_id: "b1",
      label: "Duna",
    });
  });

  it("vincular duas vezes a mesma entidade avisa em vez de tentar gravar duplicado", async () => {
    const user = userEvent.setup();
    store.links = [
      {
        id: "l1",
        note_id: "n1",
        entity_type: "project",
        entity_id: "p1",
        label: "Obra da casa",
      },
    ];
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /Vincular/ }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("option", {
        name: "Obra da casa",
      })
    );

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Esta nota já está vinculada a isso" })
      )
    );
    expect(store.links).toHaveLength(1);
  });

  it("remover um vínculo tira ele do banco e da tela", async () => {
    const user = userEvent.setup();
    store.links = [
      {
        id: "l1",
        note_id: "n1",
        entity_type: "habit",
        entity_id: "h1",
        label: "Ler 20 min",
      },
    ];
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Remover vínculo Ler 20 min" })
    );

    await waitFor(() => expect(store.links).toHaveLength(0));
    expect(screen.queryByText(/Ler 20 min/)).toBeNull();
  });

  it("se o banco recusar a remoção, o vínculo volta para a tela com toast de erro", async () => {
    const user = userEvent.setup();
    store.links = [
      {
        id: "l1",
        note_id: "n1",
        entity_type: "habit",
        entity_id: "h1",
        label: "Ler 20 min",
      },
    ];
    store.failNext = true;
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Remover vínculo Ler 20 min" })
    );

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
    expect(await screen.findByText(/Ler 20 min/)).toBeInTheDocument();
    expect(store.links).toHaveLength(1);
  });
});
