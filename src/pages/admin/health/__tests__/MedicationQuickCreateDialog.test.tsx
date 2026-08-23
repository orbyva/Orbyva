import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MedicationQuickCreateDialog } from "@/pages/admin/health/MedicationQuickCreateDialog";
import { createMedicationWithDoses, updateMedication } from "@/api/health/medications";
import type { Medication } from "@/types/health";

/**
 * O dialog depois da 064: o que ele cria é uma linha em `medication` (posologia, N horários,
 * período), não mais uma tarefa recorrente com um horário só como na 049. Cobre validação, o
 * payload enviado, a lista de horários (adicionar/remover, mínimo um) e o modo edição.
 */

vi.mock("@/api/health/medications", () => ({
  createMedicationWithDoses: vi.fn(),
  updateMedication: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedCreate = vi.mocked(createMedicationWithDoses);
const mockedUpdate = vi.mocked(updateMedication);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 17, 9, 0, 0));
  toastMock.mockReset();
  mockedCreate.mockReset();
  mockedUpdate.mockReset();
});

describe("MedicationQuickCreateDialog", () => {
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

  it("nome + horário criam o tratamento com início hoje e cadência diária", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({ id: "med-1" } as Medication);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <MedicationQuickCreateDialog
        open
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    const saveButton = screen.getByRole("button", { name: "Criar" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(mockedCreate).toHaveBeenCalledWith({
      name: "Losartana",
      dose_amount: null,
      dose_unit: null,
      instructions: null,
      times: ["08:00"],
      interval_days: 1,
      started_on: "2026-08-17",
      ended_on: null,
    });
    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("dois horários no mesmo tratamento — o gap que a 049 não cobria", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({ id: "med-1" } as Medication);
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    await user.click(screen.getByRole("button", { name: /Adicionar horário/ }));
    await user.type(screen.getByLabelText("Horário 2"), "20:00");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ times: ["08:00", "20:00"] })
    );
  });

  it("remover horário tira o campo, e o último não pode ser removido", async () => {
    const user = userEvent.setup();
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    // Com um horário só não há botão de remover — a medicação precisa de ao menos um.
    expect(screen.queryByRole("button", { name: /Remover horário/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: /Adicionar horário/ }));
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    await user.type(screen.getByLabelText("Horário 2"), "20:00");
    expect(screen.getAllByRole("button", { name: /Remover horário/ })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Remover horário 2" }));
    expect(screen.queryByLabelText("Horário 2")).toBeNull();
    expect(screen.queryByRole("button", { name: /Remover horário/ })).toBeNull();
  });

  it("posologia, instruções e término entram no payload", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({ id: "med-1" } as Medication);
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Amoxicilina");
    await user.type(screen.getByLabelText("Horário 1"), "09:30");
    await user.type(screen.getByLabelText(/Quantidade/), "2");
    await user.type(screen.getByLabelText(/Unidade/), "comprimidos");
    await user.type(screen.getByLabelText(/Instruções/), "em jejum");
    await user.type(screen.getByLabelText(/Término/), "2026-08-24");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Amoxicilina",
        dose_amount: 2,
        dose_unit: "comprimidos",
        instructions: "em jejum",
        ended_on: "2026-08-24",
      })
    );
  });

  it("frequência 'A cada X dias' vira interval_days", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({ id: "med-1" } as Medication);
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Antibiótico");
    await user.type(screen.getByLabelText("Horário 1"), "09:30");
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "A cada X dias" }));

    const intervalInput = screen.getByLabelText(/A cada quantos dias/);
    await user.clear(intervalInput);
    await user.type(intervalInput, "3");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ interval_days: 3 })
    );
  });

  it("erro ao criar mostra toast e não fecha o dialog", async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValue(new Error("Falhou"));
    const onOpenChange = vi.fn();
    render(
      <MedicationQuickCreateDialog open onOpenChange={onOpenChange} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Erro", description: "Falhou", variant: "destructive" })
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("MedicationQuickCreateDialog — modo edição", () => {
  const existing: Medication = {
    id: "med-1",
    name: "Losartana",
    dose_amount: 2,
    dose_unit: "comprimidos",
    instructions: "em jejum",
    // O Postgres devolve `time` com segundos; o `<input type="time">` precisa de HH:MM.
    times: ["08:00:00", "20:00:00"],
    interval_days: 3,
    started_on: "2026-08-10",
    ended_on: null,
    active: true,
  };

  it("carrega o tratamento existente nos campos, com os horários já em HH:MM", () => {
    render(
      <MedicationQuickCreateDialog
        open
        onOpenChange={() => {}}
        onCreated={() => {}}
        medication={existing}
      />
    );

    expect(screen.getByText("Editar medicação")).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome do remédio/)).toHaveValue("Losartana");
    expect(screen.getByLabelText("Horário 1")).toHaveValue("08:00");
    expect(screen.getByLabelText("Horário 2")).toHaveValue("20:00");
    expect(screen.getByLabelText(/A cada quantos dias/)).toHaveValue(3);
    expect(screen.getByLabelText(/Início/)).toHaveValue("2026-08-10");
  });

  it("salvar chama updateMedication com o id, não cria outro tratamento", async () => {
    const user = userEvent.setup();
    mockedUpdate.mockResolvedValue(undefined);
    render(
      <MedicationQuickCreateDialog
        open
        onOpenChange={() => {}}
        onCreated={() => {}}
        medication={existing}
      />
    );

    await user.clear(screen.getByLabelText(/Quantidade/));
    await user.type(screen.getByLabelText(/Quantidade/), "1");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "med-1",
        dose_amount: 1,
        times: ["08:00", "20:00"],
        interval_days: 3,
      })
    );
  });
});
