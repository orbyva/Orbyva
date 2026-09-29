import { describe, expect, it } from "vitest";

import {
  isOrbAskUser,
  ORB_ASK_USER_TOOL_NAME,
} from "../../../../supabase/functions/_shared/orb/clarify.ts";
import {
  ORB_APP_ONLY_TOOLS,
  findOrbTool,
  runOrbTool,
} from "../../../../supabase/functions/_shared/orb/registry.ts";
import {
  ORB_REGRA_DE_CRIACAO,
  ORB_REGRA_DE_LACUNA,
} from "../../../../supabase/functions/_shared/orb/prompts.ts";
import { fakeDb } from "./fakeDb";

const ctx = {
  db: fakeDb({}),
  userId: "user-1",
  today: "2026-09-24",
  timezone: "America/Sao_Paulo",
};

describe("ask_user", () => {
  it("está no catálogo do app e fora do MCP", () => {
    expect(findOrbTool(ORB_ASK_USER_TOOL_NAME)?.title).toBe("Perguntar");
    expect(ORB_APP_ONLY_TOOLS).toContain(ORB_ASK_USER_TOOL_NAME);
  });

  it("devolve a pergunta e as sugestões sem tocar no banco", async () => {
    const { ok, result } = await runOrbTool(
      ORB_ASK_USER_TOOL_NAME,
      {
        question: "Que horas é o jogo?",
        suggestions: ["20:00", "21:00"],
      },
      ctx
    );

    expect(ok).toBe(true);
    expect(isOrbAskUser(result)).toBe(true);
    expect(result).toEqual({
      status: "awaiting_user",
      question: "Que horas é o jogo?",
      suggestions: ["20:00", "21:00"],
    });
  });

  it("aceita só a pergunta, sem sugestões", async () => {
    const { ok, result } = await runOrbTool(
      ORB_ASK_USER_TOOL_NAME,
      { question: "Qual categoria?" },
      ctx
    );

    expect(ok).toBe(true);
    expect(result).toEqual({
      status: "awaiting_user",
      question: "Qual categoria?",
      suggestions: [],
    });
  });

  it("recusa pergunta vazia", async () => {
    const { ok, result } = await runOrbTool(ORB_ASK_USER_TOOL_NAME, { question: "  " }, ctx);
    expect(ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringMatching(/question/i) });
  });

  it("as regras de lacuna e criação apontam para ask_user", () => {
    expect(ORB_REGRA_DE_LACUNA).toMatch(/ask_user/);
    expect(ORB_REGRA_DE_CRIACAO).toMatch(/ask_user/);
  });
});
