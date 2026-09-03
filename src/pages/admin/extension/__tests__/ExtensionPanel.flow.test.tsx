import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExtensionPanel from "@/pages/admin/extension/ExtensionPanel";
import { emptyExtractedPage, type ExtractedPage } from "@/domain/extension/pageContext";
import { emptyTask } from "@/domain/tasks/taskDraft";
import type { Task } from "@/types/tasks";

import type { ContentLink } from "@/types/contentLinks";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";
import type { Project } from "@/types/tasks";

const { store, toastMock, pageState } = vi.hoisted(() => ({
  store: {
    tasks: [] as Task[],
    shoppingItems: [] as ShoppingItem[],
    links: [] as ContentLink[],
    projects: [] as Project[],
    categories: [] as ShoppingCategory[],
    seq: 0,
  },
  toastMock: vi.fn(),
  pageState: { page: null as ExtractedPage | null },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "eu@example.com" },
    loading: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock, toasts: [] }),
  toast: toastMock,
}));

vi.mock("@/hooks/useLocalDay", () => ({
  useLocalDay: () => "2026-09-03",
}));

vi.mock("@/hooks/useExtensionPageContext", () => ({
  useExtensionPageContext: () => ({ embedded: true, page: pageState.page }),
}));

vi.mock("@/hooks/useDocumentMeta", () => ({
  useDocumentMeta: () => undefined,
}));

vi.mock("@/api/hub", () => ({
  loadHomeBundle: vi.fn(async () => ({
    habits: [],
    habitLogs: [],
    alerts: [],
    budgetRows: [],
    summary: { balance: 1200 },
    alertDomains: { recurring: [] },
  })),
}));

vi.mock("@/api/tasks/tasks", () => ({
  fetchTasks: vi.fn(async () => store.tasks.map((task) => ({ ...task }))),
  createTask: vi.fn(async (payload: Partial<Task>) => {
    const created: Task = {
      ...emptyTask(),
      id: `t${++store.seq}`,
      recurrence_origin_id: null,
      linked_installment_number: null,
      title: payload.title ?? "",
      due_date: payload.due_date ?? "2026-09-03",
      project_id: payload.project_id ?? null,
      status: "todo",
    };
    store.tasks.unshift(created);
    return created;
  }),
  updateTask: vi.fn(async ({ id, status }: { id: string; status: Task["status"] }) => {
    const target = store.tasks.find((task) => task.id === id);
    if (target && status) target.status = status;
  }),
}));

vi.mock("@/api/tasks/taskExternalLinks", () => ({
  saveExternalLinksForTask: vi.fn(async () => []),
}));

vi.mock("@/api/shopping/items", () => ({
  fetchShoppingItems: vi.fn(async () => store.shoppingItems.map((item) => ({ ...item }))),
}));

vi.mock("@/api/shopping/categories", () => ({
  fetchShoppingCategories: vi.fn(async () => store.categories.map((c) => ({ ...c }))),
}));

vi.mock("@/api/tasks/projects", () => ({
  fetchProjects: vi.fn(async () => store.projects.map((p) => ({ ...p }))),
}));

vi.mock("@/api/contentLinks", () => ({
  fetchContentLinks: vi.fn(async () => store.links.map((link) => ({ ...link }))),
}));

vi.mock("@/api/movies", () => ({ fetchAllMovies: vi.fn(async () => []) }));
vi.mock("@/api/books", () => ({ fetchAllBooks: vi.fn(async () => []) }));
vi.mock("@/api/albums", () => ({ fetchAllAlbums: vi.fn(async () => []) }));
vi.mock("@/api/places", () => ({ fetchPlaces: vi.fn(async () => []) }));

vi.mock("@/lib/extensionCapture", () => ({
  capturePage: vi.fn(async () => ({ kind: "movie", label: "Cinema" })),
  captureAsLink: vi.fn(async () => ({ kind: "unknown", label: "Links" })),
  captureAsNote: vi.fn(async () => ({ kind: "unknown", label: "Notas" })),
  captureAsShoppingItem: vi.fn(async () => ({
    kind: "product",
    label: "Lista de compras",
  })),
}));

function page(url: string, extra: Partial<ExtractedPage> = {}): ExtractedPage {
  return { ...emptyExtractedPage(), url, title: "Título da aba", ...extra };
}

function seedTask(overrides: Partial<Task> = {}): Task {
  const task: Task = {
    ...emptyTask(),
    id: overrides.id ?? `seed-${++store.seq}`,
    recurrence_origin_id: null,
    linked_installment_number: null,
    title: overrides.title ?? "Tarefa",
    due_date: overrides.due_date ?? "2026-09-03",
    status: overrides.status ?? "todo",
    ...overrides,
  };
  store.tasks.push(task);
  return task;
}

function seedLink(url: string): void {
  store.links.push({
    id: `l${++store.seq}`,
    title: "Link",
    url,
    type: "website",
    status: "to_consume",
    is_favorite: false,
    tag_ids: [],
  });
}

describe("ExtensionPanel — captura do dia", () => {
  beforeEach(() => {
    store.tasks = [];
    store.shoppingItems = [
      {
        id: "s-a",
        shopping_category_id: null,
        title: "A",
        status: "pending",
      },
      {
        id: "s-b",
        shopping_category_id: null,
        title: "B",
        status: "pending",
      },
    ];
    store.links = [
      {
        id: "l-a",
        title: "A",
        url: "https://example.com/a",
        type: "website",
        status: "to_consume",
        is_favorite: false,
        tag_ids: [],
      },
      {
        id: "l-b",
        title: "B",
        url: "https://example.com/b",
        type: "website",
        status: "to_consume",
        is_favorite: false,
        tag_ids: [],
      },
      {
        id: "l-c",
        title: "C",
        url: "https://example.com/c",
        type: "website",
        status: "to_consume",
        is_favorite: false,
        tag_ids: [],
      },
      {
        id: "l-d",
        title: "D",
        url: "https://example.com/d",
        type: "website",
        status: "to_consume",
        is_favorite: false,
        tag_ids: [],
      },
    ];
    store.projects = [];
    store.categories = [];
    store.seq = 0;
    pageState.page = null;
    toastMock.mockReset();
    vi.clearAllMocks();
  });

  it("mostra contadores, conclui tarefa de hoje e cria com o link da aba", async () => {
    seedTask({ id: "late", title: "Pagar boleto", due_date: "2026-09-01" });
    seedTask({ id: "today", title: "Review PR", due_date: "2026-09-03" });
    pageState.page = page("https://github.com/orbyva/orbyva/pull/12", {
      title: "Fix login | GitHub",
    });

    const user = userEvent.setup();
    render(<ExtensionPanel />);

    await waitFor(() => {
      expect(screen.getByText("Pagar boleto")).toBeInTheDocument();
    });
    expect(screen.getByText("Review PR")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /1\s*atrasada/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /1\s*hoje/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /2\s*compras/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /4\s*links/ })).toBeInTheDocument();

    const { updateTask } = await import("@/api/tasks/tasks");
    await user.click(screen.getByRole("button", { name: /Review PR/i }));
    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith({ id: "today", status: "done" });
    });

    const title = screen.getByLabelText("Título da nova tarefa");
    await user.clear(title);
    await user.type(title, "Olhar o PR");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    const { createTask } = await import("@/api/tasks/tasks");
    const { saveExternalLinksForTask } = await import(
      "@/api/tasks/taskExternalLinks"
    );
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Olhar o PR",
          due_date: "2026-09-03",
        })
      );
      expect(saveExternalLinksForTask).toHaveBeenCalledWith(
        expect.any(String),
        [
          {
            url: "https://github.com/orbyva/orbyva/pull/12",
            comment: null,
            position: 0,
          },
        ]
      );
    });
  });

  it("salva página comum em Links e produto na lista de compras", async () => {
    const user = userEvent.setup();
    const { captureAsLink, captureAsShoppingItem } = await import(
      "@/lib/extensionCapture"
    );

    pageState.page = page("https://example.com/artigo", {
      title: "Como fazer X",
    });
    const { rerender } = render(<ExtensionPanel />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Salvar em Links" })
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/lista de compras ainda não está no app/i)
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar em Links" }));
    await waitFor(() => {
      expect(captureAsLink).toHaveBeenCalled();
    });

    pageState.page = page("https://www.mercadolivre.com.br/fone/p/1", {
      title: "Fone",
      price: 199,
    });
    rerender(<ExtensionPanel />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Adicionar à lista" })
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Adicionar à lista" }));
    await waitFor(() => {
      expect(captureAsShoppingItem).toHaveBeenCalled();
    });
  });

  it("mostra já existe, clipa nota, escolhe destino e marca a dose", async () => {
    const user = userEvent.setup();
    seedLink("https://example.com/artigo");
    store.projects = [
      {
        id: "p1",
        name: "Orbyva",
        description: null,
        color: null,
        status: "active",
        tag_ids: [],
      },
    ];
    store.categories = [{ id: "c1", name: "Casa" }];
    seedTask({
      id: "dose-1",
      title: "Losartana",
      due_date: "2026-09-03",
      due_time: "08:00",
      is_medication: true,
    });

    pageState.page = page("https://example.com/artigo", {
      title: "Como fazer X",
    });
    const { rerender } = render(<ExtensionPanel />);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /Já está em Links/ })
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Losartana")).toBeInTheDocument();
    expect(screen.getByText("08:00")).toBeInTheDocument();

    const { captureAsNote } = await import("@/lib/extensionCapture");
    await user.click(screen.getByRole("button", { name: /Clipar em nota/ }));
    await waitFor(() => {
      expect(captureAsNote).toHaveBeenCalled();
    });

    const { updateTask } = await import("@/api/tasks/tasks");
    await user.click(screen.getByRole("button", { name: "Tomada" }));
    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith({ id: "dose-1", status: "done" });
    });

    await user.selectOptions(
      screen.getByLabelText("Projeto da tarefa"),
      "p1"
    );
    const title = screen.getByLabelText("Título da nova tarefa");
    await user.clear(title);
    await user.type(title, "Ler o artigo");
    await user.click(screen.getByRole("button", { name: "Criar" }));
    const { createTask } = await import("@/api/tasks/tasks");
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Ler o artigo",
          project_id: "p1",
        })
      );
    });

    pageState.page = page("https://www.mercadolivre.com.br/novo/p/1", {
      title: "Fone novo",
      price: 99,
    });
    rerender(<ExtensionPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText("Categoria da compra")).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText("Categoria da compra"), "c1");
    const { captureAsShoppingItem } = await import("@/lib/extensionCapture");
    await user.click(screen.getByRole("button", { name: "Adicionar à lista" }));
    await waitFor(() => {
      expect(captureAsShoppingItem).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://www.mercadolivre.com.br/novo/p/1",
        }),
        "c1"
      );
    });
  });
});
