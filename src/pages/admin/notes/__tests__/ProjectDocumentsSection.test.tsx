import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ProjectDocumentsSection } from "@/pages/admin/notes/ProjectDocumentsSection";
import { mergeProjectDocuments } from "@/domain/notes/projectDocuments";
import type { Note, NoteDraft, NoteLink, ProjectDocument } from "@/types/notes";

/**
 * A aba "Documentos" da página do projeto: as notas **e** os canvas daquele projeto, venham do
 * `project_id` (feature 055) ou de um vínculo com tarefa/projeto (feature 105). Backend falso em
 * memória, como no resto do módulo de Notas — a união em si é a função pura do domínio, e é ela
 * que o falso usa, para o teste não recriar a regra por conta própria.
 */

type NoteRow = Partial<Note> & Pick<Note, "id" | "title" | "content" | "project_id">;

const { store } = vi.hoisted(() => ({
  store: {
    notes: [] as NoteRow[],
    links: [] as Pick<NoteLink, "note_id" | "entity_type" | "entity_id" | "label">[],
    taskIds: [] as string[],
    seq: 0,
  },
}));

function toNote(row: NoteRow): Note {
  return { kind: "markdown", canvas_data: null, ...row };
}

vi.mock("@/api/notes/projectDocuments", () => ({
  fetchProjectDocuments: vi.fn(async (projectId: string): Promise<ProjectDocument[]> => {
    const notes = store.notes.map(toNote);
    return mergeProjectDocuments({
      projectNotes: notes.filter((n) => n.project_id === projectId),
      linkedNotes: notes,
      links: store.links,
      projectTaskIds: store.taskIds,
      projectId,
    });
  }),
  countProjectDocuments: vi.fn(async () => 0),
}));

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(async () => store.notes.map(toNote)),
  createNote: vi.fn(async (draft: NoteDraft) => {
    const created: Note = {
      id: `n${++store.seq}`,
      kind: "markdown",
      canvas_data: null,
      ...draft,
      title: "Sem título",
    };
    store.notes.push(created);
    return { ...created };
  }),
  fetchNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function LocationProbe() {
  return <output data-testid="url">{useLocation().pathname}</output>;
}

function renderSection(projectId = "p1") {
  return render(
    <MemoryRouter initialEntries={["/tasks/projects/p1"]}>
      <Routes>
        <Route
          path="/tasks/projects/:id"
          element={<ProjectDocumentsSection projectId={projectId} />}
        />
        <Route path="/notes/:id" element={<p>editor da nota</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.notes = [];
  store.links = [];
  store.taskIds = [];
  store.seq = 0;
});

describe("Documentos do projeto (dentro da página do projeto)", () => {
  it("lista as notas daquele projeto e não as de fora", async () => {
    store.notes = [
      { id: "n1", title: "Pauta da obra", content: "- pedreiro", project_id: "p1" },
      { id: "n2", title: "Do outro projeto", content: "", project_id: "p2" },
      { id: "n3", title: "Nota solta", content: "", project_id: null },
    ];
    renderSection();

    expect(await screen.findByText("Pauta da obra")).toBeInTheDocument();
    // O excerpt vem sem a marcação de lista.
    expect(screen.getByText("pedreiro")).toBeInTheDocument();
    expect(screen.queryByText("Do outro projeto")).toBeNull();
    expect(screen.queryByText("Nota solta")).toBeNull();
  });

  /**
   * O ponto da feature 105: a nota vinculada a uma tarefa do projeto aparece **mesmo sem
   * `project_id`** — é o caso da nota criada solta e vinculada à tarefa depois, que antes sumia.
   */
  it("nota vinculada a uma tarefa do projeto aparece mesmo sem project_id", async () => {
    store.notes = [{ id: "n1", title: "Medidas da parede", content: "", project_id: null }];
    store.taskIds = ["t1"];
    store.links = [
      { note_id: "n1", entity_type: "task", entity_id: "t1", label: "Trocar a fiação" },
    ];
    renderSection();

    expect(await screen.findByText("Medidas da parede")).toBeInTheDocument();
  });

  /**
   * "aparecem aqui as notas e canvas com referência a tarefa" — o item precisa dizer **de qual**
   * tarefa veio, senão o usuário não entende por que aquela nota está na lista.
   */
  it("documento vindo de uma tarefa mostra a badge 'da tarefa <título>', em texto", async () => {
    store.notes = [{ id: "n1", title: "Medidas da parede", content: "", project_id: null }];
    store.taskIds = ["t1"];
    store.links = [
      { note_id: "n1", entity_type: "task", entity_id: "t1", label: "Trocar a fiação da sala" },
    ];
    renderSection();

    const item = await screen.findByRole("link", { name: /Medidas da parede/ });
    const badge = within(item).getByText(/da tarefa Trocar a fiação da sala/);
    expect(badge).toBeInTheDocument();
    // Texto, não link: não há rota de tarefa. O único link do item é o do editor da nota.
    expect(badge.closest("a")).toBe(item);
    expect(badge).toHaveAttribute("title", "da tarefa Trocar a fiação da sala");
    // Nenhum link dentro do item: o único destino continua sendo o editor da nota.
    expect(item.querySelectorAll("a")).toHaveLength(0);
  });

  it("documento que não veio de tarefa não ganha badge nenhuma", async () => {
    store.notes = [{ id: "n1", title: "Pauta da obra", content: "", project_id: "p1" }];
    renderSection();

    await screen.findByText("Pauta da obra");
    expect(screen.queryByText(/da tarefa/)).toBeNull();
  });

  it("nota vinculada ao próprio projeto por note_link também entra", async () => {
    store.notes = [{ id: "n1", title: "Contrato", content: "", project_id: null }];
    store.links = [
      { note_id: "n1", entity_type: "project", entity_id: "p1", label: "Obra da casa" },
    ];
    renderSection();

    expect(await screen.findByText("Contrato")).toBeInTheDocument();
  });

  it("a mesma nota vinda por duas portas aparece uma vez só", async () => {
    store.notes = [{ id: "n1", title: "Pauta", content: "", project_id: "p1" }];
    store.taskIds = ["t1"];
    store.links = [
      { note_id: "n1", entity_type: "task", entity_id: "t1", label: "Trocar a fiação" },
    ];
    renderSection();

    expect(await screen.findAllByRole("link", { name: /Pauta/ })).toHaveLength(1);
  });

  it("cada documento leva ao editor dele", async () => {
    store.notes = [
      { id: "n1", title: "Pauta da obra", content: "", project_id: "p1" },
    ];
    renderSection();

    expect(await screen.findByRole("link", { name: /Pauta da obra/ })).toHaveAttribute(
      "href",
      "/notes/n1"
    );
  });

  it("projeto sem documento mostra o estado vazio com a ação de criar", async () => {
    renderSection();
    expect(await screen.findByText("Nenhum documento neste projeto")).toBeInTheDocument();
    expect(screen.getByText(/notas e os canvas deste projeto/)).toBeInTheDocument();
  });

  it("showHeading={false} tira o <h2> e nomeia a section por aria-label", async () => {
    render(
      <MemoryRouter>
        <ProjectDocumentsSection projectId="p1" showHeading={false} />
      </MemoryRouter>
    );

    await screen.findByText("Nenhum documento neste projeto");
    expect(screen.queryByRole("heading", { name: "Documentos do projeto" })).toBeNull();
    const region = screen.getByRole("region", { name: "Documentos do projeto" });
    expect(region).not.toHaveAttribute("aria-labelledby");
    expect(within(region).getAllByRole("button", { name: "Nova nota" })).not.toHaveLength(0);
  });

  it("por padrão (sem a prop) o <h2> continua lá", async () => {
    renderSection();
    expect(
      await screen.findByRole("heading", { name: "Documentos do projeto", level: 2 })
    ).toBeInTheDocument();
  });

  /**
   * Feature 105: antes, um canvas aparecia como "uma nota de trecho vazio" — nada na linha dizia
   * que aquilo era um desenho. Agora o ícone e o resumo falam o mesmo idioma da lista de Notas.
   */
  it("cada item mostra o ícone do seu tipo, e o canvas mostra quantos elementos tem", async () => {
    store.notes = [
      { id: "n1", title: "Pauta da obra", content: "texto", project_id: "p1" },
      {
        id: "c1",
        title: "Planta baixa",
        content: "",
        project_id: "p1",
        kind: "canvas",
        canvas_data: { elements: [{ id: "a" }, { id: "b" }] },
      },
      {
        id: "c2",
        title: "Canvas em branco",
        content: "",
        project_id: "p1",
        kind: "canvas",
        canvas_data: { elements: [] },
      },
    ];
    renderSection();

    const nota = await screen.findByRole("link", { name: /Pauta da obra/ });
    expect(within(nota).getByLabelText("Nota")).toBeInTheDocument();
    expect(within(nota).queryByLabelText("Canvas")).toBeNull();

    const canvas = screen.getByRole("link", { name: /Planta baixa/ });
    expect(within(canvas).getByLabelText("Canvas")).toBeInTheDocument();
    expect(within(canvas).getByText("Canvas · 2 elementos")).toBeInTheDocument();

    expect(
      within(screen.getByRole("link", { name: /Canvas em branco/ })).getByText("Canvas vazio")
    ).toBeInTheDocument();
  });

  it("canvas com um elemento fala no singular", async () => {
    store.notes = [
      {
        id: "c1",
        title: "Rascunho",
        content: "",
        project_id: "p1",
        kind: "canvas",
        canvas_data: { elements: [{ id: "a" }] },
      },
    ];
    renderSection();
    expect(await screen.findByText("Canvas · 1 elemento")).toBeInTheDocument();
  });

  /**
   * Feature 105: falha de rede não pode se disfarçar de "não há nada aqui" — o toast some da tela
   * e o que fica é uma mentira sobre o conteúdo do projeto.
   */
  it("falha ao carregar mostra o erro com 'Tentar de novo', não o estado vazio", async () => {
    const user = userEvent.setup();
    const { fetchProjectDocuments } = await import("@/api/notes/projectDocuments");
    vi.mocked(fetchProjectDocuments).mockRejectedValueOnce(new Error("offline"));

    renderSection();

    expect(
      await screen.findByText("Não foi possível carregar os documentos")
    ).toBeInTheDocument();
    expect(screen.queryByText("Nenhum documento neste projeto")).toBeNull();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: "Não foi possível carregar os documentos",
      })
    );

    // O retry refaz a chamada — e, com a rede de volta, a lista aparece.
    store.notes = [{ id: "n1", title: "Pauta da obra", content: "", project_id: "p1" }];
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(await screen.findByText("Pauta da obra")).toBeInTheDocument();
    expect(screen.queryByText("Não foi possível carregar os documentos")).toBeNull();
    expect(fetchProjectDocuments).toHaveBeenCalledTimes(2);
  });

  it("criar pela página do projeto já nasce vinculada e abre o editor", async () => {
    const user = userEvent.setup();
    renderSection();

    await screen.findByText("Nenhum documento neste projeto");
    await user.click(screen.getAllByRole("button", { name: "Nova nota" })[0]);

    await waitFor(() => expect(store.notes).toHaveLength(1));
    // O vínculo já vem no create, não num update depois.
    expect(store.notes[0].project_id).toBe("p1");
    expect(store.notes[0].kind).toBe("markdown");
    expect(await screen.findByText("editor da nota")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("/notes/n1");
  });

  /**
   * "permitir criar notas **e canvas** por projeto": até a feature 105 o canvas só nascia na página
   * de Notas ou pelo atalho da tarefa — nunca aqui.
   */
  it("'Novo canvas' cria o canvas já do projeto, com a cena vazia, e abre o editor", async () => {
    const user = userEvent.setup();
    renderSection();

    await screen.findByText("Nenhum documento neste projeto");
    await user.click(screen.getByRole("button", { name: "Novo canvas" }));

    await waitFor(() => expect(store.notes).toHaveLength(1));
    expect(store.notes[0]).toMatchObject({
      project_id: "p1",
      kind: "canvas",
      canvas_data: { elements: [] },
    });
    expect(await screen.findByText("editor da nota")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("/notes/n1");
  });

  it("falha ao criar o canvas não navega, avisa e devolve o botão", async () => {
    const user = userEvent.setup();
    const { createNote } = await import("@/api/notes/notes");
    // Erro técnico e sem tradução própria (`getErrorMessage` não repassa esses ao usuário): é o
    // caminho que cai na mensagem de fallback, a única que distingue canvas de nota.
    vi.mocked(createNote).mockRejectedValueOnce(new Error("TypeError: undefined"));

    renderSection();
    await screen.findByText("Nenhum documento neste projeto");
    await user.click(screen.getByRole("button", { name: "Novo canvas" }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "Não foi possível criar o canvas.",
        })
      )
    );
    // Continua na página do projeto, e o botão volta a ficar clicável.
    expect(screen.getByTestId("url")).toHaveTextContent("/tasks/projects/p1");
    expect(screen.queryByText("editor da nota")).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Novo canvas" })).toBeEnabled()
    );

    // E o segundo clique, com a rede de volta, cria de verdade.
    await user.click(screen.getByRole("button", { name: "Novo canvas" }));
    await waitFor(() => expect(store.notes).toHaveLength(1));
    expect(store.notes[0].kind).toBe("canvas");
  });

  it("falha ao criar a nota mostra a mensagem da nota, não a do canvas", async () => {
    const user = userEvent.setup();
    const { createNote } = await import("@/api/notes/notes");
    vi.mocked(createNote).mockRejectedValueOnce(new Error("TypeError: undefined"));

    renderSection();
    await screen.findByText("Nenhum documento neste projeto");
    await user.click(screen.getAllByRole("button", { name: "Nova nota" })[0]);

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Não foi possível criar a nota." })
      )
    );
    expect(screen.queryByText("editor da nota")).toBeNull();
  });

  it("os dois botões saem do ar enquanto uma criação está no ar", async () => {
    const user = userEvent.setup();
    const { createNote } = await import("@/api/notes/notes");
    let liberar: (() => void) | undefined;
    vi.mocked(createNote).mockImplementationOnce(
      () => new Promise((resolve) => {
        liberar = () => resolve({
          id: "n1",
          title: "Sem título",
          content: "",
          project_id: "p1",
          kind: "canvas",
          canvas_data: { elements: [] },
        });
      })
    );

    renderSection();
    await screen.findByText("Nenhum documento neste projeto");
    await user.click(screen.getByRole("button", { name: "Novo canvas" }));

    expect(screen.getByRole("button", { name: "Novo canvas" })).toBeDisabled();
    for (const botao of screen.getAllByRole("button", { name: "Nova nota" })) {
      expect(botao).toBeDisabled();
    }

    liberar?.();
    expect(await screen.findByText("editor da nota")).toBeInTheDocument();
  });
});
