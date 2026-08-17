import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskFormFields, type TaskFormTab } from "@/pages/admin/tasks/TaskFormFields";
import { emptyTask } from "@/domain/tasks/taskDraft";
import type { Project, SubtaskDraft, Task, TaskCreateRequest } from "@/types/tasks";

/**
 * Feature 042 — `TaskFormFields.tsx` extrai as 4 abas (Geral/Data e repetição/Organização/
 * Registros) que existiam duplicadas byte a byte em `TaskList.tsx` e `ProjectDetail.tsx`.
 * Cobrimos aqui só o componente isolado: presença condicional do campo Projeto e da aba
 * Registros, e a navegação entre abas — o comportamento completo do dialog (validação de
 * `handleSave`, herança de projeto em subtarefa, etc.) já é coberto end-to-end por
 * `TaskList.subtask-edit.test.tsx`/`ProjectDetail.subtask-edit.test.tsx`, que continuam
 * passando sem alteração depois da extração.
 */

vi.mock("@/api/tasks", () => ({
  uploadTaskIcon: vi.fn(),
  fetchEntriesForTask: vi.fn().mockResolvedValue([]),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  createRecurringApi: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return { id: "project-1", name: "Projeto Alpha", status: "active", tag_ids: [], ...overrides };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa",
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

/** Espelha como `TaskList.tsx`/`ProjectDetail.tsx` usam o componente: `formTab`/`form` são
 * estado do call site, `TaskFormFields` só recebe e devolve por callback. */
function Harness({
  editing = null,
  projects,
  tasks = [],
  initialForm,
}: {
  editing?: Task | null;
  projects?: Project[];
  tasks?: Task[];
  initialForm?: TaskCreateRequest;
}) {
  const [formTab, setFormTab] = useState<TaskFormTab>("geral");
  const [form, setForm] = useState<TaskCreateRequest>(initialForm ?? emptyTask());
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);

  return (
    <TaskFormFields
      formTab={formTab}
      onFormTabChange={setFormTab}
      form={form}
      setForm={setForm}
      editing={editing}
      tasks={tasks}
      tags={[]}
      onCreateTag={vi.fn()}
      recurrings={[]}
      onRecurringCreated={vi.fn()}
      dimensions={[]}
      subtasks={subtasks}
      onAddSubtask={(title) => setSubtasks((prev) => [...prev, { title }])}
      onRemoveSubtask={(_subtask, index) =>
        setSubtasks((prev) => prev.filter((_, i) => i !== index))
      }
      projects={projects}
    />
  );
}

describe("TaskFormFields", () => {
  it("renderiza as 3 abas base (Geral/Data e repetição/Organização) em modo criação, sem Registros", () => {
    render(<Harness />);

    expect(screen.getByRole("tab", { name: "Geral" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Data e repetição" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Organização" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Registros de tempo" })).not.toBeInTheDocument();
  });

  it("aba Registros só aparece quando `editing` não é nulo", () => {
    render(<Harness editing={makeTask({ id: "task-1" })} />);

    expect(screen.getByRole("tab", { name: "Registros de tempo" })).toBeInTheDocument();
  });

  it("campo Projeto só aparece quando a prop `projects` é passada (TaskList.tsx)", () => {
    render(<Harness projects={[makeProject()]} />);

    expect(screen.getByText("Projeto")).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Projeto" })).toBeInTheDocument();
  });

  it("campo Projeto não aparece quando `projects` está ausente (ProjectDetail.tsx)", () => {
    render(<Harness />);

    expect(screen.queryByText("Projeto")).not.toBeInTheDocument();
  });

  it("navegação entre abas: clicar em 'Data e repetição' mostra o seletor de recorrência, clicar em 'Organização' mostra Tags/Link externo", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByText("Esta tarefa se repete?")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Data e repetição" }));
    expect(screen.getByText("Esta tarefa se repete?")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Organização" }));
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("Link externo")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Adicionar subtarefa")).toBeInTheDocument();
  });

  it("Organização esconde o campo Subtarefas quando `editing.parent_task_id` está setado (subtarefa não tem sub-subtarefas)", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        editing={makeTask({ id: "sub-1", parent_task_id: "parent-1", due_date: "2026-08-20" })}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Organização" }));

    expect(screen.queryByPlaceholderText("Adicionar subtarefa")).not.toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
  });
});
