import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgendaHourGrid } from "@/pages/admin/tasks/AgendaHourGrid";
import { dayKey } from "@/pages/admin/tasks/AgendaGrid";
import { groupCalendarItemsByDay } from "@/domain/tasks";
import type { Task } from "@/types/tasks";

/**
 * Feature 104 — desenhar a faixa de horário arrastando no fundo da coluna do dia (tipo Google
 * Agenda). Sem Chrome (a skill `next` proíbe verificação por navegador), é aqui que se prova que o
 * gesto existe e que a faixa que ele devolve é a que o usuário desenhou.
 *
 * jsdom não faz layout: todo `getBoundingClientRect` volta zerado. O helper `stubColumnRect` finge
 * a geometria da coluna com **1440px de altura**, o que faz 1px valer exatamente 1 minuto —
 * `clientY: 540` é 09:00, e a conta do teste fica legível sem espelhar a matemática do componente
 * (essa já está coberta em `src/domain/tasks/__tests__/agendaDrag.test.ts`).
 */

const DAY = new Date(2026, 7, 17); // segunda-feira
const DAY_KEY = dayKey(DAY);
/** Altura fingida da coluna: 1440px = 1440 min, logo 1px = 1 min. */
const COLUMN_PX = 1440;

/** Geometria fingida da coluna — sem isto o componente cairia no fallback de altura e a coluna
 * ficaria com largura 0 (o que desliga a guarda de "soltou fora da coluna"). */
function stubColumnRect(
  el: HTMLElement,
  { top = 0, left = 0, width = 200, height = COLUMN_PX } = {}
) {
  el.getBoundingClientRect = () =>
    ({
      top,
      left,
      right: left + width,
      bottom: top + height,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
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
    due_date: "2026-08-17",
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

function renderGrid({
  days = [DAY],
  tasks = [],
  onCreateInRange = vi.fn(),
  withDrag = true,
}: {
  days?: Date[];
  tasks?: Task[];
  onCreateInRange?: (range: { dayKey: string; startMinutes: number; durationMinutes: number }) => void;
  /** `false` reproduz o call site que **não** passa a prop (drill-down "Focar dia" do Gantt). */
  withDrag?: boolean;
} = {}) {
  const onOpenTask = vi.fn();
  const onOpenEvent = vi.fn();
  const onToggleQuick = vi.fn();
  const utils = render(
    <AgendaHourGrid
      days={days}
      itemsByDay={groupCalendarItemsByDay(tasks, [])}
      projectById={new Map()}
      taskById={new Map(tasks.map((t) => [t.id, t]))}
      onOpenTask={onOpenTask}
      onOpenEvent={onOpenEvent}
      onToggleQuick={onToggleQuick}
      onCreateInRange={withDrag ? onCreateInRange : undefined}
    />
  );
  const columns = new Map(
    days.map((day) => {
      const el = screen.getByTestId(`day-column-${dayKey(day)}`);
      stubColumnRect(el);
      return [dayKey(day), el];
    })
  );
  return {
    ...utils,
    columns,
    column: columns.get(DAY_KEY)!,
    onCreateInRange,
    onOpenTask,
    onOpenEvent,
    onToggleQuick,
  };
}

const POINTER = { pointerId: 1, button: 0, pointerType: "mouse", clientX: 50 };

function pointerDownAt(el: HTMLElement, clientY: number) {
  fireEvent.pointerDown(el, { ...POINTER, clientY });
}
function pointerMoveTo(el: HTMLElement, clientY: number) {
  fireEvent.pointerMove(el, { ...POINTER, clientY });
}
function pointerUpAt(el: HTMLElement, clientY: number, clientX = POINTER.clientX) {
  fireEvent.pointerUp(el, { ...POINTER, clientX, clientY });
}

/** Arrasto completo: pressiona, move (arma o gesto) e solta. */
function drag(el: HTMLElement, fromY: number, toY: number) {
  pointerDownAt(el, fromY);
  pointerMoveTo(el, toY);
  pointerUpAt(el, toY);
}

describe("AgendaHourGrid — arrastar para criar (feature 104)", () => {
  it("arrastar das 09:00 às 10:30 devolve a faixa desenhada", () => {
    const { column, onCreateInRange } = renderGrid();

    drag(column, 9 * 60, 10 * 60 + 30);

    expect(onCreateInRange).toHaveBeenCalledTimes(1);
    expect(onCreateInRange).toHaveBeenCalledWith({
      dayKey: DAY_KEY,
      startMinutes: 540,
      durationMinutes: 90,
    });
  });

  it("o fantasma mostra o horário da faixa enquanto o ponteiro se move", () => {
    const { column } = renderGrid();

    pointerDownAt(column, 9 * 60);
    // Antes de mover não há faixa nenhuma na tela — o gesto ainda pode ser um clique.
    expect(screen.queryByText("09:00 – 10:30")).not.toBeInTheDocument();

    pointerMoveTo(column, 10 * 60 + 30);
    expect(screen.getByText("09:00 – 10:30")).toBeInTheDocument();

    // E some ao soltar: quem desenha o horário depois disso é o item criado.
    pointerUpAt(column, 10 * 60 + 30);
    expect(screen.queryByText("09:00 – 10:30")).not.toBeInTheDocument();
  });

  it("clicar sem mover abre a faixa padrão de 30 min a partir do slot clicado", () => {
    const { column, onCreateInRange } = renderGrid();

    pointerDownAt(column, 9 * 60);
    pointerUpAt(column, 9 * 60);

    expect(onCreateInRange).toHaveBeenCalledWith({
      dayKey: DAY_KEY,
      startMinutes: 540,
      durationMinutes: 30,
    });
  });

  it("arrasto invertido (de baixo para cima) devolve a faixa normalizada", () => {
    const { column, onCreateInRange } = renderGrid();

    // Das 11:00 para as 09:00: quem faz isso quer 09:00–11:00, não um erro.
    drag(column, 11 * 60, 9 * 60);

    expect(onCreateInRange).toHaveBeenCalledWith({
      dayKey: DAY_KEY,
      startMinutes: 540,
      durationMinutes: 120,
    });
  });

  it("movimento abaixo do limiar conta como clique, não como faixa de 15 min", () => {
    const { column, onCreateInRange } = renderGrid();

    pointerDownAt(column, 9 * 60);
    // 2px de tremor de mouse: abaixo de DRAG_THRESHOLD_PX (4px).
    pointerMoveTo(column, 9 * 60 + 2);
    expect(screen.queryByText(/^09:00 – /)).not.toBeInTheDocument();

    pointerUpAt(column, 9 * 60 + 2);
    expect(onCreateInRange).toHaveBeenCalledWith({
      dayKey: DAY_KEY,
      startMinutes: 540,
      durationMinutes: 30,
    });
  });

  it("toque não arrasta (a grade continua rolando) — vale como o clique de 30 min", () => {
    const { column, onCreateInRange } = renderGrid();
    const touch = { ...POINTER, pointerType: "touch" };

    fireEvent.pointerDown(column, { ...touch, clientY: 9 * 60 });
    fireEvent.pointerMove(column, { ...touch, clientY: 10 * 60 + 30 });
    // Nenhum fantasma: o gesto não virou seleção, então o `overflow-y-auto` segue rolando.
    expect(screen.queryByText("09:00 – 10:30")).not.toBeInTheDocument();

    fireEvent.pointerUp(column, { ...touch, clientY: 10 * 60 + 30 });
    expect(onCreateInRange).toHaveBeenCalledWith({
      dayKey: DAY_KEY,
      startMinutes: 540,
      durationMinutes: 30,
    });
  });
});

describe("AgendaHourGrid — cancelar o arrasto (feature 104)", () => {
  it("Escape no meio do arrasto some com o fantasma e não cria nada", () => {
    const { column, onCreateInRange } = renderGrid();

    pointerDownAt(column, 9 * 60);
    pointerMoveTo(column, 11 * 60);
    expect(screen.getByText("09:00 – 11:00")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByText("09:00 – 11:00")).not.toBeInTheDocument();
    // E o `pointerup` que vem depois encontra o estado limpo: nada é criado.
    pointerUpAt(column, 11 * 60);
    expect(onCreateInRange).not.toHaveBeenCalled();
  });

  it("pointercancel (rolagem por toque, ponteiro perdido) cancela do mesmo jeito", () => {
    const { column, onCreateInRange } = renderGrid();

    pointerDownAt(column, 9 * 60);
    pointerMoveTo(column, 11 * 60);
    fireEvent.pointerCancel(column, POINTER);

    expect(screen.queryByText("09:00 – 11:00")).not.toBeInTheDocument();
    pointerUpAt(column, 11 * 60);
    expect(onCreateInRange).not.toHaveBeenCalled();
  });

  it("soltar fora da coluna (para o lado) cancela em vez de criar em horário adivinhado", () => {
    const { column, onCreateInRange } = renderGrid();

    pointerDownAt(column, 9 * 60);
    pointerMoveTo(column, 10 * 60);
    // A coluna fingida vai de x=0 a x=200; soltar em 500 é fora dela.
    pointerUpAt(column, 10 * 60, 500);

    expect(onCreateInRange).not.toHaveBeenCalled();
    expect(screen.queryByText("09:00 – 10:00")).not.toBeInTheDocument();
  });

  it("soltar numa coluna que não é a do início não cria nada e limpa o fantasma", () => {
    const week = [DAY, new Date(2026, 7, 18)];
    const { columns, onCreateInRange } = renderGrid({ days: week });
    const segunda = columns.get(DAY_KEY)!;
    const terca = columns.get(dayKey(week[1]))!;

    pointerDownAt(segunda, 9 * 60);
    pointerMoveTo(segunda, 10 * 60);
    pointerUpAt(terca, 10 * 60);

    expect(onCreateInRange).not.toHaveBeenCalled();
    expect(screen.queryByText("09:00 – 10:00")).not.toBeInTheDocument();
  });
});

describe("AgendaHourGrid — o gesto não vale por cima de um item existente (feature 104)", () => {
  it("pressionar um bloco com horário abre o item e não desenha faixa nenhuma", async () => {
    const user = userEvent.setup();
    const reuniao = makeTask({ due_time: "10:00", estimated_duration: 60, title: "Reunião" });
    const { onCreateInRange, onOpenTask } = renderGrid({ tasks: [reuniao] });

    // Arrastar em cima de uma reunião é tentar mexer nela, não criar outra.
    await user.click(screen.getByRole("button", { name: /Reunião/ }));

    expect(onOpenTask).toHaveBeenCalledWith(reuniao);
    expect(onCreateInRange).not.toHaveBeenCalled();
  });

  it("pressionar uma bolinha de tarefa pontual conclui, sem virar faixa", async () => {
    const user = userEvent.setup();
    const dose = makeTask({ id: "q1", due_time: "08:00", title: "Losartana", is_quick: true });
    const { onCreateInRange, onToggleQuick } = renderGrid({ tasks: [dose] });

    await user.click(screen.getByRole("button", { name: "Concluir «Losartana» às 08:00" }));

    expect(onToggleQuick).toHaveBeenCalledWith(dose);
    expect(onCreateInRange).not.toHaveBeenCalled();
  });
});

describe("AgendaHourGrid — sem a prop onCreateInRange o gesto não existe", () => {
  it("arrastar não desenha faixa nem chama nada (não-regressão do «Focar dia» do Gantt)", () => {
    const { column, onCreateInRange } = renderGrid({ withDrag: false });

    pointerDownAt(column, 9 * 60);
    pointerMoveTo(column, 10 * 60 + 30);
    expect(screen.queryByText("09:00 – 10:30")).not.toBeInTheDocument();

    pointerUpAt(column, 10 * 60 + 30);
    expect(onCreateInRange).not.toHaveBeenCalled();
    // E a coluna nem anuncia que é um canvas de seleção.
    expect(column.className).not.toContain("cursor-cell");
  });
});
