import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BacklinksPanel } from "@/pages/admin/notes/BacklinksPanel";
import { mentionsWikiTitle } from "@/domain/notes/wikiLinks";
import type { Note } from "@/types/notes";

/**
 * Painel "Mencionada em" (feature 056). O backend falso imita o `ilike` do banco (prefiltro por
 * texto) para que o teste prove o ponto principal: **quem decide o que é menção é o parser**, não o
 * `ilike` — menção dentro de bloco de código não vira backlink.
 */

const { store } = vi.hoisted(() => ({
  store: { notes: [] as Note[], sharing: [] as Note[], fail: false },
}));

vi.mock("@/api/notes/notes", () => ({
  fetchNotesMentioning: vi.fn(async (title: string, excludeId?: string) => {
    if (store.fail) throw new Error("row level security");
    // O que o `ilike '%[[title]]%'` devolveria: acha a string, sem entender contexto.
    return store.notes.filter(
      (note) =>
        note.id !== excludeId &&
        note.content.toLowerCase().includes(`[[${title.toLowerCase()}]]`)
    );
  }),
}));

vi.mock("@/api/notes/noteLinks", () => ({
  fetchNotesSharingEntity: vi.fn(async () => store.sharing.map((n) => ({ ...n }))),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function note(id: string, title: string, content = ""): Note {
  return { id, title, content, project_id: null, kind: "markdown", canvas_data: null };
}

function renderPanel(target: Note) {
  return render(
    <MemoryRouter>
      <BacklinksPanel note={target} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.notes = [];
  store.sharing = [];
  store.fail = false;
});

describe("BacklinksPanel", () => {
  it("sem ninguém apontando, mostra o estado vazio", async () => {
    renderPanel(note("n1", "Materiais"));
    expect(
      await screen.findByText("Nenhuma nota aponta para esta")
    ).toBeInTheDocument();
  });

  it("lista a nota que escreveu [[título desta]], com link para ela", async () => {
    store.notes = [
      note("n2", "Reforma", "comprar tudo de [[Materiais]] amanhã"),
    ];
    renderPanel(note("n1", "Materiais"));

    const link = await screen.findByRole("link", { name: /Reforma/ });
    expect(link).toHaveAttribute("href", "/notes/n2");
    // O excerpt vem sem marcação (mesma função do card da lista).
    expect(link.textContent).toContain("comprar tudo de");
  });

  it("menção dentro de bloco de código NÃO vira backlink", async () => {
    // O `ilike` do banco acha a string; o parser é quem recusa. Sem esse filtro, quem documenta a
    // sintaxe numa nota viraria backlink de todo mundo.
    store.notes = [
      note("n2", "Como usar", "```\nescreva [[Materiais]] para linkar\n```"),
    ];
    // A premissa do teste: o prefiltro do banco devolve essa nota.
    expect(store.notes[0].content.includes("[[Materiais]]")).toBe(true);
    expect(mentionsWikiTitle(store.notes[0].content, "Materiais")).toBe(false);

    renderPanel(note("n1", "Materiais"));
    expect(
      await screen.findByText("Nenhuma nota aponta para esta")
    ).toBeInTheDocument();
    expect(screen.queryByText("Como usar")).toBeNull();
  });

  it("também lista as notas ligadas às mesmas entidades, em grupo separado", async () => {
    store.sharing = [note("n3", "Orçamento da obra", "três propostas")];
    renderPanel(note("n1", "Materiais"));

    expect(
      await screen.findByText("Ligadas às mesmas coisas que esta")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Orçamento da obra/ })).toHaveAttribute(
      "href",
      "/notes/n3"
    );
    // Sem menção por wiki-link, o grupo do texto nem aparece.
    expect(screen.queryByText(/no texto/)).toBeNull();
  });

  it("erro ao carregar vira toast destrutivo, não tela quebrada", async () => {
    store.fail = true;
    renderPanel(note("n1", "Materiais"));

    expect(
      await screen.findByText("Nenhuma nota aponta para esta")
    ).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" })
    );
  });
});
