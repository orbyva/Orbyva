import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskQuickFields } from "@/pages/admin/tasks/TaskQuickFields";
import { uploadIconAsset } from "@/api/tasks";
import type { IconAsset, Task } from "@/types/tasks";

/**
 * Feature 073 — a edição rápida de ícone da Lista, do Kanban e do popover do Gantt sai toda daqui
 * (`TaskQuickFields`), então é aqui que se prova, de uma vez, o aviso de "vale para toda a
 * recorrência" numa série.
 *
 * O que a feature 086 mudou por aqui: o upload deixou de ir para `{userId}/{taskId}.{ext}` e passa
 * a ir para a biblioteca (`{userId}/library/{uuid}.{ext}`), então **nenhum** id de tarefa entra no
 * caminho do arquivo. Some com isso o motivo pelo qual a 073 tinha de passar o id da origem da
 * série — o aviso continua, o acoplamento não.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
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

/** A linha que `uploadIconAsset` devolve depois de subir o arquivo para a biblioteca. */
function asset(url: string): IconAsset {
  return { id: `icon-${url}`, name: "Ícone", url };
}

/** `TaskQuickFields` devolve nós prontos (não é um componente) — o harness só posiciona o ícone. */
function IconOnly({ task }: { task: Task }) {
  const { icon } = TaskQuickFields({ task, onIconChange: vi.fn() });
  return <>{icon}</>;
}

describe("TaskQuickFields — ícone da série (feature 073)", () => {
  it("ocorrência recorrente: avisa da série, e o upload não carrega id de tarefa nenhum", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadIconAsset).mockResolvedValue(asset("https://cdn.example.com/origem.png"));
    render(<IconOnly task={makeTask({ id: "ocorrencia-3", recurrence_origin_id: "origem" })} />);

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    expect(
      await screen.findByText("Vale para todas as ocorrências desta recorrência.")
    ).toBeInTheDocument();

    const file = new File(["conteudo"], "icone.png", { type: "image/png" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);

    // O arquivo vai para a biblioteca do usuário, não para a pasta de uma tarefa: o id da origem
    // (e o da ocorrência) deixaram de participar do caminho.
    expect(uploadIconAsset).toHaveBeenCalledWith({ file });
    expect(vi.mocked(uploadIconAsset).mock.calls[0]).not.toContain("origem");
    expect(vi.mocked(uploadIconAsset).mock.calls[0]).not.toContain("ocorrencia-3");
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

  it("tarefa avulsa: sem aviso, e o upload continua funcionando", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadIconAsset).mockResolvedValue(asset("https://cdn.example.com/task-1.png"));
    render(<IconOnly task={makeTask({ id: "task-1" })} />);

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    expect(await screen.findByRole("button", { name: "Enviar imagem" })).toBeInTheDocument();
    expect(
      screen.queryByText("Vale para todas as ocorrências desta recorrência.")
    ).not.toBeInTheDocument();

    const file = new File(["conteudo"], "icone.png", { type: "image/png" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);

    expect(uploadIconAsset).toHaveBeenCalledWith({ file });
  });
});
