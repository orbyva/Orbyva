import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import type { Project, Task } from "@/types/tasks";
import { formatDateTimeBR } from "@/lib/currency";

/**
 * `@svar-ui/react-gantt` monta um `<canvas>` internamente e crasha em jsdom ("Cannot read
 * properties of null (reading 'translate')" — `getContext()` não implementado sem o pacote nativo
 * `canvas`). Por isso mockamos o módulo inteiro: o `Gantt` fake só chama `init(api)` (como a lib
 * real faz, uma vez, na montagem) com um `api` mínimo que implementa `getState`/`exec`/`on`/
 * `intercept`, e expõe os props recebidos via `ganttPropsRef` — o suficiente pra testar a fiação
 * de `GanttChart.tsx` (modo de visão, presets de zoom) sem depender do motor de renderização real
 * da lib. `buildGanttNodes`/`jumpToGanttZoomLevel` (a lógica de verdade por trás dessa fiação) já
 * são testados isoladamente em `gantt.test.ts`.
 *
 * `api.on`/`api.intercept` (feature 044): a versão original desse mock era `on: () => {}` — um
 * no-op que descartava o callback na hora. Isso registrava os handlers reais de `handleInit`
 * (`GanttChart.tsx`) durante os testes, mas nenhum teste jamais disparava esses callbacks — ou
 * seja, nem a versão mockada da lib provava que a fiação (`api.on("update-task", cb)` → `cb`
 * chama `updateTask`) de fato funcionava; só a lógica pura por trás tinha teste (`gantt.test.ts`).
 * Este mock guarda os callbacks registrados por evento (`Map<string, Function[]>`, mesmo shape que
 * o `EventBus` real da lib usa internamente — `@svar-ui/lib-state`, `this._handlers[name]`) e expõe
 * `triggerGanttEvent(event, payload)` pro teste disparar, simulando `exec()` da lib real. Não é
 * reimplementar a lib — é fazer o dublê de teste guardar o que a lib real guardaria.
 */
const { execMock, zoomState, ganttPropsRef, ganttHandlers, ganttInterceptors } = vi.hoisted(() => ({
  // Assinatura precisa do param pra `toHaveBeenCalledWith({ dir })` tipar certo, mesmo sem o corpo usá-lo.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  execMock: vi.fn(async (_data: { dir: number }) => undefined),
  zoomState: { level: 0 },
  ganttPropsRef: { current: null as null | Record<string, unknown> },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ganttHandlers: new Map<string, ((payload: any) => unknown)[]>(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ganttInterceptors: new Map<string, ((payload: any) => unknown)[]>(),
}));

/** Dispara, em ordem, os `intercept`s e depois os `on`s registrados pra `event` — mesma ordem que
 * `EventBus.exec` real usa (interceptors primeiro, no início da pilha; `on` depois). Se algum
 * interceptor retornar `false`, para (mesma semântica de cancelamento da lib real) e não chama os
 * `on`. Usado pelos testes pra simular a lib disparando `show-editor`/`update-task`/`add-link`/
 * `delete-link` depois que `handleInit` já registrou os handlers reais do componente. */
async function triggerGanttEvent(event: string, payload: unknown): Promise<void> {
  for (const interceptor of ganttInterceptors.get(event) ?? []) {
    if ((await interceptor(payload)) === false) return;
  }
  for (const handler of ganttHandlers.get(event) ?? []) {
    await handler(payload);
  }
}

vi.mock("@svar-ui/react-gantt", () => ({
  Gantt: (props: Record<string, unknown>) => {
    ganttPropsRef.current = props;
    useEffect(() => {
      ganttHandlers.clear();
      ganttInterceptors.clear();
      const init = props.init as ((api: unknown) => void) | undefined;
      init?.({
        intercept: (event: string, handler: (payload: unknown) => unknown) => {
          const list = ganttInterceptors.get(event) ?? [];
          list.push(handler);
          ganttInterceptors.set(event, list);
        },
        on: (event: string, handler: (payload: unknown) => unknown) => {
          const list = ganttHandlers.get(event) ?? [];
          list.push(handler);
          ganttHandlers.set(event, list);
        },
        getState: () => ({ zoom: { level: zoomState.level } }),
        exec: async (_action: string, data: { dir: number }) => {
          await execMock(data);
          zoomState.level += data.dir;
        },
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Renderiza a coluna "text" de cada nó via `column.cell` (feature 039) — o suficiente pra
    // testar o trigger de quick actions sem depender do motor de grid real da lib (que a lib
    // real desenharia célula a célula, mas o mock não implementa layout/scroll algum).
    const nodes = (props.tasks as Record<string, unknown>[]) ?? [];
    const columns =
      (props.columns as { id: string; cell?: (p: { row: Record<string, unknown> }) => ReactNode }[]) ?? [];
    const textColumn = columns.find((c) => c.id === "text");
    return (
      <div data-testid="mock-gantt">
        {textColumn?.cell &&
          nodes.map((node) => <div key={node.id as string}>{textColumn.cell!({ row: node })}</div>)}
      </div>
    );
  },
  getDefaultColumns: () => [{ id: "text" }],
  Willow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  WillowDark: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// `handleInit` (`GanttChart.tsx`) chama `updateTask`/`createDependency`/`deleteDependency` de
// verdade nos handlers de `update-task`/`add-link`/`delete-link` — mockado pra provar a fiação
// (`api.on(...) → nosso handler → chamada de API`) sem bater no Supabase de verdade.
vi.mock("@/api/tasks", () => ({
  updateTask: vi.fn(),
  createDependency: vi.fn(),
  deleteDependency: vi.fn(),
}));

import { GanttBarContent, GanttChart } from "@/pages/admin/tasks/GanttChart";
import { createDependency, deleteDependency, updateTask } from "@/api/tasks";
import { GANTT_PROJECT_NODE_PREFIX, type GanttNode } from "@/domain/tasks";

const mockedUpdateTask = vi.mocked(updateTask);
const mockedCreateDependency = vi.mocked(createDependency);
const mockedDeleteDependency = vi.mocked(deleteDependency);

function currentNodes(): GanttNode[] {
  return (ganttPropsRef.current?.tasks as GanttNode[]) ?? [];
}

describe("GanttChart — modo de visão e zoom (feature 037)", () => {
  const projects = [{ id: "p1", name: "Projeto 1" }];
  const tasks = [
    {
      id: "1",
      title: "Tarefa 1",
      status: "todo" as const,
      parent_task_id: null,
      project_id: "p1",
      due_date: "2026-08-20",
    },
  ];

  beforeEach(() => {
    execMock.mockClear();
    zoomState.level = 0;
  });

  it("por padrão, abre no modo 'Por projeto': nó de projeto vem colapsado (open:false)", () => {
    render(<GanttChart tasks={tasks} projects={projects} />);
    const projectNode = currentNodes().find((n) => n.type === "summary");
    expect(projectNode?.open).toBe(false);
    // rollup calculado (mesma lógica coberta em gantt.test.ts) — confirma que o modo por projeto
    // está mesmo ativo, não só o valor de `open`.
    expect(projectNode?.start).toBeDefined();
    expect(projectNode?.progress).toBeDefined();
  });

  it("clicar 'Por tarefa' muda o modo: nó de projeto passa a vir aberto (open:true), sem rollup", async () => {
    render(<GanttChart tasks={tasks} projects={projects} />);
    await userEvent.click(screen.getByRole("button", { name: "Por tarefa" }));
    const projectNode = currentNodes().find((n) => n.type === "summary");
    expect(projectNode?.open).toBe(true);
    expect(projectNode?.start).toBeUndefined();
  });

  it("clicar de volta em 'Por projeto' restaura o rollup colapsado", async () => {
    render(<GanttChart tasks={tasks} projects={projects} />);
    await userEvent.click(screen.getByRole("button", { name: "Por tarefa" }));
    await userEvent.click(screen.getByRole("button", { name: "Por projeto" }));
    const projectNode = currentNodes().find((n) => n.type === "summary");
    expect(projectNode?.open).toBe(false);
    expect(projectNode?.start).toBeDefined();
  });

  it("clicar num preset de zoom diferente do atual chama a API de zoom (via jumpToGanttZoomLevel)", async () => {
    render(<GanttChart tasks={tasks} projects={projects} />);
    await userEvent.click(screen.getByRole("button", { name: "Semana" }));
    // nível atual (0, "Dia") -> alvo 1 ("Semana"): um dir=1 já cruza (mock muda de nível toda
    // chamada), então uma única chamada de exec basta.
    expect(execMock).toHaveBeenCalledWith({ dir: 1 });
  });

  it("clicar no preset já ativo (Dia, padrão) não chama a API de zoom", async () => {
    render(<GanttChart tasks={tasks} projects={projects} />);
    await userEvent.click(screen.getByRole("button", { name: "Dia" }));
    expect(execMock).not.toHaveBeenCalled();
  });

  it("clicar em 'Trimestre' a partir de 'Dia' pula direto pro nível 3 numa única chamada", async () => {
    render(<GanttChart tasks={tasks} projects={projects} />);
    await userEvent.click(screen.getByRole("button", { name: "Trimestre" }));
    expect(execMock).toHaveBeenCalledTimes(1);
    expect(execMock).toHaveBeenCalledWith({ dir: 3 });
  });
});

describe("GanttBarContent — markup por tipo de nó (feature 037)", () => {
  it("marco (type:'milestone'): renderiza só o rótulo (wx-text-out), sem a barra retangular normal", () => {
    const { container } = render(<GanttBarContent data={{ type: "milestone", text: "Entrega" }} />);
    const label = container.querySelector(".wx-text-out");
    expect(label).toHaveTextContent("Entrega");
    // não é o mesmo markup de uma tarefa normal (wx-content) — é isso que deixa a lib desenhar o
    // losango (`.wx-content` vazio que ela mesma insere antes do template, ver comentário acima
    // de `GanttBarContent`) em vez da barra retangular.
    expect(container.querySelector(".wx-content")).not.toBeInTheDocument();
  });

  it("rollup de projeto (type:'summary'): renderiza wx-content normal, sem o estilo de âncora tracejada", () => {
    const { container } = render(<GanttBarContent data={{ type: "summary", text: "Projeto 1" }} />);
    const content = container.querySelector(".wx-content");
    expect(content).toHaveTextContent("Projeto 1");
    expect(content).not.toHaveClass("border-dashed");
  });

  it("tarefa sem data planejada (âncora): wx-content ganha borda tracejada distinguível", () => {
    const { container } = render(
      <GanttBarContent data={{ type: "task", text: "Sem prazo", hasPlannedDate: false }} />
    );
    expect(container.querySelector(".wx-content")).toHaveClass("border-dashed");
  });

  it("tarefa com data real: wx-content normal, sem borda tracejada", () => {
    const { container } = render(
      <GanttBarContent data={{ type: "task", text: "Com prazo", hasPlannedDate: true }} />
    );
    expect(container.querySelector(".wx-content")).not.toHaveClass("border-dashed");
  });
});

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: "p1",
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Minha tarefa",
    status: "todo",
    tag_ids: [],
    due_date: "2026-08-20",
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return { id: "p1", name: "Projeto 1", status: "active", tag_ids: [], color: "#ff0000", ...overrides };
}

describe("GanttChart — zoom por horário no dia focado (feature 038)", () => {
  const projects = [{ id: "p1", name: "Projeto 1" }];
  const tasks = [
    {
      id: "1",
      title: "Tarefa 1",
      status: "todo" as const,
      parent_task_id: null,
      project_id: "p1",
      due_date: "2026-08-20",
    },
  ];

  beforeEach(() => {
    execMock.mockClear();
    zoomState.level = 0;
  });

  it("no preset 'Dia' (padrão), mostra o campo 'Focar dia'; some em outro preset de zoom", async () => {
    render(<GanttChart tasks={tasks} projects={projects} />);
    expect(screen.getByLabelText("Focar dia")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Semana" }));
    expect(screen.queryByLabelText("Focar dia")).not.toBeInTheDocument();
  });

  it("escolher uma data em 'Focar dia' substitui o canvas do Gantt pela grade de horas do dia", () => {
    render(<GanttChart tasks={tasks} projects={projects} />);
    expect(screen.getByTestId("mock-gantt")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Focar dia"), { target: { value: "2026-08-20" } });

    expect(screen.queryByTestId("mock-gantt")).not.toBeInTheDocument();
    expect(screen.getByText(/quinta-feira, 20 de agosto/i)).toBeInTheDocument();
  });

  it("'Voltar ao Gantt' fecha a grade de horas e restaura o canvas normal", () => {
    render(<GanttChart tasks={tasks} projects={projects} />);
    fireEvent.change(screen.getByLabelText("Focar dia"), { target: { value: "2026-08-20" } });
    expect(screen.queryByTestId("mock-gantt")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Gantt" }));

    expect(screen.getByTestId("mock-gantt")).toBeInTheDocument();
    expect(screen.getByLabelText("Focar dia")).toBeInTheDocument();
  });

  it("clicar numa tarefa da grade de horas do dia focado chama onOpenTask com a tarefa completa", () => {
    const fullTasks = [makeTask({ id: "t1", title: "Tarefa sem horário", due_date: "2026-08-20", due_time: null })];
    const onOpenTask = vi.fn();
    render(
      <GanttChart
        tasks={tasks}
        projects={projects}
        fullTasks={fullTasks}
        fullProjects={[makeProject()]}
        onOpenTask={onOpenTask}
      />
    );

    fireEvent.change(screen.getByLabelText("Focar dia"), { target: { value: "2026-08-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Tarefa sem horário" }));

    expect(onOpenTask).toHaveBeenCalledWith(fullTasks[0]);
  });
});

describe("GanttChart — quick actions no card (feature 039)", () => {
  const ganttProjects = [{ id: "p1", name: "Projeto 1" }];
  const ganttTasks = [
    {
      id: "1",
      title: "Tarefa 1",
      status: "todo" as const,
      parent_task_id: null,
      project_id: "p1",
      due_date: "2026-08-20",
    },
  ];
  const quickActionProjects = [
    makeProject({ id: "p1", name: "Projeto 1" }),
    makeProject({ id: "p2", name: "Projeto 2" }),
  ];

  function renderGantt(overrides: Partial<Parameters<typeof GanttChart>[0]> = {}) {
    const fullTasks = overrides.fullTasks ?? [
      makeTask({
        id: "1",
        title: "Tarefa 1",
        project_id: "p1",
        due_date: "2026-08-20",
        due_time: null,
        estimated_duration: null,
        priority: null,
        icon_key: null,
        icon_url: null,
      }),
    ];
    return render(
      <GanttChart
        tasks={ganttTasks}
        projects={ganttProjects}
        fullTasks={fullTasks}
        fullProjects={[makeProject()]}
        quickActionProjects={quickActionProjects}
        {...overrides}
      />
    );
  }

  it("sem handlers de quick action, o nome da tarefa continua texto simples (sem trigger clicável)", () => {
    renderGantt();
    expect(screen.queryByRole("button", { name: "Tarefa 1" })).not.toBeInTheDocument();
    expect(screen.getByText("Tarefa 1")).toBeInTheDocument();
  });

  it("clicar no nome de uma tarefa abre o popover de quick actions", async () => {
    const user = userEvent.setup();
    renderGantt({ onPriorityChange: vi.fn() });

    expect(screen.queryByRole("button", { name: "Definir prioridade" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tarefa 1" }));

    expect(await screen.findByRole("button", { name: "Definir prioridade" })).toBeInTheDocument();
  });

  it("alterar a prioridade no popover do Gantt chama onPriorityChange com o id certo da tarefa", async () => {
    const user = userEvent.setup();
    const onPriorityChange = vi.fn();
    renderGantt({ onPriorityChange });

    await user.click(screen.getByRole("button", { name: "Tarefa 1" }));
    await user.click(await screen.findByRole("button", { name: "Definir prioridade" }));
    await user.click(await screen.findByRole("button", { name: "Alta" }));

    expect(onPriorityChange).toHaveBeenCalledWith("1", "high");
  });

  it("alterar o ícone no popover do Gantt chama onIconChange com o id certo da tarefa", async () => {
    const user = userEvent.setup();
    const onIconChange = vi.fn();
    renderGantt({ onIconChange });

    await user.click(screen.getByRole("button", { name: "Tarefa 1" }));
    await user.click(await screen.findByRole("button", { name: "Definir ícone" }));
    await user.click(await screen.findByRole("button", { name: "Estrela" }));

    expect(onIconChange).toHaveBeenCalledWith("1", { icon_key: "star", icon_url: null });
  });

  it("alterar o prazo no popover do Gantt chama onDueChange com o id certo da tarefa", async () => {
    const user = userEvent.setup();
    const onDueChange = vi.fn();
    renderGantt({ onDueChange });
    const expectedDue = formatDateTimeBR("2026-08-20", null);

    await user.click(screen.getByRole("button", { name: "Tarefa 1" }));
    await user.click(await screen.findByRole("button", { name: new RegExp(expectedDue) }));
    const timeInput = await screen.findByLabelText("Horário");
    fireEvent.change(timeInput, { target: { value: "14:30" } });

    expect(onDueChange).toHaveBeenCalledWith("1", {
      due_date: "2026-08-20",
      due_time: "14:30",
      estimated_duration: null,
    });
  });

  it("trocar o projeto no popover do Gantt chama onProjectChange com o id certo da tarefa", async () => {
    const user = userEvent.setup();
    const onProjectChange = vi.fn();
    renderGantt({ onProjectChange });

    await user.click(screen.getByRole("button", { name: "Tarefa 1" }));
    await user.click(await screen.findByRole("button", { name: "Projeto 1" }));
    const listbox = await screen.findByRole("listbox", { name: "Projeto" });
    await user.click(within(listbox).getByRole("option", { name: "Projeto 2" }));

    expect(onProjectChange).toHaveBeenCalledWith("1", "p2");
  });

  it("nó de projeto (type: summary) não renderiza o trigger de quick actions", () => {
    renderGantt({
      onPriorityChange: vi.fn(),
      onIconChange: vi.fn(),
      onDueChange: vi.fn(),
      onProjectChange: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: "Projeto 1" })).not.toBeInTheDocument();
    expect(screen.getByText("Projeto 1")).toBeInTheDocument();
  });
});

describe("GanttChart — popover de quick actions sobrevive ao scroll virtualizado do grid (feature 045)", () => {
  const ganttProjects = [{ id: "p1", name: "Projeto 1" }];
  const ganttTasks = [
    {
      id: "1",
      title: "Tarefa 1",
      status: "todo" as const,
      parent_task_id: null,
      project_id: "p1",
      due_date: "2026-08-20",
    },
    {
      id: "2",
      title: "Tarefa 2",
      status: "todo" as const,
      parent_task_id: null,
      project_id: "p1",
      due_date: "2026-08-21",
    },
  ];

  function renderGantt(overrides: Partial<Parameters<typeof GanttChart>[0]> = {}) {
    const fullTasks = overrides.fullTasks ?? [
      makeTask({
        id: "1",
        title: "Tarefa 1",
        project_id: "p1",
        due_date: "2026-08-20",
        due_time: null,
        estimated_duration: null,
        priority: null,
        icon_key: null,
        icon_url: null,
      }),
      makeTask({
        id: "2",
        title: "Tarefa 2",
        project_id: "p1",
        due_date: "2026-08-21",
        due_time: null,
        estimated_duration: null,
        priority: null,
        icon_key: null,
        icon_url: null,
      }),
    ];
    return render(
      <GanttChart
        tasks={ganttTasks}
        projects={ganttProjects}
        fullTasks={fullTasks}
        fullProjects={[makeProject()]}
        {...overrides}
      />
    );
  }

  // Não temos como reproduzir a virtualização real de linhas do grid (`@svar-ui/react-grid`) em
  // jsdom — o mock (topo do arquivo) não implementa layout/scroll algum. O que este teste prova é
  // o mecanismo de defesa em si (bug real reportado: linha virtualizada desmonta com o popover
  // aberto, deixando o `PopoverContent` portalizado em `document.body` num estado inconsistente):
  // um evento `scroll` disparado em qualquer nó dentro do container do Gantt fecha o popover de
  // quick actions proativamente, via o listener `capture: true` registrado no container
  // (`GanttChart.tsx`) — condizente com a Decisão do arquivo da feature.
  it("scroll no grid do Gantt fecha o popover de quick actions aberto, e o popover de prazo aninhado dentro dele junto", async () => {
    const user = userEvent.setup();
    const onDueChange = vi.fn();
    renderGantt({ onDueChange });
    const expectedDue = formatDateTimeBR("2026-08-20", null);

    await user.click(screen.getByRole("button", { name: "Tarefa 1" }));
    const dueTrigger = await screen.findByRole("button", { name: new RegExp(expectedDue) });
    await user.click(dueTrigger);
    // popover aninhado (feature 039: quick actions -> prazo) está aberto — a hora só existe dentro dele.
    expect(await screen.findByLabelText("Horário")).toBeInTheDocument();

    fireEvent.scroll(screen.getByTestId("mock-gantt"));

    // o popover de prazo (nível 2) some...
    expect(screen.queryByLabelText("Horário")).not.toBeInTheDocument();
    // ...e o de quick actions (nível 1) também: o trigger de prazo só existe dentro do `PopoverContent`
    // externo, então sua ausência prova que o popover externo fechou, não só o interno.
    expect(screen.queryByRole("button", { name: new RegExp(expectedDue) })).not.toBeInTheDocument();
  });

  it("abrir o popover de outra tarefa fecha o anterior (popover controlado único, sem dois abertos ao mesmo tempo)", async () => {
    const user = userEvent.setup();
    const onPriorityChange = vi.fn();
    renderGantt({ onPriorityChange });

    await user.click(screen.getByRole("button", { name: "Tarefa 1" }));
    expect(await screen.findByRole("button", { name: "Definir prioridade" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tarefa 2" }));
    expect(await screen.findByRole("button", { name: "Definir prioridade" })).toBeInTheDocument();
    // uma única instância no documento — prova que a de "Tarefa 1" fechou, não que as duas ficaram
    // abertas ao mesmo tempo por acidente da elevação de estado (bug que a versão não-controlada
    // anterior não tinha como cometer, já que cada `Popover` geria seu próprio estado local).
    expect(screen.getAllByRole("button", { name: "Definir prioridade" })).toHaveLength(1);
  });
});

describe("GanttChart — fiação de eventos da lib via api.on/api.intercept (feature 044)", () => {
  const projects = [{ id: "p1", name: "Projeto 1" }];
  // Tarefa de topo com as duas datas reais (não âncora) — necessária pra testar mover vs.
  // redimensionar (`resolveTaskScheduleUpdate`) de forma inequívoca.
  const tasks = [
    {
      id: "1",
      title: "Tarefa 1",
      status: "todo" as const,
      parent_task_id: null,
      project_id: "p1",
      start_date: "2026-08-10",
      due_date: "2026-08-15",
    },
  ];

  beforeEach(() => {
    mockedUpdateTask.mockClear();
    mockedCreateDependency.mockClear();
    mockedDeleteDependency.mockClear();
  });

  describe("show-editor → onOpenTask", () => {
    it("duplo-clique numa barra/linha de tarefa de topo chama onOpenTask com a tarefa completa certa", async () => {
      const fullTasks = [
        makeTask({ id: "1", title: "Tarefa 1" }),
        makeTask({ id: "2", title: "Tarefa 2" }),
      ];
      const onOpenTask = vi.fn();
      render(
        <GanttChart tasks={tasks} projects={projects} fullTasks={fullTasks} onOpenTask={onOpenTask} />
      );

      await triggerGanttEvent("show-editor", { id: "2" });

      expect(onOpenTask).toHaveBeenCalledWith(fullTasks[1]);
    });

    it("duplo-clique numa subtarefa também resolve e chama onOpenTask com a subtarefa certa", async () => {
      const fullTasks = [
        makeTask({ id: "1", title: "Tarefa pai" }),
        makeTask({ id: "1-sub", title: "Subtarefa", parent_task_id: "1" }),
      ];
      const onOpenTask = vi.fn();
      render(
        <GanttChart tasks={tasks} projects={projects} fullTasks={fullTasks} onOpenTask={onOpenTask} />
      );

      await triggerGanttEvent("show-editor", { id: "1-sub" });

      expect(onOpenTask).toHaveBeenCalledWith(fullTasks[1]);
    });

    it("id de um nó de projeto (rollup, prefixado) não chama onOpenTask — projeto não é editável", async () => {
      const fullTasks = [makeTask({ id: "1", title: "Tarefa 1" })];
      const onOpenTask = vi.fn();
      render(
        <GanttChart tasks={tasks} projects={projects} fullTasks={fullTasks} onOpenTask={onOpenTask} />
      );

      await triggerGanttEvent("show-editor", { id: `${GANTT_PROJECT_NODE_PREFIX}p1` });

      expect(onOpenTask).not.toHaveBeenCalled();
    });
  });

  describe("update-task → updateTask", () => {
    it("mover a barra inteira (start e due deslocam pelo mesmo delta) chama updateTask sem estimated_duration", async () => {
      const onDataChanged = vi.fn();
      render(<GanttChart tasks={tasks} projects={projects} onDataChanged={onDataChanged} />);

      await triggerGanttEvent("update-task", {
        id: "1",
        task: { start: new Date(2026, 7, 12, 12), end: new Date(2026, 7, 17, 12) },
      });

      expect(mockedUpdateTask).toHaveBeenCalledWith({
        id: "1",
        start_date: "2026-08-12",
        due_date: "2026-08-17",
      });
      expect(onDataChanged).toHaveBeenCalled();
    });

    it("redimensionar só a borda direita (due muda, start igual) recalcula estimated_duration", async () => {
      const onDataChanged = vi.fn();
      render(<GanttChart tasks={tasks} projects={projects} onDataChanged={onDataChanged} />);

      await triggerGanttEvent("update-task", {
        id: "1",
        task: { end: new Date(2026, 7, 20, 12) },
      });

      expect(mockedUpdateTask).toHaveBeenCalledWith({
        id: "1",
        due_date: "2026-08-20",
        estimated_duration: 10 * 24 * 60,
      });
      expect(onDataChanged).toHaveBeenCalled();
    });

    it("evento com inProgress:true (drag ainda em andamento) não chama updateTask", async () => {
      render(<GanttChart tasks={tasks} projects={projects} />);

      await triggerGanttEvent("update-task", {
        id: "1",
        task: { start: new Date(2026, 7, 12, 12), end: new Date(2026, 7, 17, 12) },
        inProgress: true,
      });

      expect(mockedUpdateTask).not.toHaveBeenCalled();
    });

    it("id de um nó de projeto é bloqueado pelo interceptor — não chega a chamar updateTask", async () => {
      render(<GanttChart tasks={tasks} projects={projects} />);

      await triggerGanttEvent("update-task", {
        id: `${GANTT_PROJECT_NODE_PREFIX}p1`,
        task: { start: new Date(2026, 7, 12, 12), end: new Date(2026, 7, 17, 12) },
      });

      expect(mockedUpdateTask).not.toHaveBeenCalled();
    });
  });

  describe("add-link/delete-link → createDependency/deleteDependency", () => {
    it("add-link (arrastar entre bordas de barras) chama createDependency(taskId, dependsOnTaskId)", async () => {
      const onDataChanged = vi.fn();
      render(<GanttChart tasks={tasks} projects={projects} onDataChanged={onDataChanged} />);

      await triggerGanttEvent("add-link", { link: { source: "dep-task", target: "task-1" } });

      expect(mockedCreateDependency).toHaveBeenCalledWith("task-1", "dep-task");
      expect(onDataChanged).toHaveBeenCalled();
    });

    it("delete-link (remover X num link existente) chama deleteDependency(taskId, dependsOnTaskId)", async () => {
      const onDataChanged = vi.fn();
      render(<GanttChart tasks={tasks} projects={projects} onDataChanged={onDataChanged} />);

      await triggerGanttEvent("delete-link", { id: "dep-task->task-1" });

      expect(mockedDeleteDependency).toHaveBeenCalledWith("task-1", "dep-task");
      expect(onDataChanged).toHaveBeenCalled();
    });

    it("add-link com uma ponta num nó de projeto é bloqueado pelo interceptor", async () => {
      render(<GanttChart tasks={tasks} projects={projects} />);

      await triggerGanttEvent("add-link", {
        link: { source: `${GANTT_PROJECT_NODE_PREFIX}p1`, target: "task-1" },
      });

      expect(mockedCreateDependency).not.toHaveBeenCalled();
    });
  });
});
