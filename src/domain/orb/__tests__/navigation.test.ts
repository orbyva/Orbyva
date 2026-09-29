import { describe, expect, it } from "vitest";

import {
  buildOrbNavigationTarget,
  findOrbScreen,
  isOrbNavigablePath,
  isOrbNavigationTarget,
  matchOrbScreen,
  normalizeOrbFilterValue,
  ORB_SCREENS,
} from "../../../../supabase/functions/_shared/orb/navigation.ts";
import { runOrbTool } from "../../../../supabase/functions/_shared/orb/registry.ts";
import { fakeDb, type Recorded } from "./fakeDb";

const ctx = (db: ReturnType<typeof fakeDb>) => ({
  db,
  userId: "user-1",
  today: "2026-09-10",
  timezone: "America/Sao_Paulo",
});

/**
 * O catálogo de telas é contrato com TRÊS lados (a tool que monta a URL, o client que a valida e a
 * própria página que lê os parâmetros). Estes invariantes são o que impede uma tela nova de entrar
 * quebrada — um `path` sem barra ou um `:id` sem entidade só apareceria em produção.
 */
describe("catálogo de telas", () => {
  it("tem id e caminho únicos, e todo caminho começa com barra", () => {
    const ids = ORB_SCREENS.map((screen) => screen.id);
    expect(new Set(ids).size).toBe(ids.length);
    const paths = ORB_SCREENS.map((screen) => screen.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const screen of ORB_SCREENS) expect(screen.path.startsWith("/")).toBe(true);
  });

  it("só usa `:id` em tela que declara a entidade, e vice-versa", () => {
    for (const screen of ORB_SCREENS) {
      expect(screen.path.includes(":id")).toBe(Boolean(screen.entity));
    }
  });

  it("não repete parâmetro dentro da mesma tela", () => {
    for (const screen of ORB_SCREENS) {
      const params = screen.filters.map((filtro) => filtro.param);
      expect(new Set(params).size).toBe(params.length);
    }
  });

  it("todo apelido aponta para um valor que existe", () => {
    for (const screen of ORB_SCREENS) {
      for (const filtro of screen.filters) {
        for (const destino of Object.values(filtro.aliases ?? {})) {
          expect(filtro.values ?? []).toContain(destino);
        }
      }
    }
  });
});

describe("montagem do alvo", () => {
  const tarefas = findOrbScreen("tasks")!;

  it("monta a query só com o que a tela declara", () => {
    const alvo = buildOrbNavigationTarget({
      screen: tarefas,
      values: { project: "p-1", search: "piso", status: "pending", nature: "Despesa" },
      labels: { project: "Sacada" },
    });
    expect(alvo.path).toBe("/tasks?project=p-1&q=piso&status=pending");
    // `nature` não é filtro da tela de tarefas: some, em vez de virar parâmetro morto na URL.
    expect(alvo.path).not.toContain("nature");
    expect(alvo.label).toBe("Tarefas");
    expect(alvo.applied).toContain("project: Sacada");
  });

  it("traduz o vocabulário do modelo para o valor da tela", () => {
    const alvo = buildOrbNavigationTarget({ screen: tarefas, values: { status: "concluídas" } });
    expect(alvo.path).toBe("/tasks?status=done");
  });

  it("preenche o `:id` da tela de detalhe e nomeia o rótulo", () => {
    const alvo = buildOrbNavigationTarget({
      screen: findOrbScreen("trip_detail")!,
      entityId: "trip-9",
      entityLabel: "Chile",
    });
    expect(alvo.path).toBe("/travel/trip-9");
    expect(alvo.label).toBe("Viagem · Chile");
  });

  it("recusa montar tela de detalhe sem id", () => {
    expect(() => buildOrbNavigationTarget({ screen: findOrbScreen("note_detail")! })).toThrow();
  });

  it("escapa o valor do filtro", () => {
    const alvo = buildOrbNavigationTarget({ screen: tarefas, values: { search: "a&b=c" } });
    expect(alvo.path).toBe("/tasks?q=a%26b%3Dc");
    expect(isOrbNavigablePath(alvo.path)).toBe(true);
  });
});

describe("validação do lado do client", () => {
  it("aceita todo caminho que o próprio catálogo monta", () => {
    for (const screen of ORB_SCREENS) {
      const alvo = buildOrbNavigationTarget({
        screen,
        entityId: screen.entity ? "abc-123" : undefined,
        values: Object.fromEntries(
          screen.filters.map((filtro) => [filtro.field, filtro.values?.[0] ?? "texto"])
        ),
      });
      expect(isOrbNavigablePath(alvo.path)).toBe(true);
    }
  });

  it("recusa caminho de fora do catálogo, absoluto ou com parâmetro não declarado", () => {
    expect(isOrbNavigablePath("/ops")).toBe(false);
    expect(isOrbNavigablePath("//evil.example.com")).toBe(false);
    expect(isOrbNavigablePath("https://evil.example.com")).toBe(false);
    expect(isOrbNavigablePath("/tasks/../ops")).toBe(false);
    expect(isOrbNavigablePath("/tasks?token=abc")).toBe(false);
    expect(isOrbNavigablePath("/tasks?status=inventado")).toBe(false);
    expect(isOrbNavigablePath(42)).toBe(false);
  });

  it("casa tela de detalhe por segmento de id, não por qualquer coisa", () => {
    expect(matchOrbScreen("/travel/9f3")?.id).toBe("trip_detail");
    expect(matchOrbScreen("/travel/9f3/extra")).toBeUndefined();
  });

  it("só aceita alvo completo", () => {
    expect(isOrbNavigationTarget({ path: "/tasks", label: "Tarefas", screen: "tasks", applied: [] })).toBe(true);
    expect(isOrbNavigationTarget({ path: "/tasks", label: "Tarefas", screen: "tasks" })).toBe(false);
    expect(isOrbNavigationTarget({ path: "/ops", label: "x", screen: "y", applied: [] })).toBe(false);
    expect(isOrbNavigationTarget(null)).toBe(false);
  });
});

describe("normalizeOrbFilterValue", () => {
  it("devolve undefined quando o valor não pertence ao conjunto", () => {
    const filtro = findOrbScreen("tasks")!.filters.find((f) => f.field === "status")!;
    expect(normalizeOrbFilterValue(filtro, "done")).toBe("done");
    expect(normalizeOrbFilterValue(filtro, "DONE")).toBe("done");
    expect(normalizeOrbFilterValue(filtro, "quase")).toBeUndefined();
  });
});

describe("tool open_screen", () => {
  it("resolve o projeto pelo nome e devolve o caminho filtrado", async () => {
    const log: Recorded[] = [];
    const db = fakeDb({ project: [{ id: "p-7", name: "Sacada" }] }, log);
    const { ok, result } = await runOrbTool("open_screen", { screen: "tasks", project: "sacada" }, ctx(db));

    expect(ok).toBe(true);
    expect(result).toMatchObject({ path: "/tasks?project=p-7", screen: "tasks", label: "Tarefas" });
    // A consulta é escopada pelo dono, mesmo com o RLS ligado.
    expect(log[0].filters).toContainEqual(["eq:user_id", "user-1"]);
  });

  it("pede desempate quando o nome casa com mais de um projeto", async () => {
    const db = fakeDb({
      project: [
        { id: "p-1", name: "Sacada de trás" },
        { id: "p-2", name: "Sacada da frente" },
      ],
    });
    const { ok, result } = await runOrbTool("open_screen", { screen: "tasks", project: "sacada" }, ctx(db));
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toContain("Sacada de trás");
  });

  it("desempata sozinha quando um dos nomes é exato", async () => {
    const db = fakeDb({
      project: [
        { id: "p-1", name: "Casa" },
        { id: "p-2", name: "Casa nova" },
      ],
    });
    const { ok, result } = await runOrbTool("open_screen", { screen: "tasks", project: "casa" }, ctx(db));
    expect(ok).toBe(true);
    expect(result).toMatchObject({ path: "/tasks?project=p-1" });
  });

  it("recusa filtro que a tela não lê, dizendo o que ela aceita", async () => {
    const db = fakeDb({});
    const { ok, result } = await runOrbTool("open_screen", { screen: "budget", search: "mercado" }, ctx(db));
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toContain("não filtra por");
  });

  it("recusa tela inexistente", async () => {
    const db = fakeDb({});
    const { ok, result } = await runOrbTool("open_screen", { screen: "inventada" }, ctx(db));
    expect(ok).toBe(false);
    expect((result as { code: string }).code).toBe("input_invalido");
  });

  it("exige o item nas telas de detalhe", async () => {
    const db = fakeDb({});
    const { ok } = await runOrbTool("open_screen", { screen: "note_detail" }, ctx(db));
    expect(ok).toBe(false);
  });
});

/**
 * Feature 102 — `task` é o único parâmetro da tela de tarefas que NÃO recorta a lista: ele aponta
 * uma tarefa. É o que tira a Orb do `/tasks?q=<título>`, busca textual que erra quando o título se
 * repete (e recorrência materializa dezenas de tarefas com o mesmo nome).
 */
describe("`task` — destino por id na tela de tarefas (feature 102)", () => {
  const UUID = "6f1c2d3a-4b5e-4c7d-8e9f-0a1b2c3d4e5f";

  it("a tela de tarefas declara `task`, em texto livre e no FIM da lista", () => {
    const tarefas = findOrbScreen("tasks")!;
    const filtro = tarefas.filters.find((f) => f.field === "task");
    expect(filtro?.param).toBe("task");
    // Sem conjunto fechado: é um id, não um vocabulário.
    expect(filtro?.values).toBeUndefined();
    // Último da lista — inserir no meio muda o prefixo cacheado do prompt (regra de `registry.ts`).
    expect(tarefas.filters[tarefas.filters.length - 1].field).toBe("task");
    // E a descrição diz ao modelo que é id, e que abre em vez de filtrar.
    expect(filtro?.description).toMatch(/id/i);
    expect(filtro?.description).toMatch(/abre/i);
  });

  it("`open_screen` com o id monta `/tasks?task=<uuid>`", async () => {
    const db = fakeDb({});
    const { ok, result } = await runOrbTool("open_screen", { screen: "tasks", task: UUID }, ctx(db));

    expect(ok).toBe(true);
    expect(result).toMatchObject({ path: `/tasks?task=${UUID}`, screen: "tasks", label: "Tarefas" });
    // E o caminho que a tool montou passa pela validação do client, que é quem chama `navigate()`.
    expect(isOrbNavigablePath((result as { path: string }).path)).toBe(true);
  });

  it("o id soma com o recorte de projeto em vez de substituí-lo", async () => {
    const db = fakeDb({ project: [{ id: "p-7", name: "Sacada" }] });
    const { ok, result } = await runOrbTool(
      "open_screen",
      { screen: "tasks", project: "sacada", task: UUID },
      ctx(db)
    );

    expect(ok).toBe(true);
    expect(result).toMatchObject({ path: `/tasks?project=p-7&task=${UUID}` });
  });

  it("nenhuma outra tela aceita `task`", async () => {
    const db = fakeDb({});
    const { ok, result } = await runOrbTool("open_screen", { screen: "notes", task: UUID }, ctx(db));

    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toContain("não filtra por");
  });
});

/**
 * Feature 114 — `/notes?project=<id>`. Sem `project` no elenco de filtros da tela `notes`, a Orb
 * recusa ("a tela notes não filtra por project") e o recorte novo fica inalcançável por ela.
 */
describe("`project` na tela de notas (feature 114)", () => {
  it("a tela `notes` declara `project`, no FIM da lista de filtros", () => {
    const notas = findOrbScreen("notes")!;
    const filtro = notas.filters.find((f) => f.field === "project");
    expect(filtro?.param).toBe("project");
    // Último da lista: acrescentar no meio muda o prefixo cacheado do prompt (regra de `registry.ts`).
    expect(notas.filters[notas.filters.length - 1].field).toBe("project");
    // A busca livre, que já existia, continua lá — o filtro novo soma, não substitui.
    expect(notas.filters.some((f) => f.field === "search")).toBe(true);
  });

  it("`open_screen` resolve o projeto pelo nome e monta `/notes?project=<id>`", async () => {
    const db = fakeDb({ project: [{ id: "p-7", name: "Obra da casa" }] });
    const { ok, result } = await runOrbTool(
      "open_screen",
      { screen: "notes", project: "obra da casa" },
      ctx(db)
    );

    expect(ok).toBe(true);
    expect(result).toMatchObject({ path: "/notes?project=p-7", screen: "notes", label: "Notas" });
    // E o caminho que a tool montou passa pela validação do client, que é quem chama `navigate()`.
    expect(isOrbNavigablePath((result as { path: string }).path)).toBe(true);
  });

  it("o recorte soma com a busca livre em vez de substituí-la", async () => {
    const db = fakeDb({ project: [{ id: "p-7", name: "Obra da casa" }] });
    const { ok, result } = await runOrbTool(
      "open_screen",
      { screen: "notes", project: "obra da casa", search: "pauta" },
      ctx(db)
    );

    expect(ok).toBe(true);
    expect(result).toMatchObject({ path: "/notes?q=pauta&project=p-7" });
  });

  it("filtro que a tela de notas continua não aceitando segue recusado", async () => {
    const db = fakeDb({});
    const { ok, result } = await runOrbTool(
      "open_screen",
      { screen: "notes", status: "done" },
      ctx(db)
    );

    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toContain("não filtra por");
  });
});
