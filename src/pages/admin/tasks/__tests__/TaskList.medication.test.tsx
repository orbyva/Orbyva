import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import {
  fetchDependencies,
  fetchProjects,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Task } from "@/types/tasks";

/**
 * Feature 071: a criação de medicação **saiu** de Produtividade → Tarefas e passou a existir só na
 * Saúde (`/life/health/medications`). Este arquivo, que na 049/064 cobria o atalho "Nova medicação"
 * no cabeçalho e no `EmptyState`, agora é a trava contrária: garante que nenhuma porta de criação de
 * medicação sobreviveu aqui — nem botão, nem diálogo montado.
 *
 * A criação em si é coberta em `src/pages/admin/health/__tests__/MedicationQuickCreateDialog.test.tsx`
 * e nos testes do `HealthDashboard`/`MedicationList`.
 */


// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

vi.mock("@/api/health/medications", () => ({
  createMedicationWithDoses: vi.fn(async () => ({ id: "med-1" })),
  updateMedication: vi.fn(),
}));

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchTags: vi.fn(),
  fetchDependencies: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  createTag: vi.fn(),
}));

// Feature 131: a biblioteca de assets importa `@/api/tasks/iconAssets` direto (nunca o barril, que
// arrastaria a API de tarefas inteira para o chunk de quem a monta) — é este mock que a intercepta.
vi.mock("@/api/tasks/iconAssets", () => ({
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
}));


vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
  createRecurringApi: vi.fn(),
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchDependencies = vi.mocked(fetchDependencies);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Minha tarefa",
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

function mockLoad(tasks: Task[]) {
  mockedFetchTasks.mockResolvedValue(tasks);
  mockedFetchProjects.mockResolvedValue([]);
  mockedFetchTags.mockResolvedValue([]);
  mockedFetchDependencies.mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockResolvedValue([]);
}

describe("TaskList — a criação de medicação mora só na Saúde (071)", () => {
  beforeEach(() => {
    toastMock.mockReset();
    mockedFetchTasks.mockReset();
  });

  it("o cabeçalho de Tarefas não oferece mais 'Nova medicação'", async () => {
    mockLoad([makeTask()]);
    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("Minha tarefa");

    expect(screen.queryByRole("button", { name: "Nova medicação" })).toBeNull();
    expect(screen.queryByText(/medica/i)).toBeNull();
    // O cabeçalho continua com as ações que são de tarefa.
    expect(screen.getByRole("button", { name: "Nova tarefa" })).toBeInTheDocument();
  });

  it("a lista vazia oferece só 'Nova tarefa'", async () => {
    mockLoad([]);
    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("Nenhuma tarefa");

    expect(screen.queryByRole("button", { name: "Nova medicação" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Nova tarefa" }).length).toBeGreaterThan(0);
  });
});

/**
 * Item (a) do pedido literal da 071 — a criação saiu de Tarefas. Os testes acima cobrem o
 * `TaskList`; esta varredura cobre o resto do app: o diálogo mora na Saúde (lista + hub) e no `+`
 * de Vida (`QuickAddHost`), que é o overlay do módulo-pai — não em Produtividade.
 */
describe("o diálogo de criação de medicação só é montado na Saúde e no + de Vida", () => {
  it("só Saúde e o overlay do + de Vida importam MedicationQuickCreateDialog", () => {
    const src = resolve(__dirname, "../../../..");

    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
      });
    }

    // Menção em comentário não é porta: só conta quem importa o componente de verdade. Os próprios
    // testes (este inclusive) ficam de fora — porta é o que o app monta, não o que o teste cita.
    const importers = walk(src)
      .filter((file) => !file.includes("__tests__"))
      .filter((file) =>
        readFileSync(file, "utf8").includes(
          'from "@/pages/admin/health/MedicationQuickCreateDialog"'
        )
      )
      .map((file) => relative(src, file).split(sep).join("/"))
      .sort();

    expect(importers).toEqual([
      "components/QuickAddHost.tsx",
      "pages/admin/health/MedicationList.tsx",
      "pages/admin/life/HealthDashboard.tsx",
    ]);
  });
});
