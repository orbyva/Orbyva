// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteIconAsset,
  fetchIconAssets,
  renameIconAsset,
  uploadIconAsset,
} from "@/api/tasks/iconAssets";

/**
 * I/O da biblioteca de ícones (feature 086), verificado com o mesmo duplo de query builder de
 * `src/api/__tests__/taskExternalLinks.test.ts` — sem Supabase local, o que se afirma é a query
 * montada (tabela, filtros, payload) e a chamada de storage (caminho, `contentType`, **conteúdo**).
 *
 * O teste central deste arquivo é de segurança, não de I/O: `uploadIconAsset` é o único caminho por
 * onde markup do usuário chega ao bucket **público**, e o que precisa ficar provado é que o corpo
 * enviado é o SVG **sanitizado**, nunca o texto original. Por isso roda em jsdom: a sanitização
 * depende do `DOMParser`, e é o parser real que desfaz os disfarces.
 */

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  eq: [string, unknown][];
  order?: [string, { ascending: boolean }];
  selectedAfterWrite?: boolean;
}

interface UploadCall {
  bucket: string;
  path: string;
  body: Blob | File;
  options: { upsert?: boolean; contentType?: string };
}

const calls: Call[] = [];
const uploads: UploadCall[] = [];
const removals: { bucket: string; paths: string[] }[] = [];
let results: { data: unknown; error: { message: string } | null }[] = [];
let uploadError: { message: string } | null = null;

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
      if (call.op !== "select") call.selectedAfterWrite = true;
      return builder;
    },
    insert(payload: unknown) {
      call.op = "insert";
      call.payload = payload;
      return builder;
    },
    update(payload: unknown) {
      call.op = "update";
      call.payload = payload;
      return builder;
    },
    delete() {
      call.op = "delete";
      return builder;
    },
    eq(column: string, value: unknown) {
      call.eq.push([column, value]);
      return builder;
    },
    order(column: string, options: { ascending: boolean }) {
      call.order = [column, options];
      return Promise.resolve(nextResult());
    },
    single() {
      return Promise.resolve(nextResult());
    },
    then(
      resolve: (value: ReturnType<typeof nextResult>) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(nextResult()).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    storage: {
      from: (bucket: string) => ({
        upload: (
          path: string,
          body: Blob | File,
          options: { upsert?: boolean; contentType?: string }
        ) => {
          uploads.push({ bucket, path, body, options });
          return Promise.resolve({ error: uploadError });
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.example.com/task-icons/${path}` },
        }),
        remove: (paths: string[]) => {
          removals.push({ bucket, paths });
          return Promise.resolve({ error: null });
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
  uploads.length = 0;
  removals.length = 0;
  uploadError = null;
  results = [{ data: [], error: null }];
});

const ICON_ROW = {
  id: "icon-1",
  user_id: "user-1",
  name: "Ícone",
  url: "https://cdn.example.com/task-icons/user-1/library/abc.svg",
  created_at: "2026-08-23T00:00:00Z",
};

async function uploadedText(): Promise<string> {
  return await uploads[0].body.text();
}

describe("api/iconAssets — leitura e edição da lista", () => {
  it("fetchIconAssets lê a biblioteca do usuário, mais recentes primeiro", async () => {
    results = [{ data: [ICON_ROW], error: null }];

    await expect(fetchIconAssets()).resolves.toEqual([ICON_ROW]);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("icon_asset");
    // O filtro por user_id não é redundante com a RLS: é ele que casa com o índice
    // `icon_asset_user_created_idx`, que começa por user_id.
    expect(calls[0].eq).toEqual([["user_id", "user-1"]]);
    expect(calls[0].order).toEqual(["created_at", { ascending: false }]);
  });

  it("renameIconAsset atualiza só o nome, escopado no id e no usuário", async () => {
    await renameIconAsset("icon-1", "  Logo da empresa  ");

    expect(calls[0].op).toBe("update");
    expect(calls[0].table).toBe("icon_asset");
    expect(calls[0].payload).toEqual({ name: "Logo da empresa" });
    expect(calls[0].eq).toEqual([
      ["id", "icon-1"],
      ["user_id", "user-1"],
    ]);
  });

  it("renomear para vazio não vai ao banco (o rótulo é not null)", async () => {
    await expect(renameIconAsset("icon-1", "   ")).rejects.toThrow(
      "O ícone precisa de um nome."
    );
    expect(calls).toHaveLength(0);
  });

  it("deleteIconAsset apaga a linha e NÃO toca no arquivo do bucket", async () => {
    await deleteIconAsset("icon-1");

    expect(calls[0].op).toBe("delete");
    expect(calls[0].table).toBe("icon_asset");
    expect(calls[0].eq).toEqual([
      ["id", "icon-1"],
      ["user_id", "user-1"],
    ]);
    // Decisão da feature: excluir tira da lista, o arquivo fica. Apagá-lo quebraria em silêncio o
    // ícone de toda tarefa que já aponta para aquela URL.
    expect(removals).toEqual([]);
  });
});

describe("api/iconAssets — upload de SVG colado", () => {
  it("sobe como image/svg+xml, dentro de library/, e insere a linha com a URL pública", async () => {
    results = [{ data: ICON_ROW, error: null }];

    const asset = await uploadIconAsset(
      { svg: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>' },
      "Bolinha"
    );

    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe("task-icons");
    expect(uploads[0].options.contentType).toBe("image/svg+xml");
    // `{userId}/library/{uuid}.svg`: o dono continua sendo o primeiro segmento (é o que as policies
    // do bucket exigem), e nenhum id de tarefa entra no caminho.
    expect(uploads[0].path).toMatch(/^user-1\/library\/[^/]+\.svg$/);

    const insert = calls.find((call) => call.op === "insert");
    expect(insert?.table).toBe("icon_asset");
    expect(insert?.payload).toEqual({
      user_id: "user-1",
      name: "Bolinha",
      url: `https://cdn.example.com/task-icons/${uploads[0].path}`,
    });
    expect(asset).toEqual(ICON_ROW);
  });

  it("o que sobe é o SVG sanitizado, não o markup colado", async () => {
    results = [{ data: ICON_ROW, error: null }];

    await uploadIconAsset({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><circle r="4"/></svg>',
    });

    const sent = await uploadedText();
    expect(sent).not.toContain("<script");
    expect(sent).not.toContain("alert(1)");
    expect(sent).not.toContain("alert(2)");
    expect(sent).not.toContain("onload");
    // E o desenho que sobrou continua lá — sanitizar não é apagar o ícone.
    expect(sent).toContain("<circle");
  });

  it("markup que não é SVG nem chega ao bucket", async () => {
    await expect(uploadIconAsset({ svg: "<b>oi</b>" })).rejects.toThrow(/não parece um SVG/);
    expect(uploads).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("SVG que só tinha script não vira arquivo vazio no bucket", async () => {
    await expect(
      uploadIconAsset({ svg: "<svg><script>alert(1)</script></svg>" })
    ).rejects.toThrow(/removido por segurança/);
    expect(uploads).toEqual([]);
  });

  it("sem nome, o SVG colado entra na lista com um rótulo em vez de string vazia", async () => {
    results = [{ data: ICON_ROW, error: null }];

    await uploadIconAsset({ svg: "<svg><circle r='4'/></svg>" }, "   ");

    const insert = calls.find((call) => call.op === "insert");
    expect(insert?.payload).toMatchObject({ name: "Ícone colado" });
  });
});

describe("api/iconAssets — upload de arquivo", () => {
  it("imagem comum sobe como está, em library/, com o nome do arquivo como rótulo", async () => {
    results = [{ data: ICON_ROW, error: null }];
    const file = new File(["binário"], "logo-empresa.png", { type: "image/png" });

    await uploadIconAsset({ file });

    expect(uploads[0].path).toMatch(/^user-1\/library\/[^/]+\.png$/);
    expect(uploads[0].options.contentType).toBe("image/png");
    expect(uploads[0].body).toBe(file);
    const insert = calls.find((call) => call.op === "insert");
    expect(insert?.payload).toMatchObject({ name: "logo-empresa" });
  });

  // O seletor de arquivos aceita `image/svg+xml` desde a feature 035, e um `.svg` escolhido ali é
  // markup igual ao colado: mesma origem possível, mesmo bucket público, mesmo risco de ser aberto
  // como navegação de topo. Passa pela mesma barreira — a sanitização mora no upload, não na tela.
  it("arquivo .svg também é sanitizado antes de subir", async () => {
    results = [{ data: ICON_ROW, error: null }];
    const file = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="4" height="4"/></svg>'],
      "malicioso.svg",
      { type: "image/svg+xml" }
    );

    await uploadIconAsset({ file });

    expect(uploads[0].body).not.toBe(file);
    const sent = await uploadedText();
    expect(sent).not.toContain("<script");
    expect(sent).not.toContain("alert(1)");
    expect(sent).toContain("<rect");
  });

  it("upload que falha não insere linha nenhuma na biblioteca", async () => {
    uploadError = { message: "arquivo muito grande" };
    const file = new File(["x"], "icone.png", { type: "image/png" });

    await expect(uploadIconAsset({ file })).rejects.toThrow("arquivo muito grande");
    expect(calls.some((call) => call.op === "insert")).toBe(false);
  });
});
