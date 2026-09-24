import { describe, expect, it } from "vitest";

import { orbResultView, ORB_TOOLS_COM_CARTAO } from "../results";
import { orbTools } from "../../../../supabase/functions/_shared/orb/registry.ts";

describe("orbResultView", () => {
  it("só adapta tool que existe no catálogo", () => {
    const nomes = new Set(orbTools.map((tool) => tool.name));
    for (const nome of ORB_TOOLS_COM_CARTAO) expect(nomes.has(nome)).toBe(true);
  });

  it("vira cartão de tarefa com prazo, prioridade e atraso", () => {
    const view = orbResultView("query_tasks", {
      tasks: [
        {
          id: "t-1",
          title: "Comprar cimento",
          status: "todo",
          due_date: "2026-09-10",
          due_time: "09:30:00",
          priority: "high",
          overdue: true,
          estimated_duration_minutes: 45,
        },
      ],
    });
    expect(view?.kind).toBe("cards");
    const item = view?.kind === "cards" ? view.items[0] : null;
    expect(item?.title).toBe("Comprar cimento");
    expect(item?.subtitle).toBe("10/09/2026 · 09:30");
    expect(item?.meta).toBe("45 min");
    expect(item?.badges?.map((badge) => badge.label)).toEqual(["A fazer", "Alta", "Atrasada"]);
    expect(item?.to).toBe("/tasks?q=Comprar%20cimento");
  });

  it("usa a imagem só de UI no carrossel de filmes", () => {
    const view = orbResultView("query_movies", {
      movies: [{ imdb_id: "tt1", title: "Duna", year: 2021, status: "to_watch", ui_poster: "https://x/p.jpg" }],
    });
    expect(view?.kind).toBe("carousel");
    if (view?.kind !== "carousel") throw new Error("esperava carrossel");
    expect(view.items[0]).toMatchObject({ image: "https://x/p.jpg", badge: { label: "Quero ver" } });
  });

  it("marca o orçamento estourado no tom de erro", () => {
    const view = orbResultView("query_budget_status", {
      month: "2026-09",
      budgets: [
        { class_name: "Mercado", planned_value: 800, spent_value: 950, percentage_used: 118, status: "ESTOUROU" },
      ],
    });
    if (view?.kind !== "grouped_bars") throw new Error("esperava barras agrupadas");
    expect(view.groups[0].items[0].tone).toBe("erro");
    expect(view.groups[0].items[0].ratio).toBeGreaterThan(1);
  });

  it("agrupa o orçamento por nível (type) com subnível (class)", () => {
    const view = orbResultView("query_budget_status", {
      month: "2026-09",
      budgets: [
        {
          type_name: "Alimentação",
          class_name: "Mercado",
          planned_value: 800,
          spent_value: 400,
          status: "OK",
        },
        {
          type_name: "Alimentação",
          class_name: "Delivery",
          planned_value: 200,
          spent_value: 50,
          status: "OK",
        },
        {
          type_name: "Moradia",
          class_name: "Aluguel",
          planned_value: 2000,
          spent_value: 2000,
          status: "OK",
        },
      ],
    });
    if (view?.kind !== "grouped_bars") throw new Error("esperava barras agrupadas");
    expect(view.groups).toHaveLength(2);
    expect(view.groups[0]).toMatchObject({ title: "Alimentação" });
    expect(view.groups[0].items.map((item) => item.label)).toEqual(["Mercado", "Delivery"]);
    expect(view.groups[1]).toMatchObject({ title: "Moradia" });
    expect(view.groups[1].items[0].label).toBe("Aluguel");
  });

  it("separa receita de despesa pelo tom do valor", () => {
    const view = orbResultView("query_transactions", {
      transactions: [
        { id: "x", date: "2026-09-01T12:00:00Z", description: "Salário", value: 5000, nature: "Receita" },
        { id: "y", date: "2026-09-02T12:00:00Z", description: "Mercado", value: 240.5, nature: "Despesa" },
      ],
    });
    if (view?.kind !== "rows") throw new Error("esperava linhas");
    expect(view.items[0].valueTone).toBe("ok");
    expect(view.items[1].valueTone).toBe("erro");
    expect(view.items[1].value).toContain("240,50");
  });

  it("transforma a navegação num atalho para a tela aberta", () => {
    const view = orbResultView("open_screen", {
      path: "/tasks?project=p-1",
      label: "Tarefas · Sacada",
      screen: "tasks",
      applied: ["project: Sacada"],
    });
    if (view?.kind !== "rows") throw new Error("esperava linhas");
    expect(view.items[0].to).toBe("/tasks?project=p-1");
    expect(view.items[0].subtitle).toBe("project: Sacada");
  });

  it("devolve null para resultado resumido, lista vazia ou tool sem adaptador", () => {
    // É o contrato do fallback: quando o servidor resume (`{truncated, itens}`), a tela cai na
    // tabela crua em vez de inventar cartão nenhum.
    expect(orbResultView("query_tasks", { truncated: true, itens: 40 })).toBeNull();
    expect(orbResultView("query_tasks", { tasks: [] })).toBeNull();
    expect(orbResultView("query_tags", { tags: [{ id: "1", name: "casa" }] })).toBeNull();
    expect(orbResultView("query_tasks", null)).toBeNull();
  });
});
