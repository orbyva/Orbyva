import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskQuickFields } from "@/pages/admin/tasks/TaskQuickFields";
import { uploadTaskIcon } from "@/api/tasks";
import type { Task } from "@/types/tasks";

/**
 * Feature 073 — a edição rápida de ícone da Lista, do Kanban e do popover do Gantt sai toda daqui
 * (`TaskQuickFields`), então é aqui que se prova, de uma vez, que numa série o picker recebe o id
 * da **origem** (o upload vai pro caminho dela) e o aviso de "vale para toda a recorrência".
 */

vi.mock("@/api/tasks", () => ({
  uploadTaskIcon: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

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

/** `TaskQuickFields` devolve nós prontos (não é um componente) — o harness só posiciona o ícone. */
function IconOnly({ task }: { task: Task }) {
  const { icon } = TaskQuickFields({ task, onIconChange: vi.fn() });
  return <>{icon}</>;
}

describe("TaskQuickFields — ícone da série (feature 073)", () => {
  it("ocorrência recorrente: avisa da série e o upload vai pro id da origem", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadTaskIcon).mockResolvedValue("https://cdn.example.com/origem.png");
    render(<IconOnly task={makeTask({ id: "ocorrencia-3", recurrence_origin_id: "origem" })} />);

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    expect(
      await screen.findByText("Vale para todas as ocorrências desta recorrência.")
    ).toBeInTheDocument();

    const file = new File(["conteudo"], "icone.png", { type: "image/png" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);

    expect(uploadTaskIcon).toHaveBeenCalledWith("origem", file);
    expect(uploadTaskIcon).not.toHaveBeenCalledWith("ocorrencia-3", file);
  });

  it("origem da série: o aviso também aparece (editar ali muda todas as ocorrências)", async () => {
    const user = userEvent.setup();
    render(
      <IconOnly
        task={makeTask({ id: "origem", recurrence_rule: { frequency: "weekly", interval: 1 } })}
      />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    expect(
      await screen.findByText("Vale para todas as ocorrências desta recorrência.")
    ).toBeInTheDocument();
  });

  it("parcela vinculada à Recorrência Financeira também é série", async () => {
    const user = userEvent.setup();
    render(
      <IconOnly
        task={makeTask({
          id: "parcela-2",
          recurrence_origin_id: "template",
          linked_recurring_id: "rec-1",
          linked_installment_number: 2,
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    expect(
      await screen.findByText("Vale para todas as ocorrências desta recorrência.")
    ).toBeInTheDocument();
  });

  it("tarefa avulsa: sem aviso, e o upload usa o id dela mesma", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadTaskIcon).mockResolvedValue("https://cdn.example.com/task-1.png");
    render(<IconOnly task={makeTask({ id: "task-1" })} />);

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    expect(await screen.findByRole("button", { name: "Enviar imagem" })).toBeInTheDocument();
    expect(
      screen.queryByText("Vale para todas as ocorrências desta recorrência.")
    ).not.toBeInTheDocument();

    const file = new File(["conteudo"], "icone.png", { type: "image/png" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);

    expect(uploadTaskIcon).toHaveBeenCalledWith("task-1", file);
  });
});
