import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Notes from "@/pages/admin/notes/Notes";
import { fetchNotes } from "@/api/notes/notes";
import type { Note, NoteDraft } from "@/types/notes";
import type { Project } from "@/types/tasks";

/**
 * Feature 114 — `/notes?project=<id>`: o recorte por projeto do módulo de Notas.
 *
 * Chrome é proibido na esteira, então este arquivo é a única prova de que (a) a URL recorta a
 * lista de verdade (o filtro é server-side, via `fetchNotes({ projectId })`), (b) sem o parâmetro
 * a lista continua completa, (c) criar nota/canvas dentro do recorte já nasce vinculado,
 * (d) fora do recorte a criação continua solta, e (e) projeto sem nota mostra o estado vazio
 * nomeando o projeto em vez de "Nenhuma nota ainda".
 */

const { store } = vi.hoisted(() => ({
  store: {
    notes: [] as Note[],
    projects: [] as Project[],
    created: [] as NoteDraft[],
    seq: 0,
  },
}));

// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

/**
 * O fake honra `{ projectId }` como o Supabase honra: com filtro, nota solta (`project_id: null`)
 * fica de fora — é o contrato escrito em `FetchNotesOptions`. Um fake que ignorasse a opção faria
 * o teste (a) passar com a tela quebrada.
 */
vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(
    async ({ projectId }: { projectId?: string | null } = {}) =>
      store.notes
        .filter((n) => (projectId ? n.project_id === projectId : true))
        .map((n) => ({ ...n }))
  ),
  createNote: vi.fn(async (draft: NoteDraft) => {
    store.created.push(draft);
    const created: Note = {
      id: `novo-${++store.seq}`,
      kind: "markdown",
      canvas_data: null,
      ...draft,
      title: "Sem título",
    };
    store.notes.push(created);
    return { ...created };
  }),
  deleteNote: vi.fn(),
}));

vi.mock("@/api/notes/folders", () => ({
  fetchNoteFolders: vi.fn(async () => []),
  deleteNoteFolder: vi.fn(),
  updateNoteFolder: vi.fn(),
}));

vi.mock("@/api/tasks/tags", () => ({
  fetchTags: vi.fn(async () => []),
  createTag: vi.fn(),
}));

vi.mock("@/api/tasks/projects", () => ({
  fetchProjects: vi.fn(async () => store.projects.map((p) => ({ ...p }))),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: "n1",
    title: "Materiais",
    content: "cimento e areia",
    project_id: "11111111-1111-4111-8111-111111111111",
    kind: "markdown",
    canvas_data: null,
    updated_at: new Date(Date.UTC(2026, 7, 16, 12, 0)).toISOString(),
    ...over,
  };
}

/** Mostra a rota atual — é o que prova que a criação abriu o editor da nota nova. */
function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
}

/**
 * Troca o `?project=` sem sair da rota `/notes` — é o que o link da barra de endereço (ou outro
 * link do app) faz: a mesma rota, outra query string, sem remontar `<Notes />`.
 */
function TrocarRecorte() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/notes?project=22222222-2222-4222-8222-222222222222")}>
      trocar para 22222222-2222-4222-8222-222222222222
    </button>
  );
}

function renderNotes(entry = "/notes") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/notes"
          element={
            <>
              <Notes />
              <LocationProbe />
            </>
          }
        />
        <Route path="/notes/:id" element={<LocationProbe />} />
        <Route path="/tasks/projects/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.created = [];
  store.seq = 0;
  store.projects = [
    { id: "11111111-1111-4111-8111-111111111111", name: "Obra da casa", color: "#ff6600", status: "active", tag_ids: [] },
    { id: "22222222-2222-4222-8222-222222222222", name: "Mudança", color: "#0066ff", status: "active", tag_ids: [] },
  ];
  store.notes = [
    makeNote({ id: "n1", title: "Materiais", project_id: "11111111-1111-4111-8111-111111111111" }),
    makeNote({ id: "n2", title: "Orçamento do pedreiro", project_id: "11111111-1111-4111-8111-111111111111" }),
    makeNote({ id: "n3", title: "Caixas por cômodo", project_id: "22222222-2222-4222-8222-222222222222" }),
    makeNote({ id: "n4", title: "Ideias soltas", project_id: null }),
  ];
});

describe("Notas — recorte por projeto na URL (feature 114)", () => {
  it("(a) em /notes?project=11111111-1111-4111-8111-111111111111 só as notas de 11111111-1111-4111-8111-111111111111 aparecem", async () => {
    renderNotes("/notes?project=11111111-1111-4111-8111-111111111111");

    expect(await screen.findByRole("button", { name: "Materiais" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Orçamento do pedreiro" })).toBeInTheDocument();
    // A nota do outro projeto e a nota solta ficam de fora — o recorte é do dado, não da tela.
    expect(screen.queryByRole("button", { name: "Caixas por cômodo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ideias soltas" })).toBeNull();
  });

  it("(b) em /notes, sem parâmetro, aparecem todas — inclusive a nota sem projeto", async () => {
    renderNotes("/notes");

    expect(await screen.findByRole("button", { name: "Materiais" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Caixas por cômodo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ideias soltas" })).toBeInTheDocument();
  });

  it("(c) dentro do recorte, 'Nova nota' e 'Novo canvas' nascem vinculados ao projeto", async () => {
    const user = userEvent.setup();
    renderNotes("/notes?project=11111111-1111-4111-8111-111111111111");

    await screen.findByRole("button", { name: "Materiais" });
    await user.click(screen.getByRole("button", { name: "Nova nota" }));

    await waitFor(() => expect(store.created).toHaveLength(1));
    expect(store.created[0]).toMatchObject({ project_id: "11111111-1111-4111-8111-111111111111", kind: "markdown" });
    // E abriu o editor da nota criada.
    expect(screen.getByTestId("location")).toHaveTextContent("/notes/novo-1");
  });

  /** O canvas segue a mesma regra — mesma tabela e mesma lista que a nota (feature 058). */
  it("(c) 'Novo canvas' dentro do recorte também nasce vinculado ao projeto", async () => {
    const user = userEvent.setup();
    renderNotes("/notes?project=11111111-1111-4111-8111-111111111111");

    await screen.findByRole("button", { name: "Materiais" });
    await user.click(screen.getByRole("button", { name: "Novo canvas" }));

    await waitFor(() => expect(store.created).toHaveLength(1));
    expect(store.created[0]).toMatchObject({ project_id: "11111111-1111-4111-8111-111111111111", kind: "canvas" });
  });

  it("(d) em /notes sem parâmetro, criar continua gerando nota solta (project_id null)", async () => {
    const user = userEvent.setup();
    renderNotes("/notes");

    await screen.findByRole("button", { name: "Materiais" });
    await user.click(screen.getByRole("button", { name: "Nova nota" }));

    await waitFor(() => expect(store.created).toHaveLength(1));
    expect(store.created[0].project_id).toBeNull();
  });

  it("criar a partir do estado vazio do recorte também nasce vinculado", async () => {
    const user = userEvent.setup();
    store.notes = [];
    renderNotes("/notes?project=11111111-1111-4111-8111-111111111111");

    await screen.findByText("Nenhuma nota neste projeto");
    // O botão do EmptyState, não o do cabeçalho.
    await user.click(screen.getAllByRole("button", { name: "Nova nota" })[1]);

    await waitFor(() => expect(store.created).toHaveLength(1));
    expect(store.created[0].project_id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("(e) projeto sem nota nenhuma mostra o estado vazio nomeando o projeto", async () => {
    store.notes = [makeNote({ id: "n4", title: "Ideias soltas", project_id: null })];
    renderNotes("/notes?project=11111111-1111-4111-8111-111111111111");

    expect(await screen.findByText("Nenhuma nota neste projeto")).toBeInTheDocument();
    // O nome do projeto aparece — "Nenhuma nota ainda" seria mentira: há notas, noutros projetos.
    expect(screen.getByText(/O projeto "Obra da casa" ainda não tem nota/)).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma nota ainda")).toBeNull();
  });

  it("busca sem resultado dentro do recorte menciona o termo E o projeto", async () => {
    const user = userEvent.setup();
    renderNotes("/notes?project=11111111-1111-4111-8111-111111111111");

    await screen.findByRole("button", { name: "Materiais" });
    await user.type(screen.getByLabelText("Filtrar notas"), "zzz");

    expect(await screen.findByText("Nenhuma nota encontrada")).toBeInTheDocument();
    expect(
      screen.getByText('Nada com "zzz" no título nem no conteúdo das notas de "Obra da casa".')
    ).toBeInTheDocument();
  });

  it("sem recorte, a busca vazia continua com o texto de antes (nada sobre projeto)", async () => {
    const user = userEvent.setup();
    renderNotes("/notes");

    await screen.findByRole("button", { name: "Materiais" });
    await user.type(screen.getByLabelText("Filtrar notas"), "zzz");

    expect(
      await screen.findByText('Nada com "zzz" no título nem no conteúdo.')
    ).toBeInTheDocument();
  });

  it("?project com id que não existe: lista vazia, sem erro e sem nome inventado", async () => {
    renderNotes("/notes?project=nao-existe");

    expect(await screen.findByText("Nenhuma nota neste projeto")).toBeInTheDocument();
    expect(
      screen.getByText(/^Este projeto ainda não tem nota/)
    ).toBeInTheDocument();
    // Nada de `undefined` no texto e nenhum toast de falha: a consulta só não casou nada.
    expect(screen.queryByText(/undefined/)).toBeNull();
    expect(toastMock).not.toHaveBeenCalled();
  });

  /**
   * A tela NÃO remonta quando só a query string muda (é a mesma rota) — é a armadilha que o
   * `useEffect` de `?q` já documenta. Sem `projectFilter` nas dependências do `load`, a lista
   * ficaria parada no recorte anterior até um F5.
   */
  it("trocar o ?project sem sair da rota recarrega a lista", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/notes?project=11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route
            path="/notes"
            element={
              <>
                <Notes />
                <TrocarRecorte />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByRole("button", { name: "Materiais" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "trocar para 22222222-2222-4222-8222-222222222222" }));

    expect(
      await screen.findByRole("button", { name: "Caixas por cômodo" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Materiais" })).toBeNull()
    );
  });

  it("remover ?q na mesma rota limpa a busca antiga", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/notes?q=zzz"]}>
        <Routes>
          <Route
            path="/notes"
            element={
              <>
                <Notes />
                <TrocarRecorte />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Nenhuma nota encontrada")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "trocar para 22222222-2222-4222-8222-222222222222" }));

    expect(await screen.findByRole("button", { name: "Caixas por cômodo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filtrar notas")).toHaveValue("");
  });

  it("resposta lenta do projeto anterior não sobrescreve o recorte novo", async () => {
    const user = userEvent.setup();
    let resolveFirst!: (notes: Note[]) => void;
    vi.mocked(fetchNotes)
      .mockImplementationOnce(() => new Promise<Note[]>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce([makeNote({ id: "n3", title: "Caixas por cômodo", project_id: "22222222-2222-4222-8222-222222222222" })]);

    render(
      <MemoryRouter initialEntries={["/notes?project=11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route
            path="/notes"
            element={
              <>
                <Notes />
                <TrocarRecorte />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "trocar para 22222222-2222-4222-8222-222222222222" }));
    expect(await screen.findByRole("button", { name: "Caixas por cômodo" })).toBeInTheDocument();

    await act(async () => {
      resolveFirst([makeNote({ id: "n1", title: "Materiais", project_id: "11111111-1111-4111-8111-111111111111" })]);
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Caixas por cômodo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Materiais" })).toBeNull();
  });

  it("URL com projeto inválido não envia esse valor ao criar nota", async () => {
    const user = userEvent.setup();
    renderNotes("/notes?project=nao-existe");

    await screen.findByText("Nenhuma nota neste projeto");
    await user.click(screen.getAllByRole("button", { name: "Nova nota" })[1]);

    await waitFor(() => expect(store.created).toHaveLength(1));
    expect(store.created[0].project_id).toBeNull();
  });
});
