import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgendaHourGrid } from "@/pages/admin/tasks/AgendaHourGrid";
import { dayKey } from "@/pages/admin/tasks/AgendaGrid";
import { computeItemPosition, groupCalendarItemsByDay, layoutTimedItems } from "@/domain/tasks";
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
  onToggleQuick = vi.fn(),
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
  onToggleQuick?: (task: Task) => void;
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
      onToggleQuick={onToggleQuick}
    />
  );
  return { ...utils, onOpenTask, onOpenEvent, onToggleQuick };
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
 * Feature 070 — tarefa pontual como bolinha. Sem Chrome, é aqui que se prova que a pontual **não**
 * vira bloco no canvas de horas, que as do mesmo horário ficam na mesma fileira ("uma na frente da
 * outra"), que a fileira pousa no `top` do horário e que o clique conclui em vez de abrir diálogo.
 */
describe("AgendaHourGrid — tarefas pontuais (bolinhas)", () => {
  it("pontual com horário vira bolinha e não vira bloco", () => {
    const quick = makeTask({ id: "q1", due_time: "08:00", title: "Losartana", is_quick: true });
    renderGrid({ tasks: [quick] });

    // Bolinha: botão com o rótulo de concluir.
    expect(screen.getByRole("button", { name: "Concluir «Losartana» às 08:00" })).toBeInTheDocument();
    // E nenhum bloco do canvas de horas (o bloco tem o título como nome acessível/texto).
    expect(screen.queryByText("Losartana")).not.toBeInTheDocument();
  });

  it("tarefa comum continua bloco quando divide o dia com uma pontual", () => {
    const quick = makeTask({ id: "q1", due_time: "08:00", title: "Losartana", is_quick: true });
    const normal = makeTask({ id: "n1", due_time: "09:00", estimated_duration: 60, title: "Reunião" });
    renderGrid({ tasks: [quick, normal] });

    const block = screen.getByRole("button", { name: /Reunião/ });
    const wrapper = absoluteWrapperOf(block);
    // A pontual saiu do layout: o bloco ocupa a coluna inteira, sem dividir largura com ela.
    expect(wrapper.style.width).toBe("100%");
    expect(wrapper.style.left).toBe("0%");
  });

  it("duas pontuais no mesmo horário ficam na mesma fileira, no top daquele horário", () => {
    const a = makeTask({ id: "q1", due_time: "08:00", title: "Losartana", is_quick: true });
    // `HH:mm:ss` é o que o Postgres devolve — tem que cair no mesmo slot.
    const b = makeTask({ id: "q2", due_time: "08:00:00", title: "Vitamina D", is_quick: true });
    renderGrid({ tasks: [a, b] });

    const row = screen.getByRole("group", { name: "Tarefas pontuais às 08:00" });
    expect(within(row).getAllByRole("button")).toHaveLength(2);

    const positioned = row.closest('div[style*="top"]') as HTMLElement;
    const expectedTop = computeItemPosition({ startMinutes: 8 * 60, durationMinutes: 0 }).topPercent;
    expect(positioned.style.top).toBe(`${expectedTop}%`);
    expect(positioned.className).toContain("z-10");
  });

  it("horários diferentes viram fileiras diferentes", () => {
    const manha = makeTask({ id: "q1", due_time: "08:00", title: "Losartana", is_quick: true });
    const noite = makeTask({ id: "q2", due_time: "20:00", title: "Melatonina", is_quick: true });
    renderGrid({ tasks: [manha, noite] });

    expect(screen.getByRole("group", { name: "Tarefas pontuais às 08:00" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Tarefas pontuais às 20:00" })).toBeInTheDocument();
  });

  it("pontual sem horário vira bolinha na faixa 'Sem horário', não chip", () => {
    const quick = makeTask({ id: "q1", due_time: null, title: "Trocar lençol", is_quick: true });
    renderGrid({ tasks: [quick] });

    expect(screen.getByText("Sem horário")).toBeInTheDocument();
    const row = screen.getByRole("group", { name: "Tarefas pontuais sem horário" });
    expect(within(row).getByRole("button", { name: "Concluir «Trocar lençol»" })).toBeInTheDocument();
    // O chip de largura inteira (que mostra o título como texto) não é mais o formato dela.
    expect(screen.queryByText("Trocar lençol")).not.toBeInTheDocument();
  });

  it("clicar na bolinha chama onToggleQuick, nunca onOpenTask", async () => {
    const user = userEvent.setup();
    const quick = makeTask({ id: "q1", due_time: "08:00", title: "Losartana", is_quick: true });
    const { onToggleQuick, onOpenTask } = renderGrid({ tasks: [quick] });

    await user.click(screen.getByRole("button", { name: "Concluir «Losartana» às 08:00" }));

    expect(onToggleQuick).toHaveBeenCalledWith(quick);
    expect(onOpenTask).not.toHaveBeenCalled();
  });

  it("acima do limite de bolinhas visíveis aparece o +N, que abre o dia", async () => {
    const user = userEvent.setup();
    const onOpenDay = vi.fn();
    const many = Array.from({ length: 8 }, (_, i) =>
      makeTask({ id: `q${i}`, due_time: "08:00", title: `Pontual ${i}`, is_quick: true })
    );
    render(
      <AgendaHourGrid
        days={[DAY]}
        itemsByDay={groupCalendarItemsByDay(many, [])}
        projectById={new Map()}
        taskById={new Map(many.map((t) => [t.id, t]))}
        onOpenTask={vi.fn()}
        onOpenEvent={vi.fn()}
        onToggleQuick={vi.fn()}
        onOpenDay={onOpenDay}
      />
    );

    const row = screen.getByRole("group", { name: "Tarefas pontuais às 08:00" });
    // 6 bolinhas + o botão "+2".
    expect(within(row).getAllByRole("button")).toHaveLength(7);
    await user.click(within(row).getByRole("button", { name: "Ver mais 2 tarefas pontuais" }));
    expect(onOpenDay).toHaveBeenCalledWith(dayKey(DAY));
  });

  it("ocorrência virtual vira bolinha tracejada e não clicável", async () => {
    const user = userEvent.setup();
    const virtual = makeTask({
      id: "virtual:origem-1:2026-08-17",
      due_time: "08:00",
      title: "Trocar escova",
      is_quick: true,
    });
    const { onToggleQuick } = renderGrid({ tasks: [virtual] });

    const button = screen.getByRole("button", {
      name: "Trocar escova às 08:00 — próxima ocorrência, ainda não criada",
    });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onToggleQuick).not.toHaveBeenCalled();
  });
});

describe("AgendaHourGrid — número do dia abre o dia inteiro", () => {
  it("clicar no número do dia chama onOpenDay com a chave do dia", async () => {
    const user = userEvent.setup();
    const onOpenDay = vi.fn();
    render(
      <AgendaHourGrid
        days={[DAY]}
        itemsByDay={new Map()}
        projectById={new Map()}
        taskById={new Map()}
        onOpenTask={vi.fn()}
        onOpenEvent={vi.fn()}
        onToggleQuick={vi.fn()}
        onOpenDay={onOpenDay}
      />
    );

    await user.click(screen.getByRole("button", { name: "Ver tudo do dia 17" }));

    expect(onOpenDay).toHaveBeenCalledWith(dayKey(DAY));
  });

  it("sem onOpenDay (drill-down do Gantt), o número do dia não é botão", () => {
    renderGrid({ days: [DAY] });

    expect(screen.queryByRole("button", { name: "Ver tudo do dia 17" })).not.toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
  });
});
