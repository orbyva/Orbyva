import { describe, expect, it } from "vitest";

import {
  isOrbProposal,
  orbProposalIdentity,
  sanitizeOrbProposalPayload,
  type OrbCreateKind,
  type OrbProposal,
} from "../../../../supabase/functions/_shared/orb/actions.ts";
import { runOrbTool } from "../../../../supabase/functions/_shared/orb/registry.ts";
import { fakeDb, type Recorded } from "./fakeDb";

const ctx = (db: ReturnType<typeof fakeDb>) => ({
  db,
  userId: "user-1",
  today: "2026-09-10",
  timezone: "America/Sao_Paulo",
});

const CATEGORIA = {
  id: 42,
  name: "Mercado",
  type: { id: 7, name: "Alimentação", nature: { name: "Despesa" } },
};

describe("sanitizeOrbProposalPayload", () => {
  it("deixa passar só o que a whitelist do tipo declara", () => {
    const limpo = sanitizeOrbProposalPayload("task", {
      title: "Pintar",
      due_date: "2026-09-12",
      user_id: "outro-usuario",
      status: "todo",
    });
    expect(limpo).toEqual({ title: "Pintar", due_date: "2026-09-12", status: "todo" });
    // O campo que não é da entidade some antes de chegar perto de um insert.
    expect(limpo).not.toHaveProperty("user_id");
  });

  it("recusa payload sem campo obrigatório ou com tipo errado", () => {
    expect(sanitizeOrbProposalPayload("task", { due_date: "2026-09-12" })).toBeNull();
    expect(sanitizeOrbProposalPayload("transaction", { description: "x", value: "80" })).toBeNull();
    expect(sanitizeOrbProposalPayload("note", null)).toBeNull();
  });
});

describe("propose_create", () => {
  it("monta a tarefa com prazo e projeto resolvido pelo nome", async () => {
    const log: Recorded[] = [];
    const db = fakeDb({ project: [{ id: "p-1", name: "Sacada" }] }, log);
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "task",
        title: "Comprar cimento",
        date: "2026-09-12",
        time: "09:30",
        priority: "high",
        project: "Sacada",
      },
      ctx(db)
    );

    expect(ok).toBe(true);
    expect(isOrbProposal(result)).toBe(true);
    expect(result).toMatchObject({
      kind: "task",
      label: "Nova tarefa",
      payload: {
        title: "Comprar cimento",
        due_date: "2026-09-12",
        due_time: "09:30:00",
        priority: "high",
        project_id: "p-1",
        status: "todo",
      },
    });
    // Nada foi gravado: a única ida ao banco foi a leitura do projeto.
    expect(log.every((entry) => entry.table === "project")).toBe(true);
  });

  it("resolve a categoria financeira e usa hoje quando não vem data", async () => {
    const db = fakeDb({ class: [CATEGORIA] });
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "transaction", title: "Feira", value: 82.5, category: "Mercado" },
      ctx(db)
    );

    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "transaction",
      payload: { description: "Feira", value: 82.5, class_id: 42 },
    });
    const proposta = result as { payload: { transaction_at: string }; fields: { value: string }[] };
    expect(proposta.payload.transaction_at.startsWith("2026-09-10")).toBe(true);
    expect(proposta.fields.map((campo) => campo.value)).toContain("Mercado (Despesa)");
  });

  it("recusa lançamento sem valor, pedindo o dado em vez de inventar", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "transaction", title: "Feira", category: "Mercado" },
      ctx(fakeDb({ class: [CATEGORIA] }))
    );
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toContain("value");
  });

  it("recusa categoria que não existe", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "transaction", title: "Feira", value: 10, category: "Padaria" },
      ctx(fakeDb({ class: [] }))
    );
    expect(ok).toBe(false);
    expect((result as { code: string }).code).toBe("nao_encontrado");
  });

  it("pede desempate quando o nome do projeto casa com vários", async () => {
    const db = fakeDb({
      project: [
        { id: "p-1", name: "Casa de praia" },
        { id: "p-2", name: "Casa da serra" },
      ],
    });
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "task", title: "Pintar", project: "Casa" },
      ctx(db)
    );
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toContain("Pergunte qual");
  });

  it("grava o evento no fuso do usuário, não em UTC", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "event", title: "Dentista", date: "2026-09-20", time: "14:00", end_time: "15:00" },
      ctx(fakeDb({}))
    );

    expect(ok).toBe(true);
    // O cartão diz 14:00 e o banco tem que concordar: `starts_at` é `timestamptz`, e sem o offset o
    // Postgres casta "14:00" como UTC — a agenda mostraria 11:00 para quem confirmou 14:00.
    expect(result).toMatchObject({
      kind: "event",
      payload: {
        starts_at: "2026-09-20T17:00:00.000Z",
        ends_at: "2026-09-20T18:00:00.000Z",
      },
    });
    const proposta = result as { fields: { label: string; value: string }[] };
    expect(proposta.fields.find((campo) => campo.label === "Quando")?.value).toContain("14:00");
  });

  it("exige data e hora no evento", async () => {
    const { ok } = await runOrbTool(
      "propose_create",
      { kind: "event", title: "Dentista" },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(false);
  });

  it("recusa data fora do formato", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "task", title: "Pintar", date: "12/09/2026" },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toContain("YYYY-MM-DD");
  });

  it("diz explicitamente que nada foi gravado", async () => {
    const { result } = await runOrbTool(
      "propose_create",
      { kind: "note", title: "Ideias", description: "texto" },
      ctx(fakeDb({}))
    );
    expect(result).toMatchObject({ status: "aguardando_confirmacao" });
    expect(String((result as { note: string }).note)).toContain("Nada foi gravado");
  });
});

describe("orbProposalIdentity", () => {
  const proposta = (kind: OrbCreateKind, payload: Record<string, unknown>): OrbProposal => ({
    kind,
    label: "x",
    fields: [],
    payload,
  });

  it("casa a mesma coisa reproposta com mais campos", () => {
    // É o caso de "com prazo para sexta": a tool não edita, o modelo manda a tarefa inteira de novo.
    expect(orbProposalIdentity(proposta("task", { title: "Comprar cigarro" }))).toBe(
      orbProposalIdentity(
        proposta("task", { title: "Comprar cigarro", due_date: "2026-09-18", project_id: "p-1" })
      )
    );
  });

  it("ignora acento, caixa e espaço sobrando", () => {
    expect(orbProposalIdentity(proposta("note", { title: "  Ideias  de   Férias " }))).toBe(
      orbProposalIdentity(proposta("note", { title: "ideias de ferias" }))
    );
  });

  it("separa coisas diferentes, inclusive de tipos diferentes com o mesmo nome", () => {
    expect(orbProposalIdentity(proposta("task", { title: "Sacada" }))).not.toBe(
      orbProposalIdentity(proposta("project", { name: "Sacada" }))
    );
    expect(orbProposalIdentity(proposta("task", { title: "Pintar" }))).not.toBe(
      orbProposalIdentity(proposta("task", { title: "Pintar a parede" }))
    );
  });

  it("usa a descrição no lançamento, que é o texto que a pessoa reconhece", () => {
    expect(orbProposalIdentity(proposta("transaction", { description: "Feira", value: 80 }))).toBe(
      orbProposalIdentity(proposta("transaction", { description: "feira", value: 82.5 }))
    );
  });
});
