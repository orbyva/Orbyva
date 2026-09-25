import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isSameDay } from "date-fns";
import { AgendaHourGrid } from "@/pages/admin/tasks/AgendaHourGrid";
import { dayKey } from "@/pages/admin/tasks/AgendaGrid";
import { groupCalendarItemsByDay, layoutTimedItems } from "@/domain/tasks";
import type { Project, ProjectEvent, Task } from "@/types/tasks";

/**
 * Cobre a feature 034 (grade de horas nas visões Semana/Dia) no nível de componente —
 * substitui o item "Teste manual" original (bloqueado pela skill `next`, que proíbe verificação
 * via Chrome/browser automation e exige cobertura automatizada de comportamento real).
 *
 * A matemática de posicionamento (top/height/overlap) já está coberta em
 * `src/domain/tasks/__tests__/calendar.test.ts`; aqui provamos que `AgendaHourGrid` de fato usa
 * `groupCalendarItemsByDay`/`layoutTimedItems`/`splitTimedItems` e renderiza o resultado: grade
 * 00–23, itens posicionados no lugar certo, colunas lado a lado em overlap, faixa "Sem horário",
 * e clique abrindo o dialog certo.
 */

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

function makeEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: "event-1",
    project_id: "project-1",
    task_id: null,
    title: "Evento",
    starts_at: new Date(2026, 7, 17, 10, 0).toISOString(),
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Projeto X",
    status: "active",
    tag_ids: [],
    color: "#ff0000",
    ...overrides,
  };
}

const DAY = new Date(2026, 7, 17); // segunda-feira

function renderGrid({
  days = [DAY],
  tasks = [],
  events = [],
  projects = [],
  allTasks,
  onOpenTask = vi.fn(),
  onOpenEvent = vi.fn(),
  onCreateAt,
  onToggleTaskDone,
}: {
  days?: Date[];
  tasks?: Task[];
  events?: ProjectEvent[];
  projects?: Project[];
  /** Universo completo de tarefas pra resolver tarefa-mãe (feature 048) — quando omitido, usa
   * `tasks` (comportamento suficiente pra quase todos os testes, que não dependem de resolver o
   * título do pai). */
  allTasks?: Task[];
  onOpenTask?: (task: Task) => void;
  onOpenEvent?: (event: ProjectEvent) => void;
  /** Feature 067 — quando omitido, a grade continua só leitura (sem alvos de criação). */
  onCreateAt?: (day: Date, hour: number) => void;
  /** Feature 072 — quando omitido, as bolinhas pontuais ficam só de leitura (caso do Gantt). */
  onToggleTaskDone?: (task: Task) => void;
} = {}) {
  const itemsByDay = groupCalendarItemsByDay(tasks, events);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const taskById = new Map((allTasks ?? tasks).map((t) => [t.id, t]));
  const utils = render(
    <AgendaHourGrid
      days={days}
      itemsByDay={itemsByDay}
      projectById={projectById}
      taskById={taskById}
      onOpenTask={onOpenTask}
      onOpenEvent={onOpenEvent}
      onCreateAt={onCreateAt}
      onToggleTaskDone={onToggleTaskDone}
    />
  );
  return { ...utils, onOpenTask, onOpenEvent, onCreateAt, onToggleTaskDone };
}

/** Encontra o `div` posicionado de forma absoluta (top/height/left/width) que embrulha o bloco
 * do item — o botão em si não carrega o estilo de posição, o wrapper direto carrega. */
function absoluteWrapperOf(el: HTMLElement): HTMLElement {
  const wrapper = el.closest('div[style*="top"]') as HTMLElement | null;
  if (!wrapper) throw new Error("wrapper posicionado não encontrado");
  return wrapper;
}

describe("AgendaHourGrid — grade de 00 a 23 horas", () => {
  it("renderiza os 24 rótulos de hora (00:00 a 23:00) mesmo com o dia vazio", () => {
    renderGrid({ days: [DAY], tasks: [], events: [] });

    const hourLabels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
    for (const label of hourLabels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Nenhum item nesse dia -> nenhum outro texto de hora "solto" além dos 24 rótulos da coluna.
    expect(screen.getAllByText(/^\d{2}:00$/)).toHaveLength(24);
  });

  it("renderiza uma coluna por dia (visão semana com 7 dias)", () => {
    const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 16 + i));
    renderGrid({ days: week, tasks: [], events: [] });

    // Cabeçalho de dia mostra o número do dia (16..22) — um badge redondo por coluna.
    for (let d = 16; d <= 22; d++) {
      expect(screen.getByText(String(d))).toBeInTheDocument();
    }
  });
});

describe("AgendaHourGrid — posicionamento de itens com horário", () => {
  it("posiciona uma tarefa com due_time + estimated_duration proporcionalmente (top/height batendo com o helper de domínio)", () => {
    const task = makeTask({ due_time: "09:00", estimated_duration: 90, title: "Reunião" });
    renderGrid({ tasks: [task] });

    const { timed } = layoutTimedItems(groupCalendarItemsByDay([task], []).get(dayKey(DAY)) ?? []);
    const expected = timed[0];

    const button = screen.getByRole("button", { name: /Reunião/ });
    const wrapper = absoluteWrapperOf(button);
    expect(wrapper.style.top).toBe(`${expected.topPercent}%`);
    expect(wrapper.style.height).toBe(`${expected.heightPercent}%`);
    // "09:00" aparece dentro do próprio bloco (horário da tarefa) além do rótulo de hora da
    // coluna à esquerda — escopo a busca ao botão pra não colidir com o rótulo da grade.
    expect(within(button).getByText("09:00")).toBeInTheDocument();
  });

  it("usa a duração padrão (30min) quando a tarefa não tem estimated_duration", () => {
    const task = makeTask({ due_time: "14:00", estimated_duration: null, title: "Sem duração" });
    renderGrid({ tasks: [task] });

    const { timed } = layoutTimedItems(groupCalendarItemsByDay([task], []).get(dayKey(DAY)) ?? []);
    const expected = timed[0];

    const wrapper = absoluteWrapperOf(screen.getByRole("button", { name: /Sem duração/ }));
    expect(wrapper.style.height).toBe(`${expected.heightPercent}%`);
    // 30min de 1440min do dia.
    expect(expected.heightPercent).toBeCloseTo((30 / 1440) * 100);
  });

  it("posiciona um evento usando ends_at quando presente", () => {
    const event = makeEvent({
      title: "Evento com fim",
      starts_at: new Date(2026, 7, 17, 8, 0).toISOString(),
      ends_at: new Date(2026, 7, 17, 9, 30).toISOString(),
    });
    renderGrid({ events: [event] });

    const { timed } = layoutTimedItems(groupCalendarItemsByDay([], [event]).get(dayKey(DAY)) ?? []);
    const expected = timed[0];

    const wrapper = absoluteWrapperOf(screen.getByRole("button", { name: /Evento com fim/ }));
    expect(wrapper.style.top).toBe(`${expected.topPercent}%`);
    expect(wrapper.style.height).toBe(`${expected.heightPercent}%`);
  });

  it("usa a duração padrão (30min) quando o evento não tem ends_at", () => {
    const event = makeEvent({ title: "Evento sem fim", starts_at: new Date(2026, 7, 17, 11, 0).toISOString() });
    renderGrid({ events: [event] });

    const { timed } = layoutTimedItems(groupCalendarItemsByDay([], [event]).get(dayKey(DAY)) ?? []);
    const expected = timed[0];

    const wrapper = absoluteWrapperOf(screen.getByRole("button", { name: /Evento sem fim/ }));
    expect(wrapper.style.height).toBe(`${expected.heightPercent}%`);
    expect(expected.heightPercent).toBeCloseTo((30 / 1440) * 100);
  });
});

describe("AgendaHourGrid — sobreposição (colunas lado a lado)", () => {
  it("dois itens com horários cruzados dividem a largura da coluna (left/width batendo com layoutTimedItems)", () => {
    const taskA = makeTask({ id: "a", due_time: "09:00", estimated_duration: 60, title: "Item A" });
    const taskB = makeTask({ id: "b", due_time: "09:30", estimated_duration: 60, title: "Item B" });
    renderGrid({ tasks: [taskA, taskB] });

    const { timed } = layoutTimedItems(
      groupCalendarItemsByDay([taskA, taskB], []).get(dayKey(DAY)) ?? []
    );
    expect(timed).toHaveLength(2);
    // As duas colunas devem ter largura 50% e left 0/50 (ordem por horário de início).
    const [entryA, entryB] = timed;
    expect(entryA.widthPercent).toBe(50);
    expect(entryB.widthPercent).toBe(50);
    expect(new Set([entryA.leftPercent, entryB.leftPercent])).toEqual(new Set([0, 50]));

    const wrapperA = absoluteWrapperOf(screen.getByRole("button", { name: /Item A/ }));
    const wrapperB = absoluteWrapperOf(screen.getByRole("button", { name: /Item B/ }));
    expect(wrapperA.style.left).toBe(`${entryA.leftPercent}%`);
    expect(wrapperA.style.width).toBe(`${entryA.widthPercent}%`);
    expect(wrapperB.style.left).toBe(`${entryB.leftPercent}%`);
    expect(wrapperB.style.width).toBe(`${entryB.widthPercent}%`);
  });

  it("itens sem sobreposição ocupam a coluna inteira (width 100%, left 0%)", () => {
    const taskA = makeTask({ id: "a", due_time: "08:00", estimated_duration: 30, title: "Manhã" });
    const taskB = makeTask({ id: "b", due_time: "18:00", estimated_duration: 30, title: "Noite" });
    renderGrid({ tasks: [taskA, taskB] });

    for (const title of ["Manhã", "Noite"]) {
      const wrapper = absoluteWrapperOf(screen.getByRole("button", { name: new RegExp(title) }));
      expect(wrapper.style.left).toBe("0%");
      expect(wrapper.style.width).toBe("100%");
    }
  });
});

describe("AgendaHourGrid — faixa 'Sem horário'", () => {
  it("tarefa com due_date mas sem due_time aparece na faixa 'Sem horário', fora do canvas de horas", () => {
    const untimed = makeTask({ due_time: null, title: "Sem horário nenhum" });
    renderGrid({ tasks: [untimed] });

    expect(screen.getByText("Sem horário")).toBeInTheDocument();
    const strip = screen.getByText("Sem horário").closest("div")?.parentElement as HTMLElement;
    expect(within(strip).getByText("Sem horário nenhum")).toBeInTheDocument();
  });

  it("some quando nenhum item do(s) dia(s) visível(is) está sem horário", () => {
    const timed = makeTask({ due_time: "09:00", title: "Com horário" });
    renderGrid({ tasks: [timed] });

    expect(screen.queryByText("Sem horário")).not.toBeInTheDocument();
  });
});

describe("AgendaHourGrid — clique abre o dialog certo", () => {
  it("clicar num item com horário chama onOpenTask com a tarefa", async () => {
    const user = userEvent.setup();
    const task = makeTask({ due_time: "10:00", title: "Clicável" });
    const { onOpenTask } = renderGrid({ tasks: [task] });

    await user.click(screen.getByRole("button", { name: /Clicável/ }));

    expect(onOpenTask).toHaveBeenCalledWith(task);
  });

  it("clicar num evento com horário chama onOpenEvent com o evento", async () => {
    const user = userEvent.setup();
    const event = makeEvent({ title: "Evento clicável" });
    const { onOpenEvent } = renderGrid({ events: [event], projects: [makeProject()] });

    await user.click(screen.getByRole("button", { name: /Evento clicável/ }));

    expect(onOpenEvent).toHaveBeenCalledWith(event);
  });

  it("clicar num item da faixa 'Sem horário' também chama onOpenTask", async () => {
    const user = userEvent.setup();
    const task = makeTask({ due_time: null, title: "Sem horário clicável" });
    const { onOpenTask } = renderGrid({ tasks: [task] });

    await user.click(screen.getByRole("button", { name: /Sem horário clicável/ }));

    expect(onOpenTask).toHaveBeenCalledWith(task);
  });
});

describe("AgendaHourGrid — criar evento clicando num slot (feature 067)", () => {
  it("clicar num slot vazio dispara onCreateAt com o dia e a hora daquela linha", async () => {
    const user = userEvent.setup();
    const onCreateAt = vi.fn();
    renderGrid({ onCreateAt });

    await user.click(screen.getByRole("button", { name: "Novo evento em 17 de agosto de 2026 às 09:00" }));

    expect(onCreateAt).toHaveBeenCalledTimes(1);
    const [day, hour] = onCreateAt.mock.calls[0];
    expect(isSameDay(day as Date, DAY)).toBe(true);
    expect(hour).toBe(9);
  });

  it("cada coluna de dia tem os próprios slots (visão semana)", async () => {
    const user = userEvent.setup();
    const onCreateAt = vi.fn();
    renderGrid({ days: [new Date(2026, 7, 17), new Date(2026, 7, 18)], onCreateAt });

    await user.click(screen.getByRole("button", { name: "Novo evento em 18 de agosto de 2026 às 14:00" }));

    const [day, hour] = onCreateAt.mock.calls[0];
    expect(isSameDay(day as Date, new Date(2026, 7, 18))).toBe(true);
    expect(hour).toBe(14);
  });

  it("clicar num bloco de evento não dispara onCreateAt — abre o evento", async () => {
    const user = userEvent.setup();
    const onCreateAt = vi.fn();
    const event = makeEvent({ title: "Evento clicável", starts_at: new Date(2026, 7, 17, 10, 0).toISOString() });
    const { onOpenEvent } = renderGrid({ events: [event], projects: [makeProject()], onCreateAt });

    await user.click(screen.getByRole("button", { name: /Evento clicável/ }));

    expect(onOpenEvent).toHaveBeenCalledWith(event);
    expect(onCreateAt).not.toHaveBeenCalled();
  });

  it("clicar num bloco de tarefa não dispara onCreateAt — abre a tarefa", async () => {
    const user = userEvent.setup();
    const onCreateAt = vi.fn();
    const task = makeTask({ due_time: "10:00", title: "Tarefa clicável" });
    const { onOpenTask } = renderGrid({ tasks: [task], onCreateAt });

    await user.click(screen.getByRole("button", { name: /Tarefa clicável/ }));

    expect(onOpenTask).toHaveBeenCalledWith(task);
    expect(onCreateAt).not.toHaveBeenCalled();
  });

  it("sem onCreateAt a grade continua só leitura (nenhum alvo de criação)", () => {
    renderGrid({});

    expect(screen.queryByRole("button", { name: /^Novo evento em/ })).not.toBeInTheDocument();
  });
});

describe("AgendaHourGrid — subtarefa com prazo próprio (feature 048)", () => {
  it("subtarefa com due_time entra no canvas de horas com o indicador de vínculo (tooltip com o nome da tarefa-mãe)", () => {
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal" });
    const subtask = makeTask({
      id: "sub-1",
      parent_task_id: "parent-1",
      due_time: "10:00",
      title: "Subtarefa com horário",
    });
    renderGrid({ tasks: [subtask], allTasks: [parent, subtask] });

    const button = screen.getByRole("button", { name: /Subtarefa com horário/ });
    expect(button.getAttribute("title")).toBe('Subtarefa com horário — Subtarefa de "Tarefa principal"');
  });

  it("subtarefa sem due_time (faixa 'Sem horário') também mostra o indicador de vínculo", () => {
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal" });
    const subtask = makeTask({
      id: "sub-1",
      parent_task_id: "parent-1",
      due_time: null,
      title: "Subtarefa sem horário",
    });
    renderGrid({ tasks: [subtask], allTasks: [parent, subtask] });

    const button = screen.getByRole("button", { name: /Subtarefa sem horário/ });
    expect(button.getAttribute("title")).toBe('Subtarefa de "Tarefa principal"');
  });

  it("tarefa de topo (sem parent_task_id) não recebe o indicador/tooltip de vínculo", () => {
    const task = makeTask({ due_time: "11:00", title: "Tarefa de topo" });
    renderGrid({ tasks: [task] });

    const button = screen.getByRole("button", { name: /Tarefa de topo/ });
    expect(button.getAttribute("title")).toBe("Tarefa de topo");
  });
});


/**
 * Feature 072 — tarefa pontual (`estimated_duration === 0` ou dose de medicação sem duração) sai
 * do algoritmo de colunas e vira fileira de bolinhas marcáveis no horário marcado.
 */
describe("AgendaHourGrid — tarefas pontuais em bolinhas (feature 072)", () => {
  function pointTask(overrides: Partial<Task> = {}): Task {
    return makeTask({ estimated_duration: 0, ...overrides });
  }

  it("3 pontuais no mesmo horário NÃO dividem a largura da coluna — viram uma fileira só", () => {
    const tasks = [
      pointTask({ id: "p1", title: "Remédio A", due_time: "08:00" }),
      pointTask({ id: "p2", title: "Remédio B", due_time: "08:00" }),
      pointTask({ id: "p3", title: "Remédio C", due_time: "08:00" }),
    ];
    renderGrid({ tasks, onToggleTaskDone: vi.fn() });

    // Nenhum bloco retangular foi criado (o bloco carrega o wrapper absoluto com width).
    for (const title of ["Remédio A", "Remédio B", "Remédio C"]) {
      const dot = screen.getByRole("button", { name: `Concluir: ${title} (08:00)` });
      expect(dot.className).toContain("rounded-full");
    }

    const fileira = screen.getByRole("group", { name: /^Tarefas pontuais às 08:00/ });
    expect(within(fileira).getAllByRole("button")).toHaveLength(3);
    // Uma fileira só, ocupando a coluna inteira: nada de 33% de largura por item.
    const wrapper = fileira.parentElement as HTMLElement;
    expect(wrapper.style.width).toBe("");
    expect(wrapper.className).toContain("inset-x-0");
  });

  it("a fileira é posicionada pelo horário (top em % do dia), como os blocos", () => {
    renderGrid({ tasks: [pointTask({ due_time: "06:00", title: "Remédio" })] });

    const fileira = screen.getByRole("group", { name: /^Tarefas pontuais às 06:00/ });
    const wrapper = fileira.parentElement as HTMLElement;
    // 06:00 = 360 de 1440 minutos = 25% do dia
    expect(wrapper.style.top).toBe("25%");
  });

  it("uma fileira por horário: 08:00 e 09:00 não se misturam", () => {
    renderGrid({
      tasks: [
        pointTask({ id: "p1", title: "Manhã", due_time: "08:00" }),
        pointTask({ id: "p2", title: "Depois", due_time: "09:00" }),
      ],
    });

    expect(
      within(screen.getByRole("group", { name: /^Tarefas pontuais às 08:00/ })).getAllByRole("button")
    ).toHaveLength(1);
    expect(
      within(screen.getByRole("group", { name: /^Tarefas pontuais às 09:00/ })).getAllByRole("button")
    ).toHaveLength(1);
  });

  it("clicar numa bolinha chama onToggleTaskDone e NÃO dispara onCreateAt (feature 067)", async () => {
    const user = userEvent.setup();
    const onCreateAt = vi.fn();
    const onToggleTaskDone = vi.fn();
    const task = pointTask({ title: "Remédio", due_time: "08:00" });
    renderGrid({ tasks: [task], onCreateAt, onToggleTaskDone });

    await user.click(screen.getByRole("button", { name: "Concluir: Remédio (08:00)" }));

    expect(onToggleTaskDone).toHaveBeenCalledTimes(1);
    expect(onToggleTaskDone).toHaveBeenCalledWith(task);
    expect(onCreateAt).not.toHaveBeenCalled();
  });

  it("sem onToggleTaskDone (Gantt) as bolinhas ficam desabilitadas, mas continuam visíveis", () => {
    renderGrid({ tasks: [pointTask({ title: "Remédio", due_time: "08:00", status: "done" })] });

    expect(screen.getByRole("button", { name: "Remédio (08:00)" })).toBeDisabled();
  });

  it("dose de medicação sem duração informada também vira bolinha", () => {
    renderGrid({
      tasks: [makeTask({ title: "Dose 1", due_time: "08:00", is_medication: true })],
      onToggleTaskDone: vi.fn(),
    });

    expect(screen.getByRole("button", { name: "Concluir: Dose 1 (08:00)" })).toBeInTheDocument();
  });

  it("tarefa comum sem duração continua sendo bloco de 30 min, não bolinha", () => {
    renderGrid({ tasks: [makeTask({ title: "Reunião", due_time: "08:00" })] });

    expect(screen.queryByRole("group", { name: /^Tarefas pontuais/ })).not.toBeInTheDocument();
    const wrapper = absoluteWrapperOf(screen.getByRole("button", { name: /Reunião/ }));
    expect(wrapper.style.width).toBe("100%");
  });

  it("pontual SEM horário entra na faixa 'Sem horário' como bolinha, não como chip", async () => {
    const user = userEvent.setup();
    const onToggleTaskDone = vi.fn();
    const onOpenTask = vi.fn();
    const task = pointTask({ title: "Trocar lençol", due_time: null });
    renderGrid({ tasks: [task], onToggleTaskDone, onOpenTask });

    expect(screen.getByText("Sem horário")).toBeInTheDocument();
    const fileira = screen.getByRole("group", { name: /^Tarefas pontuais sem horário/ });
    const dot = within(fileira).getByRole("button", { name: "Concluir: Trocar lençol" });
    expect(dot.className).toContain("rounded-full");

    await user.click(dot);
    expect(onToggleTaskDone).toHaveBeenCalledWith(task);
    // A bolinha é a única ação dela: não abre o form da tarefa.
    expect(onOpenTask).not.toHaveBeenCalled();
  });

  it("a faixa 'Sem horário' aparece mesmo quando o dia só tem pontuais sem horário", () => {
    renderGrid({ tasks: [pointTask({ title: "Trocar escova", due_time: null })] });

    expect(screen.getByText("Sem horário")).toBeInTheDocument();
  });
});
