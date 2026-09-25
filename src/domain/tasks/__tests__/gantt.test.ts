import { describe, expect, it, vi } from "vitest";
import {
  buildGanttLinks,
  buildGanttNodes,
  computeProjectRollup,
  jumpToGanttZoomLevel,
  resolveTaskDateUpdates,
  resolveTaskScheduleUpdate,
  type GanttNode,
  type GanttTaskInput,
  type GanttZoomApi,
} from "@/domain/tasks/gantt";

function task(overrides: Partial<GanttTaskInput> & Pick<GanttTaskInput, "id" | "title">): GanttTaskInput {
  return {
    status: "todo",
    parent_task_id: null,
    project_id: null,
    start_date: null,
    due_date: null,
    ...overrides,
  };
}

function todayAnchorStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

function todayAnchorEnd(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
}

describe("buildGanttNodes", () => {
  it("tarefa de topo sem projeto vira nó com parent 0", () => {
    const { nodes } = buildGanttNodes(
      [],
      [task({ id: "1", title: "Solo", due_date: "2026-08-10" })]
    );
    expect(nodes).toEqual([
      {
        id: "1",
        text: "Solo",
        start: new Date(2026, 7, 10, 12),
        end: new Date(2026, 7, 10, 12),
        type: "task",
        parent: 0,
        open: false,
        progress: 0,
        hasPlannedDate: true,
        icon_key: null,
        icon_url: null,
      },
    ]);
  });

  it("nó sem filhos vem com open:false (open:true num nó sem `data` crasha a lib)", () => {
    const projects = [{ id: "p1", name: "Projeto 1" }];
    const { nodes } = buildGanttNodes(projects, [
      task({ id: "1", title: "Sem subtarefa", project_id: "p1", due_date: "2026-08-10" }),
    ]);
    const taskNode = nodes.find((n) => n.id === "1");
    expect(taskNode?.open).toBe(false);
  });

  it("tarefa de topo com subtarefa vem com open:true; a subtarefa (sem filhos) vem com open:false", () => {
    const { nodes } = buildGanttNodes(
      [],
      [
        task({ id: "parent", title: "Pai", due_date: "2026-08-10" }),
        task({ id: "child", title: "Filho", parent_task_id: "parent", due_date: "2026-08-11" }),
      ]
    );
    expect(nodes.find((n) => n.id === "parent")?.open).toBe(true);
    expect(nodes.find((n) => n.id === "child")?.open).toBe(false);
  });

  it("subtarefas irmãs saem por prazo, depois prioridade, depois criação", () => {
    const { nodes } = buildGanttNodes(
      [],
      [
        task({ id: "parent", title: "Pai", due_date: "2026-09-30" }),
        task({
          id: "undated-high",
          title: "Alta",
          parent_task_id: "parent",
          due_date: null,
          priority: "high",
        }),
        task({
          id: "dated-late",
          title: "Prazo tarde",
          parent_task_id: "parent",
          due_date: "2026-09-20",
        }),
        task({
          id: "dated-soon",
          title: "Prazo cedo",
          parent_task_id: "parent",
          due_date: "2026-09-10",
        }),
        task({
          id: "undated-old",
          title: "Antiga",
          parent_task_id: "parent",
          due_date: null,
          created_at: "2026-01-01T00:00:00Z",
        }),
      ]
    );
    const childIds = nodes.filter((n) => n.parent === "parent").map((n) => n.id);
    expect(childIds).toEqual(["dated-soon", "dated-late", "undated-high", "undated-old"]);
  });

  it("tarefa sem nenhuma data aparece com data-âncora (hoje até amanhã, 1 dia de largura real) e hasPlannedDate:false", () => {
    const { nodes } = buildGanttNodes([], [task({ id: "1", title: "Sem data" })]);
    expect(nodes).toHaveLength(1);
    const [node] = nodes;
    expect(node.start).toEqual(todayAnchorStart());
    expect(node.end).toEqual(todayAnchorEnd());
    expect(node.hasPlannedDate).toBe(false);
  });

  it("projeto aparece se tiver ao menos uma tarefa de topo, mesmo sem data; some se não tiver tarefa nenhuma", () => {
    const projects = [
      { id: "p1", name: "Projeto 1 (com data)" },
      { id: "p2", name: "Projeto 2 (sem data)" },
      { id: "p3", name: "Projeto 3 (vazio)" },
    ];
    const { nodes } = buildGanttNodes(projects, [
      task({ id: "1", title: "Com data", project_id: "p1", due_date: "2026-08-10" }),
      task({ id: "2", title: "Sem data", project_id: "p2" }),
    ]);
    const projectNodes = nodes.filter((n) => n.type === "summary");
    expect(projectNodes.map((n) => n.id).sort()).toEqual(["project:p1", "project:p2"]);
    expect(nodes.find((n) => n.id === "1")?.parent).toBe("project:p1");
    const untimedTaskNode = nodes.find((n) => n.id === "2");
    expect(untimedTaskNode?.parent).toBe("project:p2");
    expect(untimedTaskNode?.hasPlannedDate).toBe(false);
  });

  it("subtarefa aparece indentada sob tarefa-pai, com data-âncora quando não tem data própria", () => {
    const { nodes } = buildGanttNodes(
      [],
      [
        task({ id: "parent", title: "Pai", due_date: "2026-08-10" }),
        task({ id: "child", title: "Filho", parent_task_id: "parent" }),
      ]
    );
    const child = nodes.find((n) => n.id === "child");
    expect(child).toBeDefined();
    expect(child?.parent).toBe("parent");
    expect(child?.start).toEqual(todayAnchorStart());
    expect(child?.end).toEqual(todayAnchorEnd());
    expect(child?.hasPlannedDate).toBe(false);
  });

  it("subtarefa aparece mesmo se a tarefa-pai não tiver data (ambas ganham nó com data-âncora quando faltar data própria)", () => {
    const { nodes } = buildGanttNodes(
      [],
      [
        task({ id: "parent", title: "Pai sem data" }),
        task({ id: "child", title: "Filho", parent_task_id: "parent", due_date: "2026-08-10" }),
      ]
    );
    const parent = nodes.find((n) => n.id === "parent");
    const child = nodes.find((n) => n.id === "child");
    expect(parent?.hasPlannedDate).toBe(false);
    expect(child).toBeDefined();
    expect(child?.hasPlannedDate).toBe(true);
  });

  it("tarefa concluída tem progress 100", () => {
    const { nodes } = buildGanttNodes(
      [],
      [task({ id: "1", title: "Feita", status: "done", due_date: "2026-08-10" })]
    );
    expect(nodes[0].progress).toBe(100);
  });

  it("tarefa só com start_date usa a mesma data pra start e end", () => {
    const { nodes } = buildGanttNodes(
      [],
      [task({ id: "1", title: "Só início", start_date: "2026-08-05" })]
    );
    expect(nodes[0].start).toEqual(new Date(2026, 7, 5, 12));
    expect(nodes[0].end).toEqual(new Date(2026, 7, 5, 12));
    expect(nodes[0].hasPlannedDate).toBe(true);
  });

  it("duas datas presentes + estimated_duration: duração é ignorada (nunca sobrescreve datas explícitas)", () => {
    const { nodes } = buildGanttNodes(
      [],
      [
        task({
          id: "1",
          title: "Com prazo e início",
          start_date: "2026-08-05",
          due_date: "2026-08-10",
          estimated_duration: 24 * 60, // 1 dia, discrepante do intervalo real (5 dias)
        }),
      ]
    );
    expect(nodes[0].start).toEqual(new Date(2026, 7, 5, 12));
    expect(nodes[0].end).toEqual(new Date(2026, 7, 10, 12));
    expect(nodes[0].hasPlannedDate).toBe(true);
  });

  it("só start_date + estimated_duration: due_date derivado como start + dias(duração)", () => {
    const { nodes } = buildGanttNodes(
      [],
      [
        task({
          id: "1",
          title: "Início + duração",
          start_date: "2026-08-05",
          estimated_duration: 3 * 24 * 60, // 3 dias
        }),
      ]
    );
    expect(nodes[0].start).toEqual(new Date(2026, 7, 5, 12));
    expect(nodes[0].end).toEqual(new Date(2026, 7, 8, 12));
    // start_date é uma data real definida pelo usuário — hasPlannedDate reflete isso mesmo com o
    // due_date derivado da duração.
    expect(nodes[0].hasPlannedDate).toBe(true);
  });

  it("só due_date + estimated_duration: start_date derivado como due − dias(duração)", () => {
    const { nodes } = buildGanttNodes(
      [],
      [
        task({
          id: "1",
          title: "Prazo + duração",
          due_date: "2026-08-10",
          estimated_duration: 2 * 24 * 60, // 2 dias
        }),
      ]
    );
    expect(nodes[0].start).toEqual(new Date(2026, 7, 8, 12));
    expect(nodes[0].end).toEqual(new Date(2026, 7, 10, 12));
    // due_date é uma data real definida pelo usuário — hasPlannedDate reflete isso mesmo com o
    // start_date derivado da duração.
    expect(nodes[0].hasPlannedDate).toBe(true);
  });

  it("nenhuma data + estimated_duration: âncora de hoje com a largura da duração (não mais fixa em 1 dia)", () => {
    const { nodes } = buildGanttNodes(
      [],
      [task({ id: "1", title: "Só duração", estimated_duration: 5 * 24 * 60 })] // 5 dias
    );
    expect(nodes[0].start).toEqual(todayAnchorStart());
    const expectedEnd = todayAnchorStart();
    expectedEnd.setDate(expectedEnd.getDate() + 5);
    expect(nodes[0].end).toEqual(expectedEnd);
    expect(nodes[0].hasPlannedDate).toBe(false);
  });
});

describe("computeProjectRollup", () => {
  it("retorna null quando não há tarefas", () => {
    expect(computeProjectRollup([])).toBeNull();
  });

  it("1 tarefa: start/end da própria tarefa, progress 0 (pendente) ou 100 (concluída)", () => {
    expect(
      computeProjectRollup([task({ id: "1", title: "Só uma", due_date: "2026-08-10" })])
    ).toEqual({ start: "2026-08-10", end: "2026-08-10", progress: 0 });

    expect(
      computeProjectRollup([
        task({ id: "1", title: "Só uma", status: "done", due_date: "2026-08-10" }),
      ])
    ).toEqual({ start: "2026-08-10", end: "2026-08-10", progress: 100 });
  });

  it("várias tarefas com datas diferentes: start é a menor, end é a maior", () => {
    const rollup = computeProjectRollup([
      task({ id: "1", title: "Meio", start_date: "2026-08-05", due_date: "2026-08-08" }),
      task({ id: "2", title: "Mais cedo", due_date: "2026-08-01" }),
      task({ id: "3", title: "Mais tarde", due_date: "2026-08-20" }),
    ]);
    expect(rollup).toEqual({ start: "2026-08-01", end: "2026-08-20", progress: 0 });
  });

  it("tarefas concluídas/pendentes misturadas: progress é a % de concluídas, arredondado", () => {
    const rollup = computeProjectRollup([
      task({ id: "1", title: "A", status: "done", due_date: "2026-08-01" }),
      task({ id: "2", title: "B", status: "todo", due_date: "2026-08-02" }),
      task({ id: "3", title: "C", status: "doing", due_date: "2026-08-03" }),
    ]);
    // 1/3 = 33.33...% arredondado pra 33
    expect(rollup).toEqual({ start: "2026-08-01", end: "2026-08-03", progress: 33 });
  });
});

describe("buildGanttNodes — modo by-project vs by-task", () => {
  const projects = [{ id: "p1", name: "Projeto 1" }];

  it("by-task (padrão): nó de projeto vem aberto, sem start/end/progress calculados", () => {
    const { nodes } = buildGanttNodes(projects, [
      task({ id: "1", title: "T1", project_id: "p1", due_date: "2026-08-10" }),
    ]);
    const projectNode = nodes.find((n) => n.type === "summary");
    expect(projectNode?.open).toBe(true);
    expect(projectNode?.start).toBeUndefined();
    expect(projectNode?.end).toBeUndefined();
    expect(projectNode?.progress).toBeUndefined();
  });

  it("by-project: nó de projeto vem fechado, com start/end/progress do rollup das tarefas de topo", () => {
    const { nodes } = buildGanttNodes(
      projects,
      [
        task({
          id: "1",
          title: "T1",
          project_id: "p1",
          status: "done",
          start_date: "2026-08-01",
          due_date: "2026-08-05",
        }),
        task({ id: "2", title: "T2", project_id: "p1", due_date: "2026-08-15" }),
      ],
      "by-project"
    );
    const projectNode = nodes.find((n) => n.type === "summary");
    expect(projectNode?.open).toBe(false);
    expect(projectNode?.start).toEqual(new Date(2026, 7, 1, 12));
    expect(projectNode?.end).toEqual(new Date(2026, 7, 15, 12));
    expect(projectNode?.progress).toBe(50);
  });

  it("by-project: tarefas continuam com seus próprios nós (expandir o projeto ainda mostra elas)", () => {
    const { nodes } = buildGanttNodes(
      projects,
      [task({ id: "1", title: "T1", project_id: "p1", due_date: "2026-08-10" })],
      "by-project"
    );
    const taskNode = nodes.find((n) => n.id === "1");
    expect(taskNode?.type).toBe("task");
    expect(taskNode?.parent).toBe("project:p1");
  });
});

describe("buildGanttNodes — marcos (is_milestone)", () => {
  it("tarefa com is_milestone vira nó type:'milestone' com start === end na data de prazo", () => {
    const { nodes } = buildGanttNodes(
      [],
      [task({ id: "1", title: "Entrega", is_milestone: true, due_date: "2026-08-20" })]
    );
    const [node] = nodes;
    expect(node.type).toBe("milestone");
    expect(node.start).toEqual(new Date(2026, 7, 20, 12));
    expect(node.end).toEqual(new Date(2026, 7, 20, 12));
    expect(node.hasPlannedDate).toBe(true);
  });

  it("marco sem due_date usa a data-âncora de hoje (mesma lógica de fallback das tarefas normais)", () => {
    const { nodes } = buildGanttNodes(
      [],
      [task({ id: "1", title: "Marco sem data", is_milestone: true })]
    );
    const [node] = nodes;
    expect(node.type).toBe("milestone");
    expect(node.hasPlannedDate).toBe(false);
    expect(node.start).toEqual(node.end);
  });

  it("marco ignora estimated_duration (start/end colapsam na mesma data mesmo com duração setada)", () => {
    const { nodes } = buildGanttNodes(
      [],
      [
        task({
          id: "1",
          title: "Marco com duração",
          is_milestone: true,
          due_date: "2026-08-20",
          estimated_duration: 5 * 24 * 60,
        }),
      ]
    );
    const [node] = nodes;
    expect(node.start).toEqual(new Date(2026, 7, 20, 12));
    expect(node.end).toEqual(new Date(2026, 7, 20, 12));
  });

  it("tarefa normal (is_milestone false/ausente) continua com type:'task'", () => {
    const { nodes } = buildGanttNodes(
      [],
      [task({ id: "1", title: "Normal", due_date: "2026-08-10" })]
    );
    expect(nodes[0].type).toBe("task");
  });
});

describe("resolveTaskDateUpdates", () => {
  it("tarefa arrastada com start/end válidos (ex.: barra-âncora movida) grava start_date e due_date reais", () => {
    const updates = resolveTaskDateUpdates({
      start: new Date(2026, 7, 20, 12),
      end: new Date(2026, 7, 22, 12),
    });
    expect(updates).toEqual({ start_date: "2026-08-20", due_date: "2026-08-22" });
  });

  it("só start presente grava só start_date", () => {
    const updates = resolveTaskDateUpdates({ start: new Date(2026, 7, 20, 12) });
    expect(updates).toEqual({ start_date: "2026-08-20" });
  });

  it("retorna null quando start é um Invalid Date (nunca deixa NaN-NaN-NaN sair pro back-end)", () => {
    const updates = resolveTaskDateUpdates({
      start: new Date(NaN),
      end: new Date(2026, 7, 22, 12),
    });
    expect(updates).toBeNull();
  });

  it("retorna null quando end é um Invalid Date", () => {
    const updates = resolveTaskDateUpdates({
      start: new Date(2026, 7, 20, 12),
      end: new Date(NaN),
    });
    expect(updates).toBeNull();
  });

  it("nem start nem end presentes retorna objeto vazio (chamador decide não persistir)", () => {
    expect(resolveTaskDateUpdates({})).toEqual({});
  });
});

describe("resolveTaskScheduleUpdate", () => {
  it("(a) tarefa só com prazo + duração: agenda efetiva usada como base pra redimensionar tem início em prazo − duração", () => {
    // Confirma que a base de comparação é a agenda *efetiva* (resolveTaskSchedule), não só as
    // colunas reais — aqui só due_date + estimated_duration existem no banco.
    const original = { start_date: null, due_date: "2026-08-10", estimated_duration: 2 * 24 * 60 }; // início efetivo = 2026-08-08
    const dateUpdates = { start_date: "2026-08-05" }; // redimensiona a borda esquerda mais pra fora
    const updates = resolveTaskScheduleUpdate(original, dateUpdates);
    // due_date não veio no evento (só a borda esquerda moveu) → duração recalculada a partir da
    // agenda efetiva (due permanece 2026-08-10, o real do banco).
    expect(updates).toEqual({ start_date: "2026-08-05", estimated_duration: 5 * 24 * 60 });
  });

  it("(b) mover a barra inteira (start e due deslocam pelo mesmo delta) preserva a duração — não inclui estimated_duration no update", () => {
    const original = { start_date: "2026-08-05", due_date: "2026-08-08", estimated_duration: null };
    const dateUpdates = { start_date: "2026-08-10", due_date: "2026-08-13" }; // ambos +5 dias
    const updates = resolveTaskScheduleUpdate(original, dateUpdates);
    expect(updates).toEqual({ start_date: "2026-08-10", due_date: "2026-08-13" });
  });

  it("(c) redimensionar só a borda direita (due muda, start igual) recalcula estimated_duration", () => {
    const original = { start_date: "2026-08-05", due_date: "2026-08-08", estimated_duration: null };
    const dateUpdates = { due_date: "2026-08-12" }; // só o end veio no evento (start não mudou)
    const updates = resolveTaskScheduleUpdate(original, dateUpdates);
    expect(updates).toEqual({ due_date: "2026-08-12", estimated_duration: 7 * 24 * 60 });
  });

  it("(c) redimensionar só a borda esquerda (start muda, due igual) recalcula estimated_duration", () => {
    const original = { start_date: "2026-08-05", due_date: "2026-08-08", estimated_duration: null };
    const dateUpdates = { start_date: "2026-08-06" }; // só o start veio no evento (end não mudou)
    const updates = resolveTaskScheduleUpdate(original, dateUpdates);
    expect(updates).toEqual({ start_date: "2026-08-06", estimated_duration: 2 * 24 * 60 });
  });

  it("as duas pontas mudam por deltas diferentes (rede de segurança): também recalcula duração", () => {
    const original = { start_date: "2026-08-05", due_date: "2026-08-08", estimated_duration: null };
    const dateUpdates = { start_date: "2026-08-06", due_date: "2026-08-12" };
    const updates = resolveTaskScheduleUpdate(original, dateUpdates);
    expect(updates).toEqual({ start_date: "2026-08-06", due_date: "2026-08-12", estimated_duration: 6 * 24 * 60 });
  });

  it("nem start nem due presentes no update retorna só o que veio (nada pra recalcular)", () => {
    const original = { start_date: "2026-08-05", due_date: "2026-08-08", estimated_duration: null };
    expect(resolveTaskScheduleUpdate(original, {})).toEqual({});
  });
});

describe("buildGanttLinks", () => {
  const nodes: GanttNode[] = [
    { id: "a", text: "A", type: "task", parent: 0, open: false },
    { id: "b", text: "B", type: "task", parent: 0, open: false },
  ];

  it("converte task_dependency (X depende de Y) em link end-to-start Y→X", () => {
    const links = buildGanttLinks([{ task_id: "a", depends_on_task_id: "b" }], nodes);
    expect(links).toEqual([{ id: "b->a", source: "b", target: "a", type: "e2s" }]);
  });

  it("descarta dependência com um lado fora dos nós visíveis", () => {
    const links = buildGanttLinks([{ task_id: "a", depends_on_task_id: "outro" }], nodes);
    expect(links).toEqual([]);
  });

  it("lista vazia sem dependências", () => {
    expect(buildGanttLinks([], nodes)).toEqual([]);
  });
});

/** Mock de `GanttZoomApi` que simula o comportamento real de `zoom-scale` (achado lendo
 * `@svar-ui/gantt-store/dist/index.js`): o nível só muda quando a largura de célula recalculada
 * sai da faixa `[minCellWidth, maxCellWidth]` do nível atual — o que pode levar mais de uma
 * chamada pra acontecer, já que a largura usada no cálculo cresce a cada chamada (efeito
 * composto). `crossThreshold` controla depois de quantas chamadas consecutivas (sem trocar de
 * nível real) a largura simulada finalmente cruza a faixa e o nível muda de fato. */
function createZoomApiMock(initialLevel: number, crossThreshold: number): GanttZoomApi & { execCalls: number[] } {
  let level = initialLevel;
  let callsSinceLastChange = 0;
  const execCalls: number[] = [];
  return {
    execCalls,
    getState: () => ({ zoom: { level } }),
    exec: vi.fn(async (_action, { dir }) => {
      execCalls.push(dir);
      callsSinceLastChange += 1;
      if (callsSinceLastChange >= crossThreshold) {
        level += dir;
        callsSinceLastChange = 0;
      }
      return undefined;
    }),
  };
}

describe("jumpToGanttZoomLevel", () => {
  it("já no nível alvo: não chama exec", async () => {
    const api = createZoomApiMock(2, 1);
    await jumpToGanttZoomLevel(api, 2);
    expect(api.exec).not.toHaveBeenCalled();
  });

  it("uma chamada já cruza a faixa (delta grande): salta direto pro nível alvo numa chamada só", async () => {
    const api = createZoomApiMock(0, 1); // crossThreshold 1: toda chamada muda o nível
    await jumpToGanttZoomLevel(api, 3);
    expect(api.execCalls).toEqual([3]); // dir = target(3) - current(0)
    expect(api.getState().zoom?.level).toBe(3);
  });

  it("delta pequeno não cruza a faixa de primeira: repete recalculando dir até convergir", async () => {
    const api = createZoomApiMock(0, 3); // só muda de nível na 3ª chamada consecutiva
    await jumpToGanttZoomLevel(api, 1);
    // como o nível real só muda na 3ª chamada, `dir` recalculado continua 1 - 0 = 1 em cada volta
    expect(api.execCalls).toEqual([1, 1, 1]);
    expect(api.getState().zoom?.level).toBe(1);
  });

  it("nunca converge: para em maxAttempts em vez de loop infinito", async () => {
    const api = createZoomApiMock(0, 1000); // nunca cruza a faixa dentro do limite de tentativas
    await jumpToGanttZoomLevel(api, 1, 5);
    expect(api.exec).toHaveBeenCalledTimes(5);
    expect(api.getState().zoom?.level).toBe(0); // não convergiu, mas não travou
  });
});
