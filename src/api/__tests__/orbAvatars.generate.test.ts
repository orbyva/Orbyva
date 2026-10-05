import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { generateOrbAvatar } from "@/api/orbAvatars";

const ROW = {
  id: "a1",
  user_id: "u1",
  is_active: false,
  url: "https://x.supabase.co/storage/v1/object/public/orb-avatars/u1/a1.png",
  prompt: "esfera roxa",
  model: "gemini-2.5-flash-image",
  created_at: "2026-10-05T15:00:00Z",
};

describe("generateOrbAvatar", () => {
  beforeEach(() => invoke.mockReset());

  it("chama orb-avatar com prompt, referências, dia e fuso do aparelho", async () => {
    invoke.mockResolvedValue({ data: { ...ROW, remaining: 9 }, error: null });
    const refs = [{ mime: "image/jpeg" as const, data: "/9j/" }];

    const result = await generateOrbAvatar({ prompt: "esfera roxa", references: refs });

    expect(invoke).toHaveBeenCalledTimes(1);
    const [fn, options] = invoke.mock.calls[0];
    expect(fn).toBe("orb-avatar");
    expect(options.body.prompt).toBe("esfera roxa");
    expect(options.body.references).toEqual(refs);
    expect(options.body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof options.body.timezone).toBe("string");
    expect(result.remaining).toBe(9);
    expect(result.avatar).toMatchObject({ id: "a1", is_active: false, prompt: "esfera roxa" });
  });

  it("erro da função sobe com a mensagem do corpo, não com o non-2xx genérico", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: new Response(
          JSON.stringify({ error: "Você já gerou 10 versões da Orb hoje.", remaining: 0 }),
          { status: 429 }
        ),
      },
    });

    await expect(generateOrbAvatar({ prompt: "x", references: [] })).rejects.toMatchObject({
      message: "Você já gerou 10 versões da Orb hoje.",
      remaining: 0,
    });
  });

  it("corpo de erro ilegível cai na mensagem do invoke", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "Failed to send a request", context: new Response("<html>", { status: 500 }) },
    });
    await expect(generateOrbAvatar({ prompt: "x", references: [] })).rejects.toThrow(
      "Failed to send a request"
    );
  });
});
