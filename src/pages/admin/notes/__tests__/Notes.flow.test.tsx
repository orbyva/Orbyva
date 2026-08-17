import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Notes from "@/pages/admin/notes/Notes";
import NoteDetail from "@/pages/admin/notes/NoteDetail";
import { normalizeNoteDraft } from "@/domain/notes/noteDraft";
import type { Note, NoteDraft, NoteUpdateRequest } from "@/types/notes";

/**
 * Fluxo fim a fim do módulo de Notas contra um backend falso em memória que imita o schema real —
 * inclusive o `on delete set null` de `note.project_id` e o `updated_at` que a API carimba no
 * update. Substitui a verificação manual no navegador (proibida pela skill `next`): criar nota,
 * escrever Markdown, ver o preview, vincular a um projeto, voltar para a lista, filtrar, recarregar
 * a página (remontar, refazendo os fetches) e excluir.
 */

const { store } = vi.hoisted(() => ({
  store: {
    notes: [] as Note[],
    projects: [] as { id: string; name: string }[],
    seq: 0,
    clock: 0,
  },
}));

/** Cada escrita anda o relógio, como o `now()` do Postgres faria. */
function stamp(): string {
  store.clock += 1;
  return new Date(Date.UTC(2026, 7, 16, 12, store.clock)).toISOString();
}

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(async ({ projectId }: { projectId?: string | null } = {}) =>
    store.notes
      .filter((n) => (projectId ? n.project_id === projectId : true))
      .map((n) => ({ ...n }))
      // `order("updated_at", { ascending: false })`
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
  ),
  fetchNote: vi.fn(async (id: string) => {
    const found = store.notes.find((n) => n.id === id);
    return found ? { ...found } : null;
  }),
  createNote: vi.fn(async (draft: NoteDraft) => {
    const at = stamp();
    // A API real normaliza antes de gravar — o falso usa a mesma função, não uma cópia.
    const created: Note = {
      id: `n${++store.seq}`,
      ...normalizeNoteDraft(draft),
      created_at: at,
      updated_at: at,
    };
    store.notes.push(created);
    return { ...created };
  }),
  updateNote: vi.fn(async ({ id, ...fields }: NoteUpdateRequest) => {
    const target = store.notes.find((n) => n.id === id);
    if (!target) return;
    Object.assign(target, fields, { updated_at: stamp() });
    if (fields.title !== undefined) {
      target.title = normalizeNoteDraft({
        title: fields.title,
        content: "",
        project_id: null,
      }).title;
    }
  }),
  deleteNote: vi.fn(async (id: string) => {
    store.notes = store.notes.filter((n) => n.id !== id);
  }),
}));

vi.mock("@/api/tasks/projects", () => ({
  fetchProjects: vi.fn(async () => store.projects.map((p) => ({ ...p }))),
}));

// `toast` precisa ter identidade estável: o `load` das páginas é `useCallback([toast])`.
const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

/** O que a migration faz ao excluir um projeto: zera o vínculo, preserva a nota. */
function deleteProject(projectId: string) {
  store.projects = store.projects.filter((p) => p.id !== projectId);
  for (const note of store.notes) {
    if (note.project_id === projectId) note.project_id = null;
  }
}

function renderApp(url = "/notes") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/notes" element={<Notes />} />
        <Route path="/notes/:id" element={<NoteDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

/** O autosave tem debounce de 800 ms; a espera precisa caber isso. */
const AUTOSAVE = { timeout: 4000 };

beforeEach(() => {
  vi.clearAllMocks();
  store.notes = [];
  store.projects = [{ id: "p1", name: "Obra da casa" }];
  store.seq = 0;
  store.clock = 0;
});

describe("Notas — fluxo fim a fim", () => {
  it("lista vazia oferece criar a primeira nota", async () => {
    renderApp();
    expect(await screen.findByText("Nenhuma nota ainda")).toBeInTheDocument();
  });

  it("criar uma nota abre o editor dela e a nota nasce com título padrão", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Nenhuma nota ainda");
    await user.click(screen.getAllByRole("button", { name: "Nova nota" })[0]);

    // Navegou para /notes/:id — o editor está montado.
    expect(await screen.findByLabelText("Título")).toBeInTheDocument();
    expect(store.notes).toHaveLength(1);
    // Título vazio virou "Sem título": a coluna é not null (normalizeNoteDraft).
    expect(store.notes[0].title).toBe("Sem título");
    expect(store.notes[0].content).toBe("");
    expect(store.notes[0].project_id).toBeNull();
  });

  it("escrever título e conteúdo salva sozinho, sem botão Salvar", async () => {
    const user = userEvent.setup();
    store.notes = [
      {
        id: "n1",
        title: "Rascunho",
        content: "",
        project_id: null,
        updated_at: stamp(),
      },
    ];
    renderApp("/notes/n1");

    const title = await screen.findByLabelText("Título");
    await user.clear(title);
    await user.type(title, "Pauta da reunião");

    // O indicador aparece na hora, antes do debounce virar.
    expect(await screen.findByText("Salvando…")).toBeInTheDocument();

    await waitFor(
      () => expect(store.notes[0].title).toBe("Pauta da reunião"),
      AUTOSAVE
    );
    expect(await screen.findByText("Salvo", {}, AUTOSAVE)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Conteúdo"), "- decidir o orçamento");
    await waitFor(
      () => expect(store.notes[0].content).toBe("- decidir o orçamento"),
      AUTOSAVE
    );
    // Não existe botão Salvar: o autosave é a única via (ver Decisões da 055).
    expect(screen.queryByRole("button", { name: /salvar/i })).toBeNull();
  });

  it("a aba Visualizar renderiza o Markdown do corpo da nota", async () => {
    const user = userEvent.setup();
    store.notes = [
      {
        id: "n1",
        title: "Reforma",
        content: "## Etapas\n\n- [x] pedreiro\n- [ ] pintura\n\n**urgente**",
        project_id: null,
        updated_at: stamp(),
      },
    ];
    renderApp("/notes/n1");

    await user.click(await screen.findByRole("tab", { name: "Visualizar" }));

    const preview = within(screen.getAllByRole("tabpanel")[0]);
    expect(preview.getByRole("heading", { name: "Etapas" })).toBeInTheDocument();
    expect(preview.getAllByRole("listitem")).toHaveLength(2);
    // GFM: checklist vira checkbox de verdade, não texto "[x]".
    expect(preview.getAllByRole("checkbox")).toHaveLength(2);
    expect(preview.getByText("urgente").tagName).toBe("STRONG");
  });

  it("vincular a nota a um projeto persiste e aparece na lista", async () => {
    const user = userEvent.setup();
    store.notes = [
      {
        id: "n1",
        title: "Materiais",
        content: "cimento e areia",
        project_id: null,
        updated_at: stamp(),
      },
    ];
    renderApp("/notes/n1");

    await user.click(await screen.findByRole("option", { name: "Obra da casa" }));
    await waitFor(() => expect(store.notes[0].project_id).toBe("p1"), AUTOSAVE);

    // De volta à lista, o vínculo aparece no card.
    await user.click(screen.getByRole("button", { name: /Todas as notas/ }));
    const card = (await screen.findByText("Materiais")).closest("article") as HTMLElement;
    expect(within(card).getByText("Obra da casa")).toBeInTheDocument();
    expect(within(card).getByText("cimento e areia")).toBeInTheDocument();
  });

  it("o card mostra o excerpt do conteúdo, sem a marcação nem o título repetido", async () => {
    store.notes = [
      {
        id: "n1",
        title: "Reforma",
        content: "# Reforma\n\n- comprar **cimento** na terça",
        project_id: null,
        updated_at: stamp(),
      },
    ];
    renderApp();

    const card = (await screen.findByText("Reforma")).closest("article") as HTMLElement;
    expect(within(card).getByText("comprar cimento na terça")).toBeInTheDocument();
  });

  it("o filtro casa no título e no conteúdo, sem depender de acento nem de caixa", async () => {
    const user = userEvent.setup();
    store.notes = [
      { id: "n1", title: "Reunião", content: "pauta", project_id: null, updated_at: stamp() },
      { id: "n2", title: "Mercado", content: "cimento", project_id: null, updated_at: stamp() },
    ];
    renderApp();

    const filter = await screen.findByLabelText("Filtrar notas");

    await user.type(filter, "reuniao");
    expect(screen.getByText("Reunião")).toBeInTheDocument();
    expect(screen.queryByText("Mercado")).toBeNull();

    // Agora por um trecho que só existe no conteúdo da outra nota.
    await user.clear(filter);
    await user.type(filter, "CIMENTO");
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.queryByText("Reunião")).toBeNull();

    await user.clear(filter);
    await user.type(filter, "xyz");
    expect(await screen.findByText("Nenhuma nota encontrada")).toBeInTheDocument();
  });

  it("a lista traz a nota editada mais recentemente primeiro", async () => {
    store.notes = [
      { id: "n1", title: "Antiga", content: "", project_id: null, updated_at: stamp() },
      { id: "n2", title: "Recente", content: "", project_id: null, updated_at: stamp() },
    ];
    renderApp();

    const titles = (await screen.findAllByRole("heading", { level: 2 })).map(
      (h) => h.textContent
    );
    expect(titles).toEqual(["Recente", "Antiga"]);
  });

  it("recarregar a página traz o que foi escrito (persistiu no store)", async () => {
    const user = userEvent.setup();
    store.notes = [
      { id: "n1", title: "Rascunho", content: "", project_id: null, updated_at: stamp() },
    ];
    const view = renderApp("/notes/n1");

    await user.type(await screen.findByLabelText("Conteúdo"), "não pode sumir");
    await waitFor(
      () => expect(store.notes[0].content).toBe("não pode sumir"),
      AUTOSAVE
    );

    view.unmount();
    renderApp("/notes/n1");
    // O corpo agora é um CodeMirror (feature 056): o texto vive no `contenteditable`, não num
    // `value` de textarea.
    expect(await screen.findByLabelText("Conteúdo")).toHaveTextContent(
      "não pode sumir"
    );
  });

  it("excluir a nota pela lista tira ela do banco e da tela", async () => {
    const user = userEvent.setup();
    store.notes = [
      { id: "n1", title: "Descartável", content: "", project_id: null, updated_at: stamp() },
    ];
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: "Excluir nota Descartável" })
    );
    await user.click(await screen.findByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(store.notes).toHaveLength(0));
    expect(await screen.findByText("Nenhuma nota ainda")).toBeInTheDocument();
  });

  it("excluir o projeto preserva a nota, só desfaz o vínculo (on delete set null)", async () => {
    store.notes = [
      {
        id: "n1",
        title: "Materiais",
        content: "cimento",
        project_id: "p1",
        updated_at: stamp(),
      },
    ];
    deleteProject("p1");
    renderApp();

    const card = (await screen.findByText("Materiais")).closest("article") as HTMLElement;
    expect(within(card).getByText("cimento")).toBeInTheDocument();
    // O projeto sumiu, a nota não.
    expect(screen.queryByText("Obra da casa")).toBeNull();
  });

  it("abrir uma nota que não existe mais mostra o estado vazio, não uma tela quebrada", async () => {
    renderApp("/notes/inexistente");
    expect(await screen.findByText("Nota não encontrada")).toBeInTheDocument();
  });
});
