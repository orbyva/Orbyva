import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({ db: { orb_avatar: [] as Row[], error: null as null | string } }));

vi.mock("@/lib/auth-user", () => ({ getCurrentUserId: vi.fn(async () => "me") }));

vi.mock("@/lib/supabase", () => {
  function table() {
    const preds: ((row: Row) => boolean)[] = [];
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (k: string, v: unknown) => (preds.push((r) => r[k] === v), builder),
      maybeSingle: async () => {
        if (db.error) return { data: null, error: { message: db.error } };
        const rows = db.orb_avatar.filter((r) => preds.every((p) => p(r)));
        return { data: rows[0] ?? null, error: null };
      },
    };
    return builder;
  }
  return { supabase: { from: () => table() } };
});

import { fetchActiveOrbAvatar } from "@/api/orbAvatars";

const avatar = (over: Row): Row => ({
  id: "a",
  user_id: "me",
  prompt: "p",
  url: "https://x/orb-avatars/me/a.png",
  model: "m",
  is_active: false,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

describe("fetchActiveOrbAvatar", () => {
  beforeEach(() => {
    db.orb_avatar = [];
    db.error = null;
  });

  it("devolve a versão ativa do próprio usuário", async () => {
    db.orb_avatar = [
      avatar({ id: "velha" }),
      avatar({ id: "outro-dono", user_id: "other", is_active: true }),
      avatar({ id: "ativa", is_active: true, url: "https://x/orb-avatars/me/ativa.png" }),
    ];
    const result = await fetchActiveOrbAvatar();
    expect(result?.id).toBe("ativa");
    expect(result?.url).toBe("https://x/orb-avatars/me/ativa.png");
  });

  it("devolve null quando não há versão ativa", async () => {
    db.orb_avatar = [avatar({ id: "velha" }), avatar({ id: "outro", user_id: "other", is_active: true })];
    expect(await fetchActiveOrbAvatar()).toBeNull();
  });

  it("propaga erro do banco", async () => {
    db.error = "boom";
    await expect(fetchActiveOrbAvatar()).rejects.toThrow("boom");
  });
});
