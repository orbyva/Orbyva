import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskRecurrenceDialog } from "@/pages/admin/tasks/TaskRecurrenceDialog";
import {
  useTaskRecurrenceEditor,
  type TaskRecurrenceValue,
} from "@/pages/admin/tasks/useTaskRecurrenceEditor";
import type { Recurring } from "@/types/recurring";

/**
 * Feature 080 — a configuração de repetição saiu da aba "Data e repetição" para um modal próprio.
 * O que precisa continuar valendo: o modal abre já refletindo o estado atual, cada mudança propaga
 * para o formulário na hora (não há "Salvar" próprio), fechar não é cancelar, e escolher "Não"
 * limpa os dois vínculos de repetição.
 */

vi.mock("@/api/recurring", () => ({
  createRecurringApi: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const RECURRINGS = [
  { id: "rec-1", description: "Aluguel" } as unknown as Recurring,
];

function Harness({ initial }: { initial: TaskRecurrenceValue }) {
  const [value, setValue] = useState<TaskRecurrenceValue>(initial);
  const [open, setOpen] = useState(true);
  const editor = useTaskRecurrenceEditor({
    value,
    onChange: (next) => setValue((prev) => ({ ...prev, ...next })),
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir repetição
      </button>
      <pre data-testid="value">{JSON.stringify(value)}</pre>
      <TaskRecurrenceDialog
        open={open}
        onOpenChange={setOpen}
        value={value}
        editor={editor}
        recurrings={RECURRINGS}
        dimensions={[]}
        onRecurringCreated={vi.fn()}
        onChange={(next) => setValue((prev) => ({ ...prev, ...next }))}
      />
    </>
  );
}

function currentValue(): TaskRecurrenceValue {
  return JSON.parse(screen.getByTestId("value").textContent as string);
}

describe("TaskRecurrenceDialog", () => {
  it("abre com o estado atual: modo, intervalo, frequência e dias da semana já preenchidos", () => {
    render(
      <Harness
        initial={{
          due_date: "2026-08-20",
          due_time: null,
          recurrence_rule: {
            frequency: "weekly",
            interval: 2,
            weekdays: [1, 3],
            time: null,
          },
          linked_recurring_id: null,
        }}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Repetir a cada")).toHaveValue(2);
    expect(screen.getByRole("combobox", { name: "Frequência" })).toHaveTextContent("semana(s)");
    // Dias da semana só aparecem em frequência semanal, e vêm da regra atual.
    expect(screen.getByText("Dias da semana")).toBeInTheDocument();
  });

  it("mudar a frequência propaga a nova regra para o formulário na hora", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          due_date: "2026-08-20",
          due_time: null,
          recurrence_rule: { frequency: "daily", interval: 1, time: null },
          linked_recurring_id: null,
        }}
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Frequência" }));
    await user.click(screen.getByRole("option", { name: "mês(es)" }));

    expect(currentValue().recurrence_rule?.frequency).toBe("monthly");
  });

  it("mudar o intervalo propaga a nova regra", () => {
    render(
      <Harness
        initial={{
          due_date: "2026-08-20",
          due_time: null,
          recurrence_rule: { frequency: "daily", interval: 1, time: null },
          linked_recurring_id: null,
        }}
      />
    );

    // `<input type="number">` não suporta as APIs de seleção que o `user.type` usa para
    // substituir o conteúdo, então a mudança vai direto pelo evento.
    fireEvent.change(screen.getByLabelText("Repetir a cada"), { target: { value: "3" } });

    expect(currentValue().recurrence_rule?.interval).toBe(3);
  });

  it("fechar sem mexer não altera nada, e reabrir mostra o mesmo estado", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          due_date: "2026-08-20",
          due_time: null,
          recurrence_rule: {
            frequency: "weekly",
            interval: 2,
            weekdays: [1, 3],
            time: null,
          },
          linked_recurring_id: null,
        }}
      />
    );

    const before = screen.getByTestId("value").textContent;
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("value").textContent).toBe(before);

    await user.click(screen.getByRole("button", { name: "Abrir repetição" }));
    expect(screen.getByLabelText("Repetir a cada")).toHaveValue(2);
  });

  it("escolher 'Não' limpa `recurrence_rule` e `linked_recurring_id`", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          due_date: "2026-08-20",
          due_time: null,
          recurrence_rule: { frequency: "daily", interval: 1, time: null },
          linked_recurring_id: null,
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Não" }));

    expect(currentValue().recurrence_rule).toBeNull();
    expect(currentValue().linked_recurring_id).toBeNull();
    // O prazo não é da recorrência: ele fica.
    expect(currentValue().due_date).toBe("2026-08-20");
  });

  it("'Não' também desfaz um vínculo com Recorrência Financeira", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          due_date: null,
          due_time: null,
          recurrence_rule: null,
          linked_recurring_id: "rec-1",
        }}
      />
    );

    // Abre no modo vinculado, mostrando a recorrência escolhida.
    expect(screen.getByRole("combobox", { name: "Recorrência Financeira" })).toHaveTextContent(
      "Aluguel"
    );

    await user.click(screen.getByRole("button", { name: "Não" }));

    expect(currentValue().linked_recurring_id).toBeNull();
    expect(currentValue().recurrence_rule).toBeNull();
  });

  it("sem prazo, o modo simples explica que falta a data em vez de mostrar a configuração", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          due_date: null,
          due_time: null,
          recurrence_rule: null,
          linked_recurring_id: null,
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Recorrência simples" }));

    expect(screen.getByText("Defina um prazo para poder repetir.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Repetir a cada")).not.toBeInTheDocument();
  });
});
