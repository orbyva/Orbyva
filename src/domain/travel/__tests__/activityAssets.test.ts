import { describe, expect, it } from "vitest";
import {
  ASSET_URL_REJECTION_MESSAGES,
  assetDisplayLabel,
  fileExtension,
  fileNameFromPath,
  formatAssetSize,
  hostFromUrl,
  isInlineViewableMime,
  nextAssetPosition,
  normalizeAssetLabel,
  normalizeAssetUrl,
  sortAssets,
} from "@/domain/travel/activityAssets";
import type { TripActivityAsset } from "@/types/travel";

function asset(over: Partial<TripActivityAsset> = {}): TripActivityAsset {
  return {
    id: "a1",
    trip_id: "t1",
    activity_id: "act1",
    kind: "link",
    label: null,
    url: "https://tap.test/checkin",
    storage_path: null,
    mime_type: null,
    size_bytes: null,
    position: 0,
    ...over,
  };
}

describe("isInlineViewableMime", () => {
  it("abre pdf e imagem inline", () => {
    expect(isInlineViewableMime("application/pdf")).toBe(true);
    expect(isInlineViewableMime("image/png")).toBe(true);
    expect(isInlineViewableMime("image/jpeg")).toBe(true);
    expect(isInlineViewableMime("IMAGE/WEBP")).toBe(true);
  });

  it("não abre svg inline — é markup, e markup aberto como navegação de topo roda script", () => {
    expect(isInlineViewableMime("image/svg+xml")).toBe(false);
  });

  it("baixa todo o resto (incluindo html, que é o caso perigoso)", () => {
    expect(isInlineViewableMime("text/html")).toBe(false);
    expect(
      isInlineViewableMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(false);
    expect(isInlineViewableMime("application/zip")).toBe(false);
  });

  it("mime ausente não é visualizável", () => {
    expect(isInlineViewableMime(null)).toBe(false);
    expect(isInlineViewableMime(undefined)).toBe(false);
    expect(isInlineViewableMime("   ")).toBe(false);
  });
});

describe("fileNameFromPath", () => {
  it("devolve a última parte do caminho", () => {
    expect(fileNameFromPath("t1/act1/abc.pdf")).toBe("abc.pdf");
  });

  it("caminho vazio devolve vazio", () => {
    expect(fileNameFromPath(null)).toBe("");
    expect(fileNameFromPath("  ")).toBe("");
  });
});

describe("hostFromUrl", () => {
  it("tira o www", () => {
    expect(hostFromUrl("https://www.tap.pt/checkin")).toBe("tap.pt");
  });

  it("URL que não parseia devolve vazio em vez de string de erro", () => {
    expect(hostFromUrl("nao é url")).toBe("");
    expect(hostFromUrl(null)).toBe("");
  });
});

describe("assetDisplayLabel", () => {
  it("prefere o rótulo do usuário", () => {
    expect(assetDisplayLabel(asset({ label: "Cartão de embarque" }))).toBe(
      "Cartão de embarque"
    );
  });

  it("link sem rótulo cai para o host", () => {
    expect(assetDisplayLabel(asset({ url: "https://www.tap.pt/x" }))).toBe("tap.pt");
  });

  it("arquivo sem rótulo cai para o nome do arquivo", () => {
    expect(
      assetDisplayLabel(
        asset({ kind: "file", url: null, storage_path: "t1/act1/bp.pdf" })
      )
    ).toBe("bp.pdf");
  });

  it("nunca devolve vazio — a linha da lista sempre tem o que escrever", () => {
    expect(assetDisplayLabel(asset({ url: null }))).toBe("Link");
    expect(
      assetDisplayLabel(asset({ kind: "file", url: null, storage_path: null }))
    ).toBe("Arquivo");
    expect(assetDisplayLabel(asset({ label: "   " }))).toBe("tap.test");
  });
});

describe("fileExtension", () => {
  it("devolve a extensão em minúscula, sem ponto", () => {
    expect(fileExtension("Reserva.PDF")).toBe("pdf");
    expect(fileExtension("bp.pkpass")).toBe("pkpass");
  });

  it("sem extensão devolve vazio", () => {
    expect(fileExtension("arquivo")).toBe("");
    expect(fileExtension(null)).toBe("");
  });
});

describe("nextAssetPosition", () => {
  it("lista vazia começa em 0", () => {
    expect(nextAssetPosition([])).toBe(0);
  });

  it("entra no fim, uma a mais que a maior em uso", () => {
    expect(
      nextAssetPosition([
        asset({ id: "a", position: 0 }),
        asset({ id: "b", position: 4 }),
      ])
    ).toBe(5);
  });
});

describe("sortAssets", () => {
  it("ordena por position", () => {
    const sorted = sortAssets([
      asset({ id: "b", position: 2 }),
      asset({ id: "a", position: 1 }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("empate em position desempata por created_at e id — sem isso a ordem oscila entre renders", () => {
    const sorted = sortAssets([
      asset({ id: "z", position: 0, created_at: "2026-01-02T00:00:00Z" }),
      asset({ id: "y", position: 0, created_at: "2026-01-01T00:00:00Z" }),
      asset({ id: "x", position: 0, created_at: "2026-01-01T00:00:00Z" }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["x", "y", "z"]);
  });

  it("não muta a entrada", () => {
    const input = [asset({ id: "b", position: 2 }), asset({ id: "a", position: 1 })];
    sortAssets(input);
    expect(input.map((a) => a.id)).toEqual(["b", "a"]);
  });
});

describe("normalizeAssetUrl", () => {
  it("aceita http e https", () => {
    expect(normalizeAssetUrl("https://tap.pt/checkin")).toEqual({
      ok: true,
      url: "https://tap.pt/checkin",
    });
    expect(normalizeAssetUrl("http://tap.pt/")).toEqual({
      ok: true,
      url: "http://tap.pt/",
    });
  });

  it("completa com https quando não há esquema — colar 'tap.pt' é o que as pessoas fazem", () => {
    expect(normalizeAssetUrl("tap.pt/checkin")).toEqual({
      ok: true,
      url: "https://tap.pt/checkin",
    });
  });

  it("recusa esquema não-http em vez de prefixá-lo", () => {
    // Prefixar transformaria isto numa URL http válida e aparentemente inofensiva.
    for (const raw of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "blob:https://x.test/abc",
      "file:///etc/passwd",
    ]) {
      expect(normalizeAssetUrl(raw)).toEqual({ ok: false, reason: "scheme" });
    }
  });

  it("recusa vazio e malformado com motivos distintos", () => {
    expect(normalizeAssetUrl("   ")).toEqual({ ok: false, reason: "empty" });
    expect(normalizeAssetUrl("https://")).toEqual({
      ok: false,
      reason: "malformed",
    });
    // Host sem ponto não é link de nada.
    expect(normalizeAssetUrl("localhost")).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("todo motivo tem mensagem", () => {
    for (const reason of ["empty", "scheme", "malformed"] as const) {
      expect(ASSET_URL_REJECTION_MESSAGES[reason]).toBeTruthy();
    }
  });
});

describe("normalizeAssetLabel", () => {
  it("vazio vira null", () => {
    expect(normalizeAssetLabel("")).toBeNull();
    expect(normalizeAssetLabel("   ")).toBeNull();
    expect(normalizeAssetLabel(null)).toBeNull();
  });

  it("apara as bordas", () => {
    expect(normalizeAssetLabel("  Cartão  ")).toBe("Cartão");
  });
});

describe("formatAssetSize", () => {
  it("B, KB e MB", () => {
    expect(formatAssetSize(512)).toBe("512 B");
    expect(formatAssetSize(2048)).toBe("2 KB");
    expect(formatAssetSize(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatAssetSize(12 * 1024 * 1024)).toBe("12 MB");
  });

  it("sem tamanho devolve vazio — a UI omite o pedaço em vez de escrever 0 B", () => {
    expect(formatAssetSize(null)).toBe("");
    expect(formatAssetSize(0)).toBe("");
    expect(formatAssetSize(Number.NaN)).toBe("");
  });
});
