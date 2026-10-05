import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as Row[],
    log: [] as string[],
    uploads: [] as { path: string; body: unknown; opts: Row }[],
    signed: [] as { path: string; ttl: number; opts: Row }[],
    selectError: null as { message: string; code?: string } | null,
  },
}));

vi.mock("@/lib/auth-user", () => ({ getCurrentUserId: vi.fn(async () => "me") }));

vi.mock("@/lib/supabase", () => {
  function table() {
    const filters: [string, unknown][] = [];
    let op = "select";
    let payload: Row | undefined;
    const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      eq: (k: string, v: unknown) => (filters.push([k, v]), builder),
      insert: (p: Row) => ((op = "insert"), (payload = p), builder),
      update: (p: Row) => ((op = "update"), (payload = p), builder),
      delete: () => ((op = "delete"), builder),
      single: async () => {
        const row = { id: `a${state.rows.length + 1}`, ...payload } as Row;
        state.rows.push(row);
        state.log.push("insert");
        return { data: row, error: null };
      },
      then: (resolve: (v: unknown) => void) => {
        if (op === "delete") {
          state.log.push("delete-row");
          state.rows = state.rows.filter((r) => !match(r));
          return resolve({ error: null });
        }
        if (op === "update") {
          state.rows.filter(match).forEach((r) => Object.assign(r, payload));
          return resolve({ error: null });
        }
        if (state.selectError) return resolve({ data: null, error: state.selectError });
        return resolve({ data: state.rows.filter(match), error: null });
      },
    };
    return builder;
  }
  return {
    supabase: {
      from: table,
      storage: {
        from: () => ({
          upload: async (path: string, body: unknown, opts: Row) => {
            state.log.push("upload");
            state.uploads.push({ path, body, opts });
            return { error: null };
          },
          remove: async () => {
            state.log.push("remove-file");
            return { error: null };
          },
          createSignedUrl: async (path: string, ttl: number, opts: Row) => {
            state.signed.push({ path, ttl, opts });
            return { data: { signedUrl: `https://signed/${path}` }, error: null };
          },
        }),
      },
    },
  };
});

import {
  addActivityLinkAsset,
  deleteActivityAsset,
  fetchAssetsForTrip,
  renameActivityAsset,
  signedAssetUrl,
  uploadActivityFileAsset,
} from "@/api/travel/activityAssets";
import type { TripActivityAsset } from "@/types/travel";

beforeEach(() => {
  state.rows = [];
  state.log = [];
  state.uploads = [];
  state.signed = [];
  state.selectError = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(42) }))
  );
});

describe("anexos da atividade", () => {
  it("sobe foto em {trip}/{atividade}/{uuid}.ext e grava a linha com rótulo do nome", async () => {
    const created = await uploadActivityFileAsset({
      tripId: "trip1",
      activityId: "act1",
      file: { uri: "file:///tmp/IMG_1.JPG", name: "IMG_1.JPG", mimeType: "image/jpeg", size: null },
    });
    const [upload] = state.uploads;
    expect(upload.path).toMatch(/^trip1\/act1\/[^/]+\.jpg$/);
    expect(upload.opts).toMatchObject({ upsert: false, contentType: "image/jpeg" });
    expect(created).toMatchObject({
      kind: "file",
      label: "IMG_1.JPG",
      storage_path: upload.path,
      size_bytes: 42,
      position: 0,
      created_by_user_id: "me",
    });
    expect(state.log).toEqual(["upload", "insert"]);
  });

  it("documento sem mime sobe como octet-stream e guarda o tamanho do seletor", async () => {
    const created = await uploadActivityFileAsset({
      tripId: "trip1",
      activityId: "act1",
      file: { uri: "file:///cache/Reserva Hotel.PDF", name: "Reserva Hotel.PDF", mimeType: null, size: 1234 },
      label: "Hotel",
    });
    expect(state.uploads[0].path).toMatch(/^trip1\/act1\/[^/]+\.pdf$/);
    expect(state.uploads[0].opts).toMatchObject({ contentType: "application/octet-stream" });
    expect(created).toMatchObject({ label: "Hotel", mime_type: null, size_bytes: 1234 });
  });

  it("link entra no fim da lista, rótulo vazio vira null", async () => {
    const existing = [{ position: 3 }, { position: 1 }] as TripActivityAsset[];
    const created = await addActivityLinkAsset({
      tripId: "trip1",
      activityId: "act1",
      url: "https://tap.pt/",
      label: "  ",
      existing,
    });
    expect(created).toMatchObject({ kind: "link", url: "https://tap.pt/", label: null, position: 4 });
  });

  it("excluir arquivo apaga o arquivo antes da linha; link não toca no bucket", async () => {
    state.rows = [
      { id: "f", kind: "file", storage_path: "trip1/act1/x.pdf" },
      { id: "l", kind: "link", storage_path: null },
    ];
    await deleteActivityAsset({ id: "f", kind: "file", storage_path: "trip1/act1/x.pdf" });
    expect(state.log).toEqual(["remove-file", "delete-row"]);
    state.log = [];
    await deleteActivityAsset({ id: "l", kind: "link", storage_path: null });
    expect(state.log).toEqual(["delete-row"]);
    expect(state.rows).toEqual([]);
  });

  it("renomear apara e vazio volta a null", async () => {
    state.rows = [{ id: "a", label: "x" }];
    await renameActivityAsset("a", "  Reserva  ");
    expect(state.rows[0].label).toBe("Reserva");
    await renameActivityAsset("a", "   ");
    expect(state.rows[0].label).toBeNull();
  });

  it("URL assinada: pdf abre inline; docx força download com o rótulo + extensão", async () => {
    const base = { trip_id: "t", activity_id: "a", url: null, size_bytes: null, position: 0 };
    const pdf = await signedAssetUrl({
      ...base,
      id: "1",
      kind: "file",
      label: "Cartão",
      storage_path: "t/a/u.pdf",
      mime_type: "application/pdf",
    });
    expect(pdf).toBe("https://signed/t/a/u.pdf");
    expect(state.signed[0]).toEqual({ path: "t/a/u.pdf", ttl: 300, opts: {} });

    await signedAssetUrl({
      ...base,
      id: "2",
      kind: "file",
      label: "Contrato",
      storage_path: "t/a/u.docx",
      mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(state.signed[1].opts).toEqual({ download: "Contrato.docx" });

    expect(
      await signedAssetUrl({ ...base, id: "3", kind: "link", label: null, storage_path: null, mime_type: null, url: " https://x.com " })
    ).toBe("https://x.com");
  });

  it("agrupa por atividade e tolera a tabela ainda não aplicada", async () => {
    state.rows = [
      { id: "1", trip_id: "t", activity_id: "a", position: 1, created_at: "2" },
      { id: "2", trip_id: "t", activity_id: "a", position: 0, created_at: "1" },
      { id: "3", trip_id: "t", activity_id: "b", position: 0, created_at: "1" },
    ];
    const grouped = await fetchAssetsForTrip("t");
    expect(Object.keys(grouped).sort()).toEqual(["a", "b"]);
    expect(grouped.a.map((r) => r.id)).toEqual(["2", "1"]);

    state.selectError = { message: "relation trip_activity_asset does not exist", code: "42P01" };
    expect(await fetchAssetsForTrip("t")).toEqual({});
  });
});
