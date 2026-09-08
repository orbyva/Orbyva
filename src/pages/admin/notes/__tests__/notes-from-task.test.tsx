import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NoteDetail from "@/pages/admin/notes/NoteDetail";
import { ProjectDocumentsSection } from "@/pages/admin/notes/ProjectDocumentsSection";
import { TaskNoteButtons } from "@/pages/admin/tasks/TaskNoteButtons";
import { normalizeNoteDraft } from "@/domain/notes/noteDraft";
import { mergeProjectDocuments } from "@/domain/notes/projectDocuments";
import type { Note, NoteDraft, NoteLink, NoteLinkDraft } from "@/types/notes";
import type { Task } from "@/types/tasks";

/**
 * Feature 084, o **outro lado** do vínculo: o que o pedido descreve como "na tela de notas, o link
 * fica feito, o projeto já preenchido". Backend falso em memória (mesmo padrão do resto do módulo
 * de Notas), botão da tarefa de um lado, `/notes/:id` do outro — o caminho inteiro sem navegador.
 */

const { store } = vi.hoisted(() => ({
  store: {
    notes: [] as Note[],
    links: [] as NoteLink[],
    projects: [] as { id: string; name: string }[],
    /** Ids das tarefas de cada projeto — é o que a aba "Documentos" cruza com os vínculos (105). */
    tasksByProject: {} as Record<string, string[]>,
    seq: 0,
  },
}));

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(async ({ projectId }: { projectId?: string | null } = {}) =>
    store.notes
      // Com filtro, `project_id is null` fica de fora — nota solta não pertence a projeto nenhum.
      .filter((n) => (projectId ? n.project_id === projectId : true))
      .map((n) => ({ ...n }))
  ),
  fetchNote: vi.fn(async (id: string) => {
    const found = store.notes.find((n) => n.id === id);
    return found ? { ...found } : null;
  }),
  createNote: vi.fn(async (draft: NoteDraft) => {
    // A API real normaliza antes de gravar — o falso usa a mesma função, não uma cópia.
    const created: Note = {
      id: `n${++store.seq}`,
      ...normalizeNoteDraft(draft),
      updated_at: "2026-08-19T12:00:00.000Z",
    };
    store.notes.push(created);
    return { ...created };
  }),
  updateNote: vi.fn(async () => {}),
  deleteNote: vi.fn(async () => {}),
  fetchNotesMentioning: vi.fn(async () => []),
}));

vi.mock("@/api/notes/noteLinks", () => ({
  fetchLinksForNote: vi.fn(async (noteId: string) =>
    store.links.filter((link) => link.note_id === noteId).map((l) => ({ ...l }))
  ),
  fetchNotesLinkedTo: vi.fn(async (entityType: string, entityId: string) => {
    const ids = store.links
      .filter((l) => l.entity_type === entityType && l.entity_id === entityId)
      .map((l) => l.note_id);
    return store.notes.filter((n) => ids.includes(n.id)).map((n) => ({ ...n }));
  }),
  addNoteLink: vi.fn(async (draft: NoteLinkDraft) => {
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
  removeNoteLink: vi.fn(async () => {}),
  fetchNotesSharingEntity: vi.fn(async () => []),
}));

/**
 * A aba "Documentos" do projeto (feature 105) não lê `fetchNotes({ projectId })`: ela monta a união
 * das três origens. O falso delega à mesma função pura do domínio que a API usa.
 */
vi.mock("@/api/notes/projectDocuments", () => ({
  fetchProjectDocuments: vi.fn(async (projectId: string) =>
    mergeProjectDocuments({
      projectNotes: store.notes.filter((n) => n.project_id === projectId),
      linkedNotes: store.notes.map((n) => ({ ...n })),
      links: store.links,
      projectTaskIds: store.tasksByProject[projectId] ?? [],
      projectId,
    })
  ),
  countProjectDocuments: vi.fn(async () => 0),
}));

vi.mock("@/api/tasks/projects", () => ({
  fetchProjects: vi.fn(async () => store.projects.map((p) => ({ ...p }))),
}));

vi.mock("@/api/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/search")>();
  return { ...actual, searchGlobal: vi.fn(async () => []) };
});

/** 2,7 MB que não rodam em jsdom — o duplo mantém só a fronteira do módulo real. */
vi.mock("@excalidraw/excalidraw", () => ({ exportToSvg: vi.fn() }));
vi.mock("@/pages/admin/notes/ExcalidrawCanvas", () => ({
  default: ({ initialScene }: { initialScene: { elements: readonly unknown[] } }) => (
    <div data-testid="excalidraw">{`elementos: ${initialScene.elements.length}`}</div>
  ),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    project_id: "p1",
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Trocar a fiação da sala",
    status: "todo",
    tag_ids: [],
    due_date: null,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

/** A tarefa de um lado, a rota da nota do outro — é o app inteiro que este teste precisa. */
function renderAppWithTask(task: Task) {
  // A tarefa entra no projeto dela, como no banco: é isso que a aba "Documentos" cruza depois.
  if (task.project_id) {
    (store.tasksByProject[task.project_id] ??= []).push(task.id);
  }
  return render(
    <MemoryRouter initialEntries={["/tasks"]}>
      <Routes>
        <Route path="/tasks" element={<TaskNoteButtons task={task} />} />
        <Route path="/notes/:id" element={<NoteDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.notes = [];
  store.links = [];
  store.projects = [{ id: "p1", name: "Obra da casa" }];
  store.tasksByProject = {};
  store.seq = 0;
});

describe("Nota criada a partir de uma tarefa", () => {
  it("abre com o projeto da tarefa já selecionado no ProjectPicker", async () => {
    const user = userEvent.setup();
    renderAppWithTask(makeTask());

    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));

    // Chegou no editor da nota recém-criada.
    expect(await screen.findByLabelText("Título")).toHaveValue("Trocar a fiação da sala");
    const picker = await screen.findByRole("listbox", { name: "Projeto" });
    expect(within(picker).getByRole("option", { name: "Obra da casa" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(within(picker).getByRole("option", { name: "Sem projeto" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("abre com o vínculo da tarefa já feito no painel de Vínculos", async () => {
    const user = userEvent.setup();
    renderAppWithTask(makeTask());

    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));

    // O chip do `NoteLinksPanel`: rótulo do tipo + título congelado da tarefa.
    const chip = await screen.findByRole("link", { name: /Tarefa:\s*Trocar a fiação da sala/ });
    // `noteLinkHref("task", id)` leva à lista de tarefas — não existe rota de detalhe de tarefa.
    expect(chip).toHaveAttribute("href", "/tasks");
    expect(store.links).toHaveLength(1);
    expect(store.links[0]).toMatchObject({ entity_type: "task", entity_id: "t1" });
  });

  it("tarefa sem projeto vira nota solta: nenhum projeto marcado, vínculo com a tarefa mantido", async () => {
    const user = userEvent.setup();
    renderAppWithTask(makeTask({ project_id: null }));

    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));

    const picker = await screen.findByRole("listbox", { name: "Projeto" });
    expect(within(picker).getByRole("option", { name: "Sem projeto" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(
      await screen.findByRole("link", { name: /Tarefa:\s*Trocar a fiação da sala/ })
    ).toBeInTheDocument();
  });
});

describe("A nota da tarefa na aba 'Documentos' do projeto (features 069 e 105)", () => {
  /** A aba do projeto, montada sozinha — é o que a página do projeto faz ao abrir a aba. */
  function renderProjectNotes(projectId: string) {
    render(
      <MemoryRouter initialEntries={[`/tasks/projects/${projectId}`]}>
        <ProjectDocumentsSection projectId={projectId} />
      </MemoryRouter>
    );
  }

  it("nota criada de uma tarefa com projeto aparece na aba daquele projeto, sem nada a mais", async () => {
    const user = userEvent.setup();
    renderAppWithTask(makeTask());
    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));
    await screen.findByLabelText("Título");

    cleanup();
    renderProjectNotes("p1");

    // A nota nasceu com o `project_id` da tarefa **e** com o vínculo para ela: chega na aba pelas
    // duas portas (feature 105) e, ainda assim, aparece uma vez só.
    expect(
      await screen.findByRole("link", { name: /Trocar a fiação da sala/ })
    ).toHaveAttribute("href", "/notes/n1");
  });

  it("nota criada de uma tarefa sem projeto é nota solta: não aparece em projeto nenhum", async () => {
    const user = userEvent.setup();
    renderAppWithTask(makeTask({ project_id: null }));
    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));
    await screen.findByLabelText("Título");
    expect(store.notes[0].project_id).toBeNull();

    cleanup();
    renderProjectNotes("p1");

    // O vínculo com a tarefa existe, mas a tarefa não é de projeto nenhum: vínculo órfão para a
    // aba de `p1`, que continua vazia.
    expect(await screen.findByText("Nenhum documento neste projeto")).toBeInTheDocument();
    expect(screen.queryByText("Trocar a fiação da sala")).not.toBeInTheDocument();
  });
});

describe("Canvas criado a partir de uma tarefa", () => {
  it("abre o editor de canvas com o projeto preenchido e o vínculo da tarefa", async () => {
    const user = userEvent.setup();
    renderAppWithTask(makeTask());

    await user.click(screen.getByRole("button", { name: "Criar canvas desta tarefa" }));

    // Canvas é nota com `kind: "canvas"` — quem monta é o `CanvasEditor`, não o editor markdown.
    expect(await screen.findByTestId("excalidraw")).toHaveTextContent("elementos: 0");
    expect(screen.queryByLabelText("Conteúdo")).not.toBeInTheDocument();
    expect(store.notes[0].kind).toBe("canvas");
    expect(store.notes[0].canvas_data).toEqual({ elements: [] });

    const picker = await screen.findByRole("listbox", { name: "Projeto" });
    expect(within(picker).getByRole("option", { name: "Obra da casa" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(
      await screen.findByRole("link", { name: /Tarefa:\s*Trocar a fiação da sala/ })
    ).toBeInTheDocument();
  });

  it("o canvas da tarefa não aparece como nota: cada botão volta a enxergar só o seu kind", async () => {
    const user = userEvent.setup();
    renderAppWithTask(makeTask());

    await user.click(screen.getByRole("button", { name: "Criar canvas desta tarefa" }));
    await screen.findByTestId("excalidraw");

    // Reabre o formulário da mesma tarefa, com o backend já semeado: um canvas, nenhuma nota.
    cleanup();
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <TaskNoteButtons task={makeTask()} />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("button", { name: "Canvas desta tarefa — 1" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Criar nota desta tarefa" })
    ).toBeInTheDocument();
  });
});
