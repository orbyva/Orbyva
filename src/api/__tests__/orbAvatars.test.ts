import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ORB_AVATAR_BUCKET,
  deleteOrbAvatar,
  fetchActiveOrbAvatar,
  fetchOrbAvatars,
  orbAvatarStoragePath,
  setActiveOrbAvatar,
} from "@/api/orbAvatars";
import type { OrbAvatar } from "@/types/orb";

/**
 * I/O das versões da Orb (feature 151), verificado com o mesmo duplo de query builder de
 * `src/api/__tests__/iconAssets.test.ts` — sem Supabase local, o que se afirma é a query montada
 * (tabela, filtros, ordem), o nome e o argumento da RPC, e a chamada de storage (bucket, caminho,
 * **ordem** em relação ao delete da linha).
 *
 * As regras do banco em si (uma ativa por dono, a RPC recusando id alheio, o wipe) são provadas em
 * `supabase/tests/orb_avatar/` contra um Postgres de verdade — aqui o que importa é que o client
 * chame o banco pelo caminho certo, nunca que ele reimplemente a regra.
 */

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  eq: [string, unknown][];
  order?: [string, { ascending: boolean }];
  terminal?: "maybeSingle" | "single" | "order" | "then";
}

const calls: Call[] = [];
const rpcCalls: { fn: string; args: unknown }[] = [];
const removals: { bucket: string; paths: string[] }[] = [];
/** Ordem real das idas ao servidor — é o que prova "arquivo primeiro, linha depois". */
const events: string[] = [];
let results: { data: unknown; error: { message: string } | null }[] = [];
let rpcError: { message: string } | null = null;
let removeError: { message: string } | null = null;
let removeThrows = false;

function nextResult() {
  return results.length > 1
    ? (results.shift() as { data: unknown; error: { message: string } | null })
    : results[0];
}

function makeBuilder(table: string) {
  const call: Call = { table, op: "select", eq: [] };
  calls.push(call);
  const builder = {
    select() {
      return builder;
    },
    delete() {
      call.op = "delete";
      events.push("row-delete");
      return builder;
    },
    eq(column: string, value: unknown) {
      call.eq.push([column, value]);
      return builder;
    },
    order(column: string, options: { ascending: boolean }) {
      call.order = [column, options];
      call.terminal = "order";
      return Promise.resolve(nextResult());
    },
    maybeSingle() {
      call.terminal = "maybeSingle";
      return Promise.resolve(nextResult());
    },
    single() {
      call.terminal = "single";
      return Promise.resolve(nextResult());
    },
    then(
      resolve: (value: ReturnType<typeof nextResult>) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      call.terminal ??= "then";
      return Promise.resolve(nextResult()).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: rpcError });
    },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          removals.push({ bucket, paths });
          events.push("storage-remove");
          if (removeThrows) return Promise.reject(new Error("rede caiu"));
          return Promise.resolve({ error: removeError });
        },
      }),
    },
  },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  removals.length = 0;
  events.length = 0;
  rpcError = null;
  removeError = null;
  removeThrows = false;
  results = [{ data: [], error: null }];
});

const AVATAR: OrbAvatar = {
  id: "orb-1",
  user_id: "user-1",
  prompt: "uma orb azul de vidro",
  url: "https://example.supabase.co/storage/v1/object/public/orb-avatars/user-1/abc-123.png",
  model: "gemini-image",
  is_active: false,
  created_at: "2026-09-24T00:00:00Z",
};

describe("api/orbAvatars — galeria", () => {
  it("fetchOrbAvatars lê as versões do usuário, mais recentes primeiro", async () => {
    results = [{ data: [AVATAR], error: null }];

    await expect(fetchOrbAvatars()).resolves.toEqual([AVATAR]);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("orb_avatar");
    // O filtro por user_id não é redundante com a RLS: é ele que casa com o índice
    // `orb_avatar_user_created_idx`, que começa por user_id.
    expect(calls[0].eq).toEqual([["user_id", "user-1"]]);
    expect(calls[0].order).toEqual(["created_at", { ascending: false }]);
  });

  it("fetchActiveOrbAvatar pede a ativa do usuário com maybeSingle", async () => {
    results = [{ data: { ...AVATAR, is_active: true }, error: null }];

    await expect(fetchActiveOrbAvatar()).resolves.toMatchObject({
      id: "orb-1",
      is_active: true,
    });

    expect(calls[0].table).toBe("orb_avatar");
    expect(calls[0].eq).toEqual([
      ["user_id", "user-1"],
      ["is_active", true],
    ]);
    // `single` transformaria o caso normal (nenhuma versão ativa) em erro.
    expect(calls[0].terminal).toBe("maybeSingle");
  });

  it("nenhuma versão ativa é estado válido: volta null, não erro", async () => {
    results = [{ data: null, error: null }];

    await expect(fetchActiveOrbAvatar()).resolves.toBeNull();
  });

  it("erro do banco na leitura vira Error com a mensagem do Supabase", async () => {
    results = [{ data: null, error: { message: "permission denied" } }];

    await expect(fetchOrbAvatars()).rejects.toThrow("permission denied");
  });
});

describe("api/orbAvatars — trocar a ativa", () => {
  it("setActiveOrbAvatar chama a RPC, não dois updates", async () => {
    await setActiveOrbAvatar("orb-2");

    expect(rpcCalls).toEqual([
      { fn: "orb_avatar_set_active", args: { p_id: "orb-2" } },
    ]);
    // Nenhum update do client: com o índice único parcial, a ordem errada viola a constraint e
    // duas chamadas separadas podem parar no meio.
    expect(calls).toEqual([]);
  });

  it("recusa da RPC (id de outro dono) sobe como erro", async () => {
    rpcError = { message: "Versão da Orb não encontrada" };

    await expect(setActiveOrbAvatar("orb-de-outro")).rejects.toThrow(
      "Versão da Orb não encontrada"
    );
  });
});

describe("api/orbAvatars — apagar uma versão", () => {
  it("remove o arquivo do bucket ANTES de apagar a linha", async () => {
    await deleteOrbAvatar(AVATAR);

    expect(removals).toEqual([
      { bucket: ORB_AVATAR_BUCKET, paths: ["user-1/abc-123.png"] },
    ]);
    // Ao contrário de icon_asset, aqui o arquivo vai junto: nada mais aponta para a URL, e é um
    // PNG grande.
    expect(events).toEqual(["storage-remove", "row-delete"]);

    expect(calls[0].op).toBe("delete");
    expect(calls[0].table).toBe("orb_avatar");
    expect(calls[0].eq).toEqual([
      ["id", "orb-1"],
      ["user_id", "user-1"],
    ]);
  });

  it("se o remove falhar, a linha some mesmo assim", async () => {
    removeError = { message: "object not found" };

    await deleteOrbAvatar(AVATAR);

    expect(removals).toHaveLength(1);
    expect(calls[0].op).toBe("delete");
  });

  it("se o remove estourar, a linha some mesmo assim", async () => {
    removeThrows = true;

    await deleteOrbAvatar(AVATAR);

    expect(calls[0].op).toBe("delete");
  });

  it("URL que não é deste bucket não manda caminho nenhum para o storage", async () => {
    await deleteOrbAvatar({ ...AVATAR, url: "https://cdn.exemplo/qualquer.png" });

    expect(removals).toEqual([]);
    expect(calls[0].op).toBe("delete");
  });
});

describe("api/orbAvatars — caminho no bucket a partir da URL pública", () => {
  it("tira o {userId}/{uuid}.png de uma URL pública da Supabase", () => {
    expect(orbAvatarStoragePath(AVATAR.url)).toBe("user-1/abc-123.png");
  });

  it("corta query string e fragmento", () => {
    expect(
      orbAvatarStoragePath(`${AVATAR.url}?t=1700000000#x`)
    ).toBe("user-1/abc-123.png");
  });

  it("devolve null para URL de outro bucket ou sem caminho", () => {
    expect(
      orbAvatarStoragePath(
        "https://example.supabase.co/storage/v1/object/public/task-icons/user-1/abc.png"
      )
    ).toBeNull();
    expect(
      orbAvatarStoragePath(
        "https://example.supabase.co/storage/v1/object/public/orb-avatars/"
      )
    ).toBeNull();
  });
});
