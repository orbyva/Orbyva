import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsultationQuickCreateDialog } from "@/pages/admin/tasks/ConsultationQuickCreateDialog";
import { createTask, updateTask } from "@/api/tasks";
import type { Task } from "@/types/tasks";

/**
 * Atalho de agendamento de consulta (feature 061). Substitui a verificação manual no navegador
 * (proibida pela skill `next`): o que importa aqui é o payload que chega em `createTask` —
 * especialista no `title`, local/preparo na `description`, `is_consultation: true` e a
 * `recurrence_rule` mensal só quando o usuário pede repetição.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedCreateTask = vi.mocked(createTask);
const mockedUpdateTask = vi.mocked(updateTask);

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

/** Abre o `<Select>` de Repetição e escolhe uma das três opções. */
async function pickRepeat(user: ReturnType<typeof userEvent.setup>, option: string) {
  await user.click(screen.getByRole("combobox", { name: "Repetição" }));
  await user.click(screen.getByRole("option", { name: option }));
}

describe("ConsultationQuickCreateDialog", () => {
  beforeEach(() => {
    toastMock.mockReset();
    mockedCreateTask.mockReset();
    mockedUpdateTask.mockReset();
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

  it("repetição semanal troca o rótulo do intervalo e monta uma regra weekly", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue({ id: "task-1" } as never);
    renderDialog();

    await user.type(screen.getByLabelText(/Especialidade/), "Fisioterapeuta");
    await user.type(screen.getByLabelText(/^Data/), "2026-09-10");
    await user.type(screen.getByLabelText(/Horário/), "08:00");
    await pickRepeat(user, "Repetir a cada X semanas");

    // O campo de intervalo passa a falar em semanas — um rótulo fixo em meses mentiria aqui.
    expect(screen.getByLabelText(/A cada quantas semanas/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/A cada quantos meses/)).toBeNull();

    const intervalInput = screen.getByLabelText(/A cada quantas semanas/);
    await user.clear(intervalInput);
    await user.type(intervalInput, "2");
    await user.click(screen.getByRole("button", { name: "Agendar" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        is_consultation: true,
        recurrence_rule: { frequency: "weekly", interval: 2, time: "08:00" },
      })
    );
  });

  it("dias da semana marcados viram `weekdays` ordenado — uma série só, não uma por dia", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue({ id: "task-1" } as never);
    renderDialog();

    await user.type(screen.getByLabelText(/Especialidade/), "Fisioterapeuta");
    await user.type(screen.getByLabelText(/^Data/), "2026-09-10");

    // A linha de dias só existe na repetição semanal.
    expect(screen.queryByRole("group", { name: "Dias da semana" })).toBeNull();
    await pickRepeat(user, "Repetir a cada X semanas");
    const weekdayRow = screen.getByRole("group", { name: "Dias da semana" });
    expect(within(weekdayRow).getAllByRole("button")).toHaveLength(7);
    expect(
      screen.getByText("Nenhum dia marcado repete no mesmo dia da semana do prazo, a cada intervalo.")
    ).toBeInTheDocument();

    // Marca fora de ordem (quinta antes de terça) para provar a ordenação no payload.
    const quinta = within(weekdayRow).getByRole("button", { name: "quinta-feira" });
    const terca = within(weekdayRow).getByRole("button", { name: "terça-feira" });
    await user.click(quinta);
    await user.click(terca);
    expect(quinta).toHaveAttribute("aria-pressed", "true");
    expect(terca).toHaveAttribute("aria-pressed", "true");
    expect(within(weekdayRow).getByRole("button", { name: "domingo" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    await user.click(screen.getByRole("button", { name: "Agendar" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence_rule: { frequency: "weekly", interval: 1, time: null, weekdays: [2, 4] },
      })
    );
  });

  it("“Termina em” vira `until` na regra — vale também para a repetição mensal", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue({ id: "task-1" } as never);
    renderDialog();

    await user.type(screen.getByLabelText(/Especialidade/), "Endocrinologista");
    await user.type(screen.getByLabelText(/^Data/), "2026-09-10");

    // Consulta única não tem término nenhum a oferecer.
    expect(screen.queryByLabelText(/Termina em/)).toBeNull();

    await pickRepeat(user, "Repetir a cada X meses");
    await user.type(screen.getByLabelText(/Termina em/), "2027-03-10");
    await user.click(screen.getByRole("button", { name: "Agendar" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence_rule: {
          frequency: "monthly",
          interval: 6,
          time: null,
          until: "2027-03-10",
        },
      })
    );
  });

  it("semanal completa: dias + término na mesma regra, e intervalo inválido vira 1", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue({ id: "task-1" } as never);
    renderDialog();

    await user.type(screen.getByLabelText(/Especialidade/), "Fisioterapeuta");
    await user.type(screen.getByLabelText(/^Data/), "2026-09-07");
    await user.type(screen.getByLabelText(/Horário/), "07:30");
    await pickRepeat(user, "Repetir a cada X semanas");

    const weekdayRow = screen.getByRole("group", { name: "Dias da semana" });
    for (const dia of ["segunda-feira", "quarta-feira", "sexta-feira"]) {
      await user.click(within(weekdayRow).getByRole("button", { name: dia }));
    }
    // Zero não é intervalo: `computeMissingOccurrences` devolve [] com `interval <= 0`, o que
    // criaria uma série que nunca gera ocorrência.
    const intervalInput = screen.getByLabelText(/A cada quantas semanas/);
    await user.clear(intervalInput);
    await user.type(intervalInput, "0");
    await user.type(screen.getByLabelText(/Termina em/), "2026-12-18");
    await user.click(screen.getByRole("button", { name: "Agendar" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Fisioterapeuta",
        due_date: "2026-09-07",
        is_consultation: true,
        recurrence_rule: {
          frequency: "weekly",
          interval: 1,
          time: "07:30",
          weekdays: [1, 3, 5],
          until: "2026-12-18",
        },
      })
    );
  });

  it("término anterior à data da consulta é barrado, com alerta, sem chamar createTask", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/Especialidade/), "Ortopedista");
    await user.type(screen.getByLabelText(/^Data/), "2026-09-10");
    await pickRepeat(user, "Repetir a cada X semanas");
    await user.type(screen.getByLabelText(/Termina em/), "2026-09-03");
    await user.click(screen.getByRole("button", { name: "Agendar" }));

    // Uma série que termina antes de começar não geraria ocorrência nenhuma — pior que um erro.
    expect(mockedCreateTask).not.toHaveBeenCalled();
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("O término precisa ser igual ou posterior à data da consulta.");
    expect(screen.getByLabelText(/Termina em/)).toHaveAttribute("aria-invalid", "true");

    // Corrigir a data libera o agendamento.
    mockedCreateTask.mockResolvedValue({ id: "task-1" } as never);
    await user.clear(screen.getByLabelText(/Termina em/));
    await user.type(screen.getByLabelText(/Termina em/), "2026-12-10");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Agendar" }));
    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence_rule: expect.objectContaining({ frequency: "weekly", until: "2026-12-10" }),
      })
    );
  });

  it("voltar de semanal para consulta única limpa dias e término", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue({ id: "task-1" } as never);
    renderDialog();

    await user.type(screen.getByLabelText(/Especialidade/), "Psicólogo");
    await user.type(screen.getByLabelText(/^Data/), "2026-09-10");
    await pickRepeat(user, "Repetir a cada X semanas");
    await user.click(
      within(screen.getByRole("group", { name: "Dias da semana" })).getByRole("button", {
        name: "terça-feira",
      })
    );
    await user.type(screen.getByLabelText(/Termina em/), "2026-12-10");

    await pickRepeat(user, "Consulta única");
    await user.click(screen.getByRole("button", { name: "Agendar" }));
    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ recurrence_rule: null })
    );

    // E nada do que foi marcado volta ao ligar a repetição de novo.
    await pickRepeat(user, "Repetir a cada X semanas");
    const weekdayRow = screen.getByRole("group", { name: "Dias da semana" });
    for (const botao of within(weekdayRow).getAllByRole("button")) {
      expect(botao).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.getByLabelText(/Termina em/)).toHaveValue("");
  });

  it("depois de agendar, o formulário volta ao padrão (única, sem dias, sem término)", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue({ id: "task-1" } as never);
    renderDialog();

    await user.type(screen.getByLabelText(/Especialidade/), "Fisioterapeuta");
    await user.type(screen.getByLabelText(/^Data/), "2026-09-10");
    await pickRepeat(user, "Repetir a cada X semanas");
    await user.click(
      within(screen.getByRole("group", { name: "Dias da semana" })).getByRole("button", {
        name: "sexta-feira",
      })
    );
    await user.type(screen.getByLabelText(/Termina em/), "2026-12-10");
    await user.click(screen.getByRole("button", { name: "Agendar" }));

    expect(screen.getByLabelText(/Especialidade/)).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Repetição" })).toHaveTextContent("Consulta única");
    expect(screen.queryByRole("group", { name: "Dias da semana" })).toBeNull();
    expect(screen.queryByLabelText(/Termina em/)).toBeNull();
    // Botão trancado de novo: sem especialidade e sem data não há o que agendar.
    expect(screen.getByRole("button", { name: "Agendar" })).toBeDisabled();
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

  it("editar esta ocorrência preenche o formulário, esconde repetição e chama updateTask", async () => {
    const user = userEvent.setup();
    mockedUpdateTask.mockResolvedValue(undefined as never);
    const onCreated = vi.fn();
    const task = {
      id: "c1",
      project_id: null,
      parent_task_id: null,
      recurrence_origin_id: null,
      title: "tesste — Dr Teste",
      description: "Clínica Vida",
      status: "todo",
      tag_ids: [],
      due_date: "2026-08-16",
      due_time: "11:06:00",
      recurrence_rule: null,
      linked_recurring_id: null,
      linked_installment_number: null,
      is_consultation: true,
    } as Task;

    renderDialog({ task, onCreated });

    expect(screen.getByRole("heading", { name: "Editar consulta" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Especialidade/)).toHaveValue("tesste");
    expect(screen.getByLabelText(/Profissional/)).toHaveValue("Dr Teste");
    expect(screen.getByLabelText(/^Data/)).toHaveValue("2026-08-16");
    expect(screen.getByLabelText(/Horário/)).toHaveValue("11:06");
    expect(screen.getByLabelText(/Local e preparo/)).toHaveValue("Clínica Vida");
    expect(screen.queryByRole("combobox", { name: "Repetição" })).toBeNull();

    await user.clear(screen.getByLabelText(/Especialidade/));
    await user.type(screen.getByLabelText(/Especialidade/), "Cardiologista");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(mockedCreateTask).not.toHaveBeenCalled();
    expect(mockedUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "c1",
        title: "Cardiologista — Dr Teste",
        description: "Clínica Vida",
        due_date: "2026-08-16",
        due_time: "11:06",
      })
    );
    expect(onCreated).toHaveBeenCalled();
  });
});
