import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_SORT_KEY,
  TASK_SORT_KEYS,
  TASK_SORT_LABELS,
  filterTasks,
  isTaskSortKey,
  sortTasksBy,
  sortTasksByDueDate,
  sortTasksByUpdatedAtDesc,
} from "@/domain/tasks/filters";

type Row = {
  id: string;
  project_id: string | null;
  tag_ids: string[];
  due_date: string | null;
  priority?: "low" | "medium" | "high" | null;
};

const rows: Row[] = [
  { id: "1", project_id: "p1", tag_ids: ["casa"], due_date: "2026-08-10", priority: "high" },
  { id: "2", project_id: "p2", tag_ids: ["trabalho"], due_date: "2026-08-05", priority: "low" },
  { id: "3", project_id: null, tag_ids: ["casa", "urgente"], due_date: null, priority: null },
];

describe("filterTasks", () => {
  it("filtra por projeto", () => {
    expect(filterTasks(rows, { projectId: "p1" }).map((r) => r.id)).toEqual(["1"]);
  });

  it("filtra por tag", () => {
    expect(filterTasks(rows, { tagId: "casa" }).map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("filtra por prazo até uma data", () => {
    expect(filterTasks(rows, { dueBefore: "2026-08-09" }).map((r) => r.id)).toEqual(["2"]);
  });

  it("sem filtro retorna tudo", () => {
    expect(filterTasks(rows, {})).toHaveLength(3);
  });

  it("filtra por projeto null (sem projeto)", () => {
    expect(filterTasks(rows, { projectId: null }).map((r) => r.id)).toEqual(["3"]);
  });

  it("filtra por prioridade", () => {
    expect(filterTasks(rows, { priority: "high" }).map((r) => r.id)).toEqual(["1"]);
  });
});

describe("sortTasksByDueDate", () => {
  it("ordena por prazo, sem prazo por último", () => {
    expect(sortTasksByDueDate(rows).map((r) => r.id)).toEqual(["2", "1", "3"]);
  });
});

describe("sortTasksByUpdatedAtDesc", () => {
  type UpdatedRow = { id: string; updated_at?: string | null; created_at?: string | null };

  it("ordena por updated_at, mais recente primeiro", () => {
    const list: UpdatedRow[] = [
      { id: "a", updated_at: "2026-08-10T10:00:00Z" },
      { id: "b", updated_at: "2026-08-12T10:00:00Z" },
      { id: "c", updated_at: "2026-08-11T10:00:00Z" },
    ];
    expect(sortTasksByUpdatedAtDesc(list).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("empate de updated_at é resolvido por created_at desc", () => {
    const list: UpdatedRow[] = [
      { id: "a", updated_at: "2026-08-12T10:00:00Z", created_at: "2026-08-01T00:00:00Z" },
      { id: "b", updated_at: "2026-08-12T10:00:00Z", created_at: "2026-08-05T00:00:00Z" },
    ];
    expect(sortTasksByUpdatedAtDesc(list).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("empate total é resolvido por id, com ordem estável entre chamadas", () => {
    const stamp = { updated_at: "2026-08-12T10:00:00Z", created_at: "2026-08-01T00:00:00Z" };
    const list: UpdatedRow[] = [
      { id: "c", ...stamp },
      { id: "a", ...stamp },
      { id: "b", ...stamp },
    ];
    const first = sortTasksByUpdatedAtDesc(list).map((r) => r.id);
    const second = sortTasksByUpdatedAtDesc([...list].reverse()).map((r) => r.id);
    expect(first).toEqual(["a", "b", "c"]);
    expect(second).toEqual(first);
  });

  it("compara instantes iguais escritos com sufixos diferentes (Z e +00:00)", () => {
    const list: UpdatedRow[] = [
      { id: "b", updated_at: "2026-08-12T10:00:00+00:00", created_at: "2026-08-01T00:00:00Z" },
      { id: "a", updated_at: "2026-08-12T10:00:00Z", created_at: "2026-08-02T00:00:00Z" },
    ];
    // Mesmo instante: quem decide é o `created_at` desc, não a forma do texto.
    expect(sortTasksByUpdatedAtDesc(list).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("sem updated_at cai para created_at", () => {
    const list: UpdatedRow[] = [
      { id: "a", updated_at: "2026-08-10T10:00:00Z" },
      { id: "b", created_at: "2026-08-15T10:00:00Z" },
    ];
    expect(sortTasksByUpdatedAtDesc(list).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("sem updated_at nem created_at vai para o fim", () => {
    const list: UpdatedRow[] = [
      { id: "sem-carimbo" },
      { id: "invalido", updated_at: "nao-e-data" },
      { id: "a", updated_at: "2026-08-10T10:00:00Z" },
    ];
    expect(sortTasksByUpdatedAtDesc(list).map((r) => r.id)).toEqual([
      "a",
      "invalido",
      "sem-carimbo",
    ]);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(sortTasksByUpdatedAtDesc([])).toEqual([]);
  });

  it("não muta o array de entrada", () => {
    const list: UpdatedRow[] = [
      { id: "a", updated_at: "2026-08-10T10:00:00Z" },
      { id: "b", updated_at: "2026-08-12T10:00:00Z" },
    ];
    const sorted = sortTasksByUpdatedAtDesc(list);
    expect(list.map((r) => r.id)).toEqual(["a", "b"]);
    expect(sorted).not.toBe(list);
  });
});

describe("sortTasksBy", () => {
  type SortRow = {
    id: string;
    due_date: string | null;
    updated_at?: string | null;
    created_at?: string | null;
  };

  // A ordem por prazo e a ordem por atualização são deliberadamente opostas aqui: assim o teste
  // prova que o despacho escolheu o comparador certo, não que os dois coincidem por acaso.
  const list: SortRow[] = [
    { id: "a", due_date: "2026-08-01", updated_at: "2026-08-10T10:00:00Z" },
    { id: "b", due_date: "2026-08-02", updated_at: "2026-08-11T10:00:00Z" },
    { id: "c", due_date: "2026-08-03", updated_at: "2026-08-12T10:00:00Z" },
  ];

  it('"updated" ordena por última atualização, mais recente primeiro', () => {
    expect(sortTasksBy("updated", list).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it('"due" mantém o comportamento antigo (prazo ascendente)', () => {
    expect(sortTasksBy("due", list).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(sortTasksBy("due", list)).toEqual(sortTasksByDueDate(list));
  });

  it("não muta o array de entrada em nenhuma das chaves", () => {
    sortTasksBy("updated", list);
    sortTasksBy("due", list);
    expect(list.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("o padrão de fábrica é ordenar por última atualização", () => {
    expect(DEFAULT_TASK_SORT_KEY).toBe("updated");
    expect(sortTasksBy(DEFAULT_TASK_SORT_KEY, list).map((r) => r.id)).toEqual(
      sortTasksByUpdatedAtDesc(list).map((r) => r.id)
    );
  });

  it("expõe as duas opções, na ordem do seletor, com rótulo por extenso", () => {
    expect([...TASK_SORT_KEYS]).toEqual(["updated", "due"]);
    expect(TASK_SORT_LABELS.updated).toBe("Última atualização");
    expect(TASK_SORT_LABELS.due).toBe("Prazo");
  });

  it("isTaskSortKey aceita só as chaves conhecidas", () => {
    expect(isTaskSortKey("updated")).toBe(true);
    expect(isTaskSortKey("due")).toBe(true);
    expect(isTaskSortKey("priority")).toBe(false);
    expect(isTaskSortKey(null)).toBe(false);
    expect(isTaskSortKey(undefined)).toBe(false);
    expect(isTaskSortKey(1)).toBe(false);
  });
});
