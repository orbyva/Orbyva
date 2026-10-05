import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon" }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "jwt" } } })) },
  },
}));

import { streamOrbTurn } from "@/api/orb";
import { getErrorMessage } from "@/lib/errors";
import {
  ORB_NO_ACCESS_MESSAGE,
  orbDailyLimitMessage,
  orbMinuteLimitMessage,
} from "../../../../supabase/functions/_shared/orbQuotaRules.ts";

const FALHA = "A Orb não respondeu agora. Tente de novo em instantes.";

function respondWith(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

async function turnError(): Promise<unknown> {
  try {
    await streamOrbTurn({
      messages: [{ role: "user", content: "oi" }],
      today: "2026-10-05",
      timezone: "America/Sao_Paulo",
      onEvent: () => {},
    });
  } catch (error) {
    return error;
  }
  throw new Error("streamOrbTurn deveria ter falhado");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("limite de uso da Orb no client mobile", () => {
  it.each([
    ["cota diária", 429, orbDailyLimitMessage(100)],
    ["rajada por minuto", 429, orbMinuteLimitMessage(42)],
    ["sem acesso ao app", 402, ORB_NO_ACCESS_MESSAGE],
  ])("%s: a mensagem do servidor chega intacta ao balão do chat", async (_caso, status, message) => {
    respondWith(status, { error: message, limit: 100, remaining: 0 });
    const error = await turnError();
    expect((error as Error).message).toBe(message);
    expect(getErrorMessage(error, FALHA)).toBe(message);
  });
});
