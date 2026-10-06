// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TRIP_ASSET_BUCKET,
  TRIP_ASSET_SIGNED_URL_TTL_SECONDS,
  addActivityLinkAsset,
  createActivityAssetDrafts,
  deleteActivityAsset,
  fetchAssetsForActivity,
  fetchAssetsForTrip,
  isMissingAssetSchema,
  renameActivityAsset,
  signedAssetUrl,
  uploadActivityFileAsset,
} from "@/api/travel/activityAssets";
import { fileDraft, linkDraft } from "@/domain/travel/activityAssetDrafts";
import type { TripActivityAsset } from "@/types/travel";

/**
 * I/O dos assets do roteiro (feature 102), com o mesmo duplo de query builder de
 * `src/api/__tests__/iconAssets.test.ts` — sem Supabase local, o que se afirma é a query montada
 * (tabela, filtros, payload) e a chamada de storage.
 *
 * Três afirmações deste arquivo são de **segurança/custo**, não de I/O, e são a razão de ele existir:
 *   1. nenhum caminho daqui chama `getPublicUrl` (o bucket é privado — ver o teste do final);
 *   2. o caminho do arquivo começa pelo `trip_id`, que é o que as policies do bucket leem;
 *   3. a URL assinada força `download` para todo mime que não seja pdf nem imagem.
 */

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  eq: [string, unknown][];
  order?: [string, { ascending: boolean }];
}

interface UploadCall {
  bucket: string;
  path: string;
  body: Blob | File;
  options: { upsert?: boolean; contentType?: string };
}

interface SignCall {
  bucket: string;
  path: string;
  ttl: number;
  options: { download?: string };
}

const calls: Call[] = [];
const uploads: UploadCall[] = [];
const removals: { bucket: string; paths: string[] }[] = [];
const signs: SignCall[] = [];
let publicUrlCalls = 0;
let results: { data: unknown; error: { message: string; code?: string } | null }[] = [];
let uploadError: { message: string } | null = null;
let removeError: { message: string } | null = null;

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
        remove: (paths: string[]) => {
          removals.push({ bucket, paths });
          return Promise.resolve({ error: removeError });
        },
        createSignedUrl: (
          path: string,
          ttl: number,
          options: { download?: string } = {}
        ) => {
          signs.push({ bucket, path, ttl, options });
          return Promise.resolve({
            data: { signedUrl: `https://sb.test/${bucket}/${path}?token=t` },
            error: null,
          });
        },
        // Existe só para o teste final afirmar que **nunca** é chamado.
        getPublicUrl: (path: string) => {
          publicUrlCalls += 1;
          return { data: { publicUrl: `https://cdn.test/${path}` } };
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
  signs.length = 0;
  publicUrlCalls = 0;
  uploadError = null;
  removeError = null;
  results = [{ data: [], error: null }];
});

const TRIP = "aaaaaaaa-0000-0000-0000-00000000000a";
const ACT_FLIGHT = "eeeeeeee-0000-0000-0000-0000000000f1";
const ACT_VISIT = "eeeeeeee-0000-0000-0000-0000000000f2";

function row(over: Partial<TripActivityAsset> = {}): TripActivityAsset {
  return {
    id: "asset-1",
    trip_id: TRIP,
    activity_id: ACT_FLIGHT,
    kind: "file",
    label: "Cartão de embarque",
    url: null,
    storage_path: `${TRIP}/${ACT_FLIGHT}/abc.pdf`,
    mime_type: "application/pdf",
    size_bytes: 1024,
    position: 0,
    created_at: "2026-09-30T10:00:00Z",
    ...over,
  };
}

describe("fetchAssetsForTrip", () => {
  it("uma consulta por viagem, filtrando por trip_id (escopo da RLS e do índice)", async () => {
    results = [{ data: [row()], error: null }];
    await fetchAssetsForTrip(TRIP);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("trip_activity_asset");
    expect(calls[0].eq).toEqual([["trip_id", TRIP]]);
    expect(calls[0].order).toEqual(["position", { ascending: true }]);
  });

  it("agrupa por activity_id — e atividade sem asset não aparece no mapa", async () => {
    results = [
      {
        data: [
          row({ id: "a1", activity_id: ACT_FLIGHT, position: 1 }),
          row({ id: "a2", activity_id: ACT_FLIGHT, position: 0 }),
          row({ id: "a3", activity_id: ACT_VISIT, kind: "link", url: "https://x.test" }),
        ],
        error: null,
      },
    ];

    const grouped = await fetchAssetsForTrip(TRIP);

    expect(Object.keys(grouped).sort()).toEqual([ACT_FLIGHT, ACT_VISIT].sort());
    // Ordenado por position dentro do grupo.
    expect(grouped[ACT_FLIGHT].map((a) => a.id)).toEqual(["a2", "a1"]);
    expect(grouped["nao-existe"]).toBeUndefined();
  });

  it("tabela ausente devolve vazio em vez de quebrar o roteiro inteiro", async () => {
    results = [{ data: null, error: { message: 'relation "trip_activity_asset" does not exist', code: "42P01" } }];
    await expect(fetchAssetsForTrip(TRIP)).resolves.toEqual({});
  });

  it("erro de verdade sobe", async () => {
    results = [{ data: null, error: { message: "boom", code: "XX000" } }];
    await expect(fetchAssetsForTrip(TRIP)).rejects.toThrow("boom");
  });
});

describe("fetchAssetsForActivity", () => {
  it("filtra por activity_id", async () => {
    results = [{ data: [row()], error: null }];
    await fetchAssetsForActivity(ACT_FLIGHT);
    expect(calls[0].eq).toEqual([["activity_id", ACT_FLIGHT]]);
  });

  it("tabela ausente devolve lista vazia", async () => {
    results = [{ data: null, error: { message: "could not find the table 'public.trip_activity_asset'", code: "PGRST205" } }];
    await expect(fetchAssetsForActivity(ACT_FLIGHT)).resolves.toEqual([]);
  });
});

describe("uploadActivityFileAsset", () => {
  it("o caminho começa pelo trip_id — é o que as policies do bucket leem", async () => {
    results = [{ data: row(), error: null }];
    const file = new File(["%PDF-1.7"], "Cartão de embarque.pdf", {
      type: "application/pdf",
    });

    await uploadActivityFileAsset({
      tripId: TRIP,
      activityId: ACT_FLIGHT,
      file,
    });

    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe(TRIP_ASSET_BUCKET);
    expect(uploads[0].path.startsWith(`${TRIP}/${ACT_FLIGHT}/`)).toBe(true);
    // Extensão preservada: é dela que sai o `download` com nome reconhecível.
    expect(uploads[0].path.endsWith(".pdf")).toBe(true);
    // Sem upsert: dois uploads nunca disputam o mesmo caminho (cada um gera um uuid).
    expect(uploads[0].options.upsert).toBe(false);
    expect(uploads[0].options.contentType).toBe("application/pdf");
  });

  it("grava kind=file, mime, tamanho e autor — e nenhum url", async () => {
    results = [{ data: row(), error: null }];
    const file = new File(["x"], "reserva.pdf", { type: "application/pdf" });

    await uploadActivityFileAsset({
      tripId: TRIP,
      activityId: ACT_FLIGHT,
      file,
      existing: [row({ position: 3 })],
    });

    const insert = calls.find((c) => c.op === "insert");
    expect(insert?.table).toBe("trip_activity_asset");
    const payload = insert?.payload as Record<string, unknown>;
    expect(payload.kind).toBe("file");
    expect(payload.trip_id).toBe(TRIP);
    expect(payload.activity_id).toBe(ACT_FLIGHT);
    expect(payload.mime_type).toBe("application/pdf");
    expect(payload.size_bytes).toBe(file.size);
    expect(payload.created_by_user_id).toBe("user-1");
    // Entra no fim da lista.
    expect(payload.position).toBe(4);
    expect(payload.url).toBeUndefined();
    // Sem rótulo explícito, o nome do arquivo é o único lugar onde ele sobrevive (o caminho é uuid).
    expect(payload.label).toBe("reserva.pdf");
  });

  it("rótulo explícito ganha do nome do arquivo", async () => {
    results = [{ data: row(), error: null }];
    await uploadActivityFileAsset({
      tripId: TRIP,
      activityId: ACT_FLIGHT,
      file: new File(["x"], "scan_0001.pdf", { type: "application/pdf" }),
      label: "  Voucher do hotel  ",
    });
    const insert = calls.find((c) => c.op === "insert");
    expect((insert?.payload as Record<string, unknown>).label).toBe("Voucher do hotel");
  });

  it("falha de upload não grava linha nenhuma", async () => {
    uploadError = { message: "payload too large" };
    await expect(
      uploadActivityFileAsset({
        tripId: TRIP,
        activityId: ACT_FLIGHT,
        file: new File(["x"], "a.pdf", { type: "application/pdf" }),
      })
    ).rejects.toThrow("payload too large");
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });
});

describe("addActivityLinkAsset", () => {
  it("grava kind=link com url e sem storage_path", async () => {
    results = [{ data: row({ kind: "link" }), error: null }];
    await addActivityLinkAsset({
      tripId: TRIP,
      activityId: ACT_VISIT,
      url: "https://jeronimos.test/ingresso",
      label: "Ingresso",
    });

    const insert = calls.find((c) => c.op === "insert");
    const payload = insert?.payload as Record<string, unknown>;
    expect(payload.kind).toBe("link");
    expect(payload.url).toBe("https://jeronimos.test/ingresso");
    expect(payload.label).toBe("Ingresso");
    expect(payload.storage_path).toBeUndefined();
    expect(payload.activity_id).toBe(ACT_VISIT);
    // Link nunca sobe arquivo.
    expect(uploads).toHaveLength(0);
  });

  it("rótulo vazio vira null", async () => {
    results = [{ data: row({ kind: "link" }), error: null }];
    await addActivityLinkAsset({
      tripId: TRIP,
      activityId: ACT_VISIT,
      url: "https://x.test/",
      label: "   ",
    });
    const insert = calls.find((c) => c.op === "insert");
    expect((insert?.payload as Record<string, unknown>).label).toBeNull();
  });
});

describe("renameActivityAsset", () => {
  it("atualiza só o label, pelo id", async () => {
    results = [{ data: null, error: null }];
    await renameActivityAsset("asset-1", "  Novo nome ");
    const update = calls.find((c) => c.op === "update");
    expect(update?.payload).toEqual({ label: "Novo nome" });
    expect(update?.eq).toEqual([["id", "asset-1"]]);
  });

  it("nome vazio volta a null — a lista cai para o host/nome do arquivo", async () => {
    results = [{ data: null, error: null }];
    await renameActivityAsset("asset-1", "   ");
    expect(calls.find((c) => c.op === "update")?.payload).toEqual({ label: null });
  });
});

describe("deleteActivityAsset", () => {
  it("arquivo: apaga o objeto do bucket ANTES da linha", async () => {
    results = [{ data: null, error: null }];
    await deleteActivityAsset({
      id: "asset-1",
      kind: "file",
      storage_path: `${TRIP}/${ACT_FLIGHT}/abc.pdf`,
    });

    expect(removals).toEqual([
      { bucket: TRIP_ASSET_BUCKET, paths: [`${TRIP}/${ACT_FLIGHT}/abc.pdf`] },
    ]);
    expect(calls.find((c) => c.op === "delete")?.eq).toEqual([["id", "asset-1"]]);
  });

  it("falha ao apagar o arquivo mantém a linha — perder a referência de um arquivo que continua existindo é pior", async () => {
    removeError = { message: "storage offline" };
    await expect(
      deleteActivityAsset({
        id: "asset-1",
        kind: "file",
        storage_path: `${TRIP}/${ACT_FLIGHT}/abc.pdf`,
      })
    ).rejects.toThrow("storage offline");
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("link: não toca no storage", async () => {
    results = [{ data: null, error: null }];
    await deleteActivityAsset({ id: "asset-2", kind: "link", storage_path: null });
    expect(removals).toHaveLength(0);
    expect(calls.find((c) => c.op === "delete")?.eq).toEqual([["id", "asset-2"]]);
  });
});

describe("signedAssetUrl", () => {
  it("link devolve a própria URL, sem assinar nada", async () => {
    const url = await signedAssetUrl(
      row({ kind: "link", url: "https://tap.test/checkin", storage_path: null })
    );
    expect(url).toBe("https://tap.test/checkin");
    expect(signs).toHaveLength(0);
  });

  it("pdf abre inline (sem download) e assina pelo TTL curto", async () => {
    await signedAssetUrl(row({ mime_type: "application/pdf" }));
    expect(signs).toHaveLength(1);
    expect(signs[0].bucket).toBe(TRIP_ASSET_BUCKET);
    expect(signs[0].ttl).toBe(TRIP_ASSET_SIGNED_URL_TTL_SECONDS);
    expect(signs[0].options.download).toBeUndefined();
  });

  it("imagem abre inline", async () => {
    await signedAssetUrl(
      row({ mime_type: "image/png", storage_path: `${TRIP}/${ACT_FLIGHT}/a.png` })
    );
    expect(signs[0].options.download).toBeUndefined();
  });

  it("html e svg forçam download — é a regra que substitui a allowlist de mime do bucket", async () => {
    await signedAssetUrl(
      row({
        mime_type: "text/html",
        label: "Reserva",
        storage_path: `${TRIP}/${ACT_FLIGHT}/a.html`,
      })
    );
    expect(signs[0].options.download).toBe("Reserva.html");

    await signedAssetUrl(
      row({
        mime_type: "image/svg+xml",
        label: "Mapa",
        storage_path: `${TRIP}/${ACT_FLIGHT}/m.svg`,
      })
    );
    expect(signs[1].options.download).toBe("Mapa.svg");
  });

  it("o nome do download é reconhecível, não o uuid do bucket", async () => {
    await signedAssetUrl(
      row({
        mime_type: "application/zip",
        label: "Documentos",
        storage_path: `${TRIP}/${ACT_FLIGHT}/9f0c.zip`,
      })
    );
    expect(signs[0].options.download).toBe("Documentos.zip");
  });

  it("rótulo que já tem a extensão não a ganha duas vezes", async () => {
    await signedAssetUrl(
      row({
        mime_type: "application/zip",
        label: "docs.zip",
        storage_path: `${TRIP}/${ACT_FLIGHT}/9f0c.zip`,
      })
    );
    expect(signs[0].options.download).toBe("docs.zip");
  });

  it("sem rótulo, cai para o nome no bucket", async () => {
    await signedAssetUrl(
      row({
        mime_type: "application/zip",
        label: null,
        storage_path: `${TRIP}/${ACT_FLIGHT}/9f0c.zip`,
      })
    );
    expect(signs[0].options.download).toBe("9f0c.zip");
  });
});

describe("bucket privado", () => {
  it("nenhum caminho do módulo chama getPublicUrl", async () => {
    results = [{ data: row(), error: null }];

    await uploadActivityFileAsset({
      tripId: TRIP,
      activityId: ACT_FLIGHT,
      file: new File(["x"], "a.pdf", { type: "application/pdf" }),
    });
    await signedAssetUrl(row());
    results = [{ data: [row()], error: null }];
    await fetchAssetsForTrip(TRIP);

    // A afirmação central da feature: o conteúdo é documento pessoal, e documento pessoal não tem
    // URL pública. Se alguém trocar `createSignedUrl` por `getPublicUrl`, este teste cai.
    expect(publicUrlCalls).toBe(0);
  });
});

describe("isMissingAssetSchema", () => {
  it("reconhece tabela e bucket ausentes", () => {
    expect(isMissingAssetSchema({ code: "42P01" })).toBe(true);
    expect(isMissingAssetSchema({ code: "PGRST205" })).toBe(true);
    expect(
      isMissingAssetSchema({ message: 'relation "trip_activity_asset" does not exist' })
    ).toBe(true);
    expect(isMissingAssetSchema({ message: "Bucket trip-assets not found" })).toBe(true);
  });

  it("não engole erro de verdade", () => {
    expect(isMissingAssetSchema(null)).toBe(false);
    expect(isMissingAssetSchema({ message: "network error", code: "XX000" })).toBe(false);
  });
});

/**
 * Feature 257 — a gravação dos rascunhos que o formulário de criação acumulou. O que estes testes
 * travam é o contrato que a tela depende: ordem preservada, `position` encadeada e **falha que não
 * derruba o resto** (o evento já existe quando isto roda).
 */
describe("createActivityAssetDrafts", () => {
  function draftFile(name: string): File {
    return new File([new Blob(["x"])], name, { type: "application/pdf" });
  }

  it("grava na ordem da lista, encadeando a position", async () => {
    const link = linkDraft("tap.pt", "Check-in");
    expect(link.ok).toBe(true);
    if (!link.ok) return;

    results = [
      { data: row({ id: "a-1", position: 0, label: "ingresso.pdf" }), error: null },
      {
        data: row({
          id: "a-2",
          position: 1,
          kind: "link",
          label: "Check-in",
          url: "https://tap.pt/",
          storage_path: null,
        }),
        error: null,
      },
    ];

    const result = await createActivityAssetDrafts({
      tripId: TRIP,
      activityId: ACT_VISIT,
      drafts: [fileDraft(draftFile("ingresso.pdf")), link.draft],
    });

    expect(result.failed).toEqual([]);
    expect(result.created.map((a) => a.id)).toEqual(["a-1", "a-2"]);

    const inserts = calls.filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(2);
    expect((inserts[0].payload as { position: number }).position).toBe(0);
    // A segunda recebe a primeira como `existing` — em paralelo, as duas nasceriam em 0.
    expect((inserts[1].payload as { position: number }).position).toBe(1);
    expect((inserts[1].payload as { url: string }).url).toBe("https://tap.pt/");
  });

  it("falha num rascunho não impede os outros, e volta nomeada", async () => {
    uploadError = { message: "Payload too large" };
    const link = linkDraft("https://tap.pt/checkin");
    expect(link.ok).toBe(true);
    if (!link.ok) return;

    results = [
      {
        data: row({
          id: "a-link",
          position: 0,
          kind: "link",
          label: null,
          url: "https://tap.pt/checkin",
          storage_path: null,
        }),
        error: null,
      },
    ];

    const result = await createActivityAssetDrafts({
      tripId: TRIP,
      activityId: ACT_VISIT,
      drafts: [fileDraft(draftFile("gigante.pdf")), link.draft],
    });

    expect(result.created.map((a) => a.id)).toEqual(["a-link"]);
    expect(result.failed).toEqual([
      { label: "gigante.pdf", message: "Payload too large" },
    ]);
    // O que falhou não ocupou position: o link entrou em 0.
    const inserts = calls.filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(1);
    expect((inserts[0].payload as { position: number }).position).toBe(0);
  });

  it("lista vazia não vai ao banco", async () => {
    const result = await createActivityAssetDrafts({
      tripId: TRIP,
      activityId: ACT_VISIT,
      drafts: [],
    });
    expect(result).toEqual({ created: [], failed: [] });
    expect(calls).toHaveLength(0);
    expect(uploads).toHaveLength(0);
  });
});
