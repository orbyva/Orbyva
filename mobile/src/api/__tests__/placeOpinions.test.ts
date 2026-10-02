import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { store } = vi.hoisted(() => ({
  store: {
    place: null as Row | null,
    opinions: [] as Row[],
    opinionError: null as { message: string; code?: string } | null,
    members: [] as Row[],
    upserts: [] as { payload: Row; options: unknown }[],
    access: [] as string[],
  },
}));

vi.mock("@/lib/auth-user", () => ({ getCurrentUserId: vi.fn(async () => "me") }));
vi.mock("@/lib/tripAccess", () => ({
  assertTripAccess: vi.fn(async (tripId: string) => {
    store.access.push(tripId);
    return { userId: "me", role: "member" };
  }),
}));
vi.mock("@/api/finance/transactions", () => ({ createTransaction: vi.fn() }));

vi.mock("@/lib/supabase", () => {
  function chain(result: () => unknown) {
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "in"]) builder[m] = () => builder;
    builder.maybeSingle = async () => ({ data: store.place, error: null });
    builder.then = (resolve: (v: unknown) => void) => resolve(result());
    return builder;
  }
  return {
    supabase: {
      from: (table: string) => {
        if (table === "place_visit") return chain(() => ({ data: store.place, error: null }));
        if (table === "trip_member") return chain(() => ({ data: store.members, error: null }));
        if (table === "trip_place_opinion") {
          const c = chain(() => ({ data: store.opinions, error: store.opinionError }));
          c.upsert = async (payload: Row, options: unknown) => {
            store.upserts.push({ payload, options });
            return { error: null };
          };
          return c;
        }
        throw new Error(`tabela inesperada: ${table}`);
      },
    },
  };
});

import { fetchPlaceOpinions, upsertPlaceOpinion } from "@/api/places/places";

const tripPlace = {
  id: "pl-1",
  user_id: "author",
  trip_id: "trip-1",
  name: "Bar",
  type: "bar",
  rating: 4,
  notes: "bom",
  would_recommend: true,
  visited_date: "2026-09-01",
};

describe("opiniões de lugar (mobile)", () => {
  beforeEach(() => {
    store.place = { ...tripPlace };
    store.opinions = [];
    store.opinionError = null;
    store.members = [];
    store.upserts = [];
    store.access = [];
  });

  it("sem opinião gravada, a linha do autor conta como a única opinião", async () => {
    const out = await fetchPlaceOpinions("pl-1");
    expect(out).toEqual([
      expect.objectContaining({ id: "legacy", user_id: "author", rating: 4, notes: "bom" }),
    ]);
  });

  it("tabela ausente cai no mesmo fallback", async () => {
    store.opinionError = { message: "relation trip_place_opinion does not exist", code: "42P01" };
    expect((await fetchPlaceOpinions("pl-1"))[0].id).toBe("legacy");
  });

  it("opiniões gravadas ganham o nome do membro da viagem", async () => {
    store.opinions = [
      { id: "o1", place_visit_id: "pl-1", user_id: "author", rating: 5, would_recommend: true },
      { id: "o2", place_visit_id: "pl-1", user_id: "me", rating: 3, would_recommend: false },
    ];
    store.members = [
      { user_id: "author", display_name: "Ana" },
      { user_id: "me", display_name: "Pedro" },
    ];
    const out = await fetchPlaceOpinions("pl-1");
    expect(out.map((o) => o.display_name)).toEqual(["Ana", "Pedro"]);
  });

  it("grava a opinião do usuário atual com conflito por lugar + usuário, depois de checar acesso", async () => {
    await upsertPlaceOpinion("pl-1", { rating: 5, notes: "  ótimo  ", would_recommend: false });
    expect(store.access).toEqual(["trip-1"]);
    expect(store.upserts).toEqual([
      {
        payload: expect.objectContaining({
          place_visit_id: "pl-1",
          user_id: "me",
          rating: 5,
          notes: "ótimo",
          would_recommend: false,
        }),
        options: { onConflict: "place_visit_id,user_id" },
      },
    ]);
  });

  it("lugar fora de viagem não aceita opinião em grupo", async () => {
    store.place = { ...tripPlace, trip_id: null, user_id: "me" };
    await expect(upsertPlaceOpinion("pl-1", { rating: 5 })).rejects.toThrow(/lugares de viagem/);
    expect(store.upserts).toEqual([]);
  });
});
