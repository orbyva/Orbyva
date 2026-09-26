import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TaskQuadrant } from "@/pages/admin/tasks/TaskQuadrant";
import type { Task } from "@/types/tasks";

/**
 * Feature 082 — o pedido literal é "na lista de prioridades não precisa dizer (média, baixa, sem
 * prioridade, então remova essas linhas), só a bandeirinha vai ser capaz de dizer".
 *
 * Aqui se prova por DOM (a skill `next` proíbe Chrome) que os textos sumiram do painel "Por
 * prioridade", que a contagem e o nome acessível de cada faixa continuam, e que o painel "Por
 * prazo" — que **não** é o alvo do pedido — segue com os rótulos dele intactos.
 */

const TODAY = "2026-08-20";

function makeTask(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    project_id: "proj-1",
    parent_task_id: null,
    recurrence_origin_id: null,
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

/** Uma tarefa em cada faixa — inclusive as três que o prompt manda calar e a "sem prioridade". */
const TASKS: Task[] = [
  makeTask({ id: "t-high", title: "Assinar contrato", priority: "high", due_date: TODAY }),
  makeTask({ id: "t-medium", title: "Revisar orçamento", priority: "medium", due_date: TODAY }),
  makeTask({ id: "t-low", title: "Arquivar notas", priority: "low", due_date: "2026-09-30" }),
  makeTask({ id: "t-none", title: "Ideia solta", priority: null }),
];

function renderQuadrant(tasks: Task[] = TASKS) {
  const onSelectTask = vi.fn();
  const result = render(
    <TaskQuadrant tasks={tasks} todayIso={TODAY} onSelectTask={onSelectTask} />
  );
  return { ...result, onSelectTask };
}

function priorityPanel(): HTMLElement {
  return screen.getByText("Por prioridade").closest("div") as HTMLElement;
}

function duePanel(): HTMLElement {
  return screen.getByText("Por prazo").closest("div") as HTMLElement;
}

/** Títulos das linhas do painel indicado, na ordem em que estão na tela. */
function rowTitles(panel: HTMLElement): string[] {
  return Array.from(panel.querySelectorAll("button")).map(
    (button) => button.querySelector("span")?.textContent?.trim() ?? ""
  );
}

describe("TaskQuadrant — painel Por prioridade sem texto de faixa (082)", () => {
  it("não escreve Alta, Média, Baixa nem Sem prioridade no painel", () => {
    renderQuadrant();
    const panel = within(priorityPanel());
    for (const label of ["Alta", "Média", "Baixa", "Sem prioridade"]) {
      expect(panel.queryByText(label)).toBeNull();
    }
  });

  it("mantém a contagem de cada faixa", () => {
    renderQuadrant([
      ...TASKS,
      makeTask({ id: "t-high-2", title: "Ligar para o cliente", priority: "high" }),
    ]);
    const panel = within(priorityPanel());
    // Duas na faixa "Alta", uma em cada uma das outras três.
    expect(panel.getAllByText("1")).toHaveLength(3);
    expect(panel.getByText("2")).toBeInTheDocument();
  });

  it("mantém o nome acessível e o tooltip de cada faixa", () => {
    renderQuadrant();
    const panel = within(priorityPanel());
    // O rótulo por extenso vira `title` no cabeçalho...
    expect(panel.getByTitle("Alta")).toBeInTheDocument();
    expect(panel.getByTitle("Média")).toBeInTheDocument();
    expect(panel.getByTitle("Baixa")).toBeInTheDocument();
    expect(panel.getByTitle("Sem prioridade")).toBeInTheDocument();

    // ...e o nome acessível fica na bandeirinha. A faixa "sem prioridade" ganhou a bandeirinha
    // vazada; a **linha** de tarefa sem prioridade continua sem bandeirinha nenhuma.
    expect(panel.getByLabelText("Sem prioridade")).toBeInTheDocument();
    expect(panel.getAllByLabelText("Prioridade alta")).toHaveLength(2); // cabeçalho + linha
  });

  it("a linha de tarefa sem prioridade continua sem bandeirinha", () => {
    renderQuadrant([makeTask({ id: "t-none", title: "Ideia solta", priority: null })]);
    // Só a bandeirinha vazada do cabeçalho da faixa, nenhuma na linha.
    const panel = within(priorityPanel());
    expect(panel.getAllByLabelText("Sem prioridade")).toHaveLength(1);
    expect(panel.getByText("Ideia solta")).toBeInTheDocument();
  });

  it("o painel Por prazo não foi alterado — continua com os rótulos por extenso", () => {
    renderQuadrant();
    const panel = within(duePanel());
    expect(panel.getByText("Hoje")).toBeInTheDocument();
    expect(panel.getByText("Mais tarde")).toBeInTheDocument();
    expect(panel.getByText("Sem prazo")).toBeInTheDocument();
  });

  it("faixa vazia continua escondida e o painel inteiro some sem tarefas", () => {
    const { rerender } = renderQuadrant([
      makeTask({ id: "t-high", title: "Assinar contrato", priority: "high" }),
    ]);
    const panel = within(priorityPanel());
    expect(panel.getByTitle("Alta")).toBeInTheDocument();
    expect(panel.queryByTitle("Média")).toBeNull();
    expect(panel.queryByTitle("Sem prioridade")).toBeNull();

    rerender(<TaskQuadrant tasks={[]} todayIso={TODAY} onSelectTask={vi.fn()} />);
    expect(screen.queryByText("Por prioridade")).toBeNull();
  });
});

/**
 * Feature 082 + contrato com a 079: dentro do painel "Por prioridade" quem manda é `sort_order`
 * asc; o comparador da tela (que já entregou o array nesta ordem) entra só como desempate. Sem o
 * desempate a faixa recém-migrada — todo mundo em `0` — ficaria em ordem indefinida.
 */
describe("TaskQuadrant — ordem da faixa (082 × 079)", () => {
  const BAND = [
    makeTask({ id: "t-1", title: "Primeira", priority: "high" }),
    makeTask({ id: "t-2", title: "Segunda", priority: "high" }),
    makeTask({ id: "t-3", title: "Terceira", priority: "high" }),
  ];

  it("duas tarefas com sort_order = 0 mantêm a ordem de entrada (desempate estável)", () => {
    const { unmount } = renderQuadrant(BAND);
    expect(rowTitles(priorityPanel())).toEqual(["Primeira", "Segunda", "Terceira"]);
    unmount();

    // Mesmo conteúdo, outra ordem de entrada (é o que o seletor da 079 faz): a faixa acompanha,
    // porque nenhuma delas foi arrastada ainda.
    renderQuadrant([BAND[2], BAND[0], BAND[1]]);
    expect(rowTitles(priorityPanel())).toEqual(["Terceira", "Primeira", "Segunda"]);
  });

  it("sort_order asc manda quando existe, mesmo contra a ordem de entrada", () => {
    renderQuadrant([
      makeTask({ id: "t-1", title: "Primeira", priority: "high", sort_order: 2 }),
      makeTask({ id: "t-2", title: "Segunda", priority: "high", sort_order: 0 }),
      makeTask({ id: "t-3", title: "Terceira", priority: "high", sort_order: 1 }),
    ]);
    expect(rowTitles(priorityPanel())).toEqual(["Segunda", "Terceira", "Primeira"]);
  });

  it("empate parcial: quem tem o mesmo sort_order desempata pela ordem de entrada", () => {
    renderQuadrant([
      makeTask({ id: "t-1", title: "Primeira", priority: "high", sort_order: 1 }),
      makeTask({ id: "t-2", title: "Segunda", priority: "high", sort_order: 1 }),
      makeTask({ id: "t-3", title: "Terceira", priority: "high", sort_order: 0 }),
    ]);
    expect(rowTitles(priorityPanel())).toEqual(["Terceira", "Primeira", "Segunda"]);
  });

  it("o painel «Por prazo» ignora sort_order — ali quem manda é a ordem da tela (079)", () => {
    renderQuadrant([
      makeTask({ id: "t-1", title: "Primeira", priority: "high", sort_order: 9, due_date: TODAY }),
      makeTask({ id: "t-2", title: "Segunda", priority: "high", sort_order: 0, due_date: TODAY }),
    ]);
    expect(rowTitles(priorityPanel())).toEqual(["Segunda", "Primeira"]);
    expect(rowTitles(duePanel())).toEqual(["Primeira", "Segunda"]);
  });
});
