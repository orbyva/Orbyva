import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MedicationQuickCreateDialog } from "@/pages/admin/tasks/MedicationQuickCreateDialog";
import { createTask } from "@/api/tasks";

vi.mock("@/api/tasks", () => ({
  createTask: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedCreateTask = vi.mocked(createTask);

describe("MedicationQuickCreateDialog", () => {
  beforeEach(() => {
    toastMock.mockReset();
    mockedCreateTask.mockReset();
  });

  it("botão Criar começa desabilitado sem nome nem horário", () => {
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );
    expect(screen.getByRole("button", { name: "Criar" })).toBeDisabled();
  });

  it("preencher só o nome mantém o botão desabilitado (falta horário)", async () => {
    const user = userEvent.setup();
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );
    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    expect(screen.getByRole("button", { name: "Criar" })).toBeDisabled();
  });

  it("nome + horário habilita o botão e salvar cria a tarefa com is_medication e recorrência diária", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue({ id: "task-1" } as never);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <MedicationQuickCreateDialog open onOpenChange={onOpenChange} onCreated={onCreated} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText(/Horário/), "08:00");
    const saveButton = screen.getByRole("button", { name: "Criar" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Losartana",
        due_time: "08:00",
        is_medication: true,
        status: "todo",
        recurrence_rule: { frequency: "daily", interval: 1, time: "08:00" },
      })
    );
    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("frequência 'A cada X dias' monta recurrence_rule com o interval informado", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue({ id: "task-1" } as never);
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Antibiótico");
    await user.type(screen.getByLabelText(/Horário/), "09:30");
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "A cada X dias" }));

    const intervalInput = screen.getByLabelText(/A cada quantos dias/);
    await user.clear(intervalInput);
    await user.type(intervalInput, "3");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence_rule: { frequency: "daily", interval: 3, time: "09:30" },
      })
    );
  });

  it("erro ao criar mostra toast e não fecha o dialog", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockRejectedValue(new Error("Falhou"));
    const onOpenChange = vi.fn();
    render(
      <MedicationQuickCreateDialog open onOpenChange={onOpenChange} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText(/Horário/), "08:00");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Erro", description: "Falhou", variant: "destructive" })
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
