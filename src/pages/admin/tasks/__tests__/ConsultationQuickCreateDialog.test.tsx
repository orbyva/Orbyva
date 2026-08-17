import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsultationQuickCreateDialog } from "@/pages/admin/tasks/ConsultationQuickCreateDialog";
import { createTask } from "@/api/tasks";

/**
 * Atalho de agendamento de consulta (feature 061). Substitui a verificação manual no navegador
 * (proibida pela skill `next`): o que importa aqui é o payload que chega em `createTask` —
 * especialista no `title`, local/preparo na `description`, `is_consultation: true` e a
 * `recurrence_rule` mensal só quando o usuário pede repetição.
 */

vi.mock("@/api/tasks", () => ({
  createTask: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedCreateTask = vi.mocked(createTask);

function renderDialog(props: Partial<Parameters<typeof ConsultationQuickCreateDialog>[0]> = {}) {
  return render(
    <ConsultationQuickCreateDialog
      open
      onOpenChange={() => {}}
      onCreated={() => {}}
      {...props}
    />
  );
}

describe("ConsultationQuickCreateDialog", () => {
  beforeEach(() => {
    toastMock.mockReset();
    mockedCreateTask.mockReset();
  });

  it("botão Agendar começa desabilitado e só habilita com especialidade + data", async () => {
    const user = userEvent.setup();
    renderDialog();
    const saveButton = screen.getByRole("button", { name: "Agendar" });
    expect(saveButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Especialidade/), "Cardiologista");
    expect(saveButton).toBeDisabled();

    await user.type(screen.getByLabelText(/^Data/), "2026-09-10");
    expect(saveButton).toBeEnabled();
  });

  it("consulta única: especialista no título, local/preparo na descrição, sem recorrência", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue({ id: "task-1" } as never);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onCreated, onOpenChange });

    await user.type(screen.getByLabelText(/Especialidade/), "Cardiologista");
    await user.type(screen.getByLabelText(/Profissional/), "Dr. Silva");
    await user.type(screen.getByLabelText(/^Data/), "2026-09-10");
    await user.type(screen.getByLabelText(/Horário/), "14:30");
    await user.type(screen.getByLabelText(/Local e preparo/), "Clínica Vida, sala 302 — jejum de 8h");
    await user.click(screen.getByRole("button", { name: "Agendar" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Cardiologista — Dr. Silva",
        description: "Clínica Vida, sala 302 — jejum de 8h",
        due_date: "2026-09-10",
        due_time: "14:30",
        status: "todo",
        is_consultation: true,
        recurrence_rule: null,
      })
    );
    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sem profissional, o título fica só com a especialidade", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue({ id: "task-1" } as never);
    renderDialog();

    await user.type(screen.getByLabelText(/Especialidade/), "Dermatologista");
    await user.type(screen.getByLabelText(/^Data/), "2026-09-10");
    await user.click(screen.getByRole("button", { name: "Agendar" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Dermatologista", description: null })
    );
  });

  it("repetição mensal monta recurrence_rule com o intervalo em meses e o horário", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue({ id: "task-1" } as never);
    renderDialog();

    await user.type(screen.getByLabelText(/Especialidade/), "Endocrinologista");
    await user.type(screen.getByLabelText(/^Data/), "2026-09-10");
    await user.type(screen.getByLabelText(/Horário/), "08:00");
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Repetir a cada X meses" }));

    const intervalInput = screen.getByLabelText(/A cada quantos meses/);
    await user.clear(intervalInput);
    await user.type(intervalInput, "3");
    await user.click(screen.getByRole("button", { name: "Agendar" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        is_consultation: true,
        recurrence_rule: { frequency: "monthly", interval: 3, time: "08:00" },
      })
    );
  });

  it("erro ao agendar mostra toast e não fecha o dialog", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockRejectedValue(new Error("Falhou"));
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.type(screen.getByLabelText(/Especialidade/), "Cardiologista");
    await user.type(screen.getByLabelText(/^Data/), "2026-09-10");
    await user.click(screen.getByRole("button", { name: "Agendar" }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Erro", description: "Falhou", variant: "destructive" })
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
