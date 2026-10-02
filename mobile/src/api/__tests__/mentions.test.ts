import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({
  db: { note: [] as Row[], task: [] as Row[], note_link: [] as Row[] },
}));

vi.mock("@/lib/auth-user", () => ({ getCurrentUserId: vi.fn(async () => "me") }));

vi.mock("@/lib/supabase", () => {
  function likeToRegExp(pattern: string): RegExp {
    let out = "";
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch === "\\") {
        out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      } else if (ch === "%") out += "[\\s\\S]*";
      else if (ch === "_") out += ".";
      else out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`^${out}$`, "i");
  }
  function table(name: keyof typeof db) {
    const preds: ((row: Row) => boolean)[] = [];
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      eq: (k: string, v: unknown) => (preds.push((r) => r[k] === v), builder),
      neq: (k: string, v: unknown) => (preds.push((r) => r[k] !== v), builder),
      in: (k: string, vs: unknown[]) => (preds.push((r) => vs.includes(r[k])), builder),
      ilike: (k: string, p: string) => {
        const re = likeToRegExp(p);
        preds.push((r) => re.test(String(r[k] ?? "")));
        return builder;
      },
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: db[name].filter((r) => preds.every((p) => p(r))), error: null }),
    };
    return builder;
  }
  return { supabase: { from: (name: keyof typeof db) => table(name) } };
});

import {
  fetchNotesLinkedToMany,
  fetchNotesMentioningTitle,
  fetchNotesSharingEntity,
  fetchTaskMentions,
} from "@/api/notes/mentions";

const TASK = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";

function note(id: string, title: string, content: string, user = "me"): Row {
  return { id, title, content, user_id: user, kind: "text", canvas_data: null, project_id: null, folder_id: null };
}

describe("menções e backlinks (mobile)", () => {
  beforeEach(() => {
    db.note = [];
    db.task = [];
    db.note_link = [];
  });

  it("'Mencionada em' só conta [[título]] fora de código, sem a própria nota e de outro usuário", async () => {
    db.note = [
      note("n0", "Plano", "eu mesma [[Plano]]"),
      note("n1", "Diário", "hoje revisei o [[Plano]] inteiro"),
      note("n2", "Exemplo", "a sintaxe é `[[Plano]]`"),
      note("n3", "Bloco", "```\n[[Plano]]\n```"),
      note("n4", "Alheia", "[[Plano]]", "outro"),
      note("n5", "Parecida", "[[Plano B]]"),
    ];
    const out = await fetchNotesMentioningTitle("Plano", "n0");
    expect(out.map((n) => n.id)).toEqual(["n1"]);
  });

  it("título com curinga do LIKE é buscado literalmente", async () => {
    db.note = [
      note("n1", "a", "[[100% foco]]"),
      note("n2", "b", "[[100x foco]]"),
    ];
    expect((await fetchNotesMentioningTitle("100% foco")).map((n) => n.id)).toEqual(["n1"]);
  });

  it("'Ligadas às mesmas coisas' confere o par tipo+id e tira a própria nota", async () => {
    db.note = [note("n0", "Esta", ""), note("n1", "Mesma meta", ""), note("n2", "Mesmo id, outro tipo", "")];
    db.note_link = [
      { user_id: "me", note_id: "n0", entity_type: "goal", entity_id: "g1" },
      { user_id: "me", note_id: "n1", entity_type: "goal", entity_id: "g1" },
      { user_id: "me", note_id: "n2", entity_type: "task", entity_id: "g1" },
    ];
    expect((await fetchNotesSharingEntity("n0")).map((n) => n.id)).toEqual(["n1"]);
    expect(await fetchNotesSharingEntity("n1")).toEqual([expect.objectContaining({ id: "n0" })]);
  });

  it("notas por entidade agrupadas, sem repetir e sem nota invisível", async () => {
    db.note = [note("n1", "A", ""), note("n2", "B", "")];
    db.note_link = [
      { user_id: "me", note_id: "n1", entity_type: "goal", entity_id: "g1" },
      { user_id: "me", note_id: "n2", entity_type: "goal", entity_id: "g1" },
      { user_id: "me", note_id: "n1", entity_type: "goal", entity_id: "g2" },
      { user_id: "me", note_id: "sumiu", entity_type: "goal", entity_id: "g2" },
      { user_id: "me", note_id: "n2", entity_type: "task", entity_id: "g2" },
    ];
    const grouped = await fetchNotesLinkedToMany("goal", ["g1", "g2", "g3"]);
    expect(Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.map((n) => n.id)]))).toEqual({
      g1: ["n1", "n2"],
      g2: ["n1"],
    });
    expect(await fetchNotesLinkedToMany("goal", [])).toEqual({});
  });

  it("'Referenciada em' lista notas e tarefas com a marca da tarefa, fora de código", async () => {
    db.note = [
      note("n1", "Reunião", `ver [Deploy](orbyva-task:${TASK}) amanhã`),
      note("n2", "Docs", `exemplo: \`[Deploy](orbyva-task:${TASK})\``),
      note("n3", "Outra", `[X](orbyva-task:${OTHER})`),
    ];
    db.task = [
      { id: TASK, user_id: "me", title: "Deploy", description: `[eu](orbyva-task:${TASK})` },
      { id: "t2", user_id: "me", title: "Revisar", description: `depende de [Deploy](orbyva-task:${TASK.toUpperCase()})` },
      { id: "t3", user_id: "me", title: "Nada", description: "sem marca" },
    ];
    expect(await fetchTaskMentions(TASK)).toEqual({
      notes: [{ id: "n1", title: "Reunião" }],
      tasks: [{ id: "t2", title: "Revisar" }],
    });
  });
});
