import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({
  db: {
    rows: [] as Row[],
    tagRows: { task: [] as Row[], project: [] as Row[] },
    nextId: 1,
    log: [] as string[],
    failUpdateAt: -1,
  },
}));

vi.mock("@/lib/auth-user", () => ({ getCurrentUserId: vi.fn(async () => "me") }));

vi.mock("@/lib/supabase", () => {
  function linkIconRuleTable() {
    const filters: [string, unknown][] = [];
    let op: "select" | "update" | "delete" | "insert" = "select";
    let payload: Row | Row[] | null = null;
    const matches = (row: Row) => filters.every(([k, v]) => row[k] === v);
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return builder;
      },
      insert: (rows: Row[]) => {
        op = "insert";
        payload = rows;
        return builder;
      },
      update: (fields: Row) => {
        op = "update";
        payload = fields;
        return builder;
      },
      delete: () => {
        op = "delete";
        return builder;
      },
      single: async () => {
        const row: Row = { id: `r${db.nextId++}`, ...(payload as Row[])[0] };
        db.rows.push(row);
        db.log.push(`insert ${row.name}`);
        return { data: row, error: null };
      },
      then: (resolve: (v: unknown) => void) => {
        if (op === "update") {
          db.log.push(`update ${JSON.stringify(payload)}`);
          if (db.failUpdateAt === db.log.length) {
            return resolve({ error: { message: "rede caiu" } });
          }
          for (const row of db.rows.filter(matches)) Object.assign(row, payload);
          return resolve({ error: null });
        }
        if (op === "delete") {
          db.rows = db.rows.filter((row) => !matches(row));
          return resolve({ error: null });
        }
        return resolve({
          data: db.rows
            .filter(matches)
            .sort((a, b) => Number(a.position) - Number(b.position)),
          error: null,
        });
      },
    };
    return builder;
  }
  function tagTable(name: "task" | "project") {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: db.tagRows[name], error: null }),
    };
    return builder;
  }
  return {
    supabase: {
      from: (table: string) => {
        if (table === "link_icon_rule") return linkIconRuleTable();
        if (table === "task" || table === "project") return tagTable(table);
        throw new Error(`tabela inesperada: ${table}`);
      },
    },
  };
});

import {
  createDefaultLinkIconRules,
  createLinkIconRule,
  deleteLinkIconRule,
  fetchLinkIconRules,
  reorderLinkIconRules,
  updateLinkIconRule,
} from "@/api/tasks/linkIconRules";
import { fetchTagUsage } from "@/api/tasks/tags";
import { DEFAULT_LINK_ICON_RULES } from "@/domain/tasks/linkIconRules";

const base = {
  label_template: null,
  icon_key: "flag",
  icon_url: null,
  position: 0,
  enabled: true,
};

describe("regras de ícone de link (mobile)", () => {
  beforeEach(() => {
    db.rows = [];
    db.nextId = 1;
    db.log = [];
    db.failUpdateAt = -1;
    db.tagRows = { task: [], project: [] };
  });

  it("cria com o usuário atual, nome/pattern aparados e ícone da biblioteca no lugar do preset", async () => {
    const rule = await createLinkIconRule({
      ...base,
      name: "  Jira ",
      pattern: " atlassian\\.net ",
      label_template: "   ",
      icon_url: "https://cdn/jira.png",
    });
    expect(rule).toMatchObject({
      user_id: "me",
      name: "Jira",
      pattern: "atlassian\\.net",
      label_template: null,
      icon_key: null,
      icon_url: "https://cdn/jira.png",
    });
  });

  it("recusa regex inválida e nome vazio antes de chegar no banco", async () => {
    await expect(createLinkIconRule({ ...base, name: "x", pattern: "([" })).rejects.toThrow(
      /Invalid regular expression/
    );
    await expect(createLinkIconRule({ ...base, name: " ", pattern: "a" })).rejects.toThrow(
      "A regra precisa de um nome."
    );
    await expect(updateLinkIconRule("r1", { pattern: "" })).rejects.toThrow(
      "Informe a expressão regular."
    );
    expect(db.rows).toHaveLength(0);
    expect(db.log).toEqual([]);
  });

  it("regras padrão entram depois das existentes e voltam na ordem de avaliação", async () => {
    await createLinkIconRule({ ...base, name: "Minha", pattern: "meu\\.site", position: 0 });
    await createDefaultLinkIconRules(1);
    const rules = await fetchLinkIconRules();
    expect(rules.map((r) => r.name)).toEqual([
      "Minha",
      ...DEFAULT_LINK_ICON_RULES.map((s) => s.name),
    ]);
  });

  it("reordenar renumera tudo de 0 e para no primeiro erro", async () => {
    const a = await createLinkIconRule({ ...base, name: "A", pattern: "a", position: 5 });
    const b = await createLinkIconRule({ ...base, name: "B", pattern: "b", position: 9 });
    const c = await createLinkIconRule({ ...base, name: "C", pattern: "c", position: 9 });
    db.log = [];
    await reorderLinkIconRules([c.id, a.id, b.id]);
    expect((await fetchLinkIconRules()).map((r) => [r.name, r.position])).toEqual([
      ["C", 0],
      ["A", 1],
      ["B", 2],
    ]);

    db.log = [];
    db.failUpdateAt = 2;
    await expect(reorderLinkIconRules([a.id, b.id, c.id])).rejects.toThrow("rede caiu");
    expect(db.log).toHaveLength(2);
  });

  it("desligar e excluir mexem só na regra pedida", async () => {
    const a = await createLinkIconRule({ ...base, name: "A", pattern: "a" });
    const b = await createLinkIconRule({ ...base, name: "B", pattern: "b", position: 1 });
    await updateLinkIconRule(a.id, { enabled: false });
    await deleteLinkIconRule(b.id);
    expect(await fetchLinkIconRules()).toEqual([
      expect.objectContaining({ name: "A", enabled: false }),
    ]);
  });

  it("uso das tags soma tarefas e projetos", async () => {
    db.tagRows = {
      task: [{ tag_ids: ["t1"] }, { tag_ids: ["t1", "t2"] }],
      project: [{ tag_ids: ["t2"] }, { tag_ids: [] }],
    };
    const usage = await fetchTagUsage();
    expect([...usage.entries()].sort()).toEqual([
      ["t1", 2],
      ["t2", 2],
    ]);
  });
});
