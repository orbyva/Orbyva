import { describe, expect, it } from "vitest";
import {
  MAX_ACTIVITY_ASSET_BYTES,
  draftDisplayLabel,
  draftSizeBytes,
  fileDraft,
  linkDraft,
  oversizedMessage,
  removeDraft,
  splitOversizedFiles,
} from "@/domain/travel/activityAssetDrafts";

/**
 * Feature 257: o rascunho é o que o formulário de criação guarda **antes** de a atividade existir.
 * O que estes testes travam é que ele já chega validado e rotulado — a gravação não deve ter nada
 * a decidir, porque lá o evento já foi criado e uma recusa chegaria tarde.
 */

function file(name: string, size = 10, type = "application/pdf"): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe("rascunho de arquivo", () => {
  it("usa o nome do arquivo como rótulo quando nenhum é dado", () => {
    const draft = fileDraft(file("ingresso.pdf"));
    expect(draft.kind).toBe("file");
    expect(draft.label).toBe("ingresso.pdf");
    expect(draftDisplayLabel(draft)).toBe("ingresso.pdf");
    expect(draftSizeBytes(draft)).toBe(10);
  });

  it("o rótulo explícito vence o nome do arquivo", () => {
    const draft = fileDraft(file("a1b2.pdf"), "  Ingresso do show  ");
    expect(draft.label).toBe("Ingresso do show");
  });

  it("cada rascunho tem chave própria", () => {
    const a = fileDraft(file("x.pdf"));
    const b = fileDraft(file("x.pdf"));
    expect(a.key).not.toBe(b.key);
  });
});

describe("rascunho de link", () => {
  it("normaliza o que o usuário cola sem esquema", () => {
    const result = linkDraft("tap.pt");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.url).toBe("https://tap.pt/");
    // Sem rótulo, a lista cai no host.
    expect(draftDisplayLabel(result.draft)).toBe("tap.pt");
    expect(draftSizeBytes(result.draft)).toBeNull();
  });

  it("recusa esquema que não é http(s) — e recusa na adição, não na gravação", () => {
    expect(linkDraft("ftp://x.test/a")).toEqual({ ok: false, reason: "scheme" });
    expect(linkDraft("javascript:alert(1)")).toEqual({
      ok: false,
      reason: "scheme",
    });
  });

  it("recusa vazio e URL sem host", () => {
    expect(linkDraft("   ")).toEqual({ ok: false, reason: "empty" });
    expect(linkDraft("https://")).toEqual({ ok: false, reason: "malformed" });
  });

  it("rótulo vazio vira null, não string vazia", () => {
    const result = linkDraft("https://x.test/a", "   ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.label).toBeNull();
  });
});

describe("teto de tamanho", () => {
  it("separa os grandes dos aceitos em vez de recusar o lote", () => {
    const ok = file("ok.pdf", 10);
    const big = file("gigante.pdf", MAX_ACTIVITY_ASSET_BYTES + 1);
    const { accepted, oversized } = splitOversizedFiles([ok, big]);
    expect(accepted).toEqual([ok]);
    expect(oversized).toEqual([big]);
  });

  it("o arquivo exatamente no teto passa", () => {
    const edge = file("no-limite.pdf", MAX_ACTIVITY_ASSET_BYTES);
    expect(splitOversizedFiles([edge]).oversized).toEqual([]);
  });

  it("a mensagem nomeia os arquivos recusados", () => {
    expect(oversizedMessage([file("a.pdf")])).toBe(
      "“a.pdf” passa de 10 MB, o limite por arquivo."
    );
    expect(oversizedMessage([file("a.pdf"), file("b.pdf")])).toBe(
      "“a.pdf”, “b.pdf” passam de 10 MB, o limite por arquivo."
    );
  });
});

describe("remoção", () => {
  it("tira só o rascunho da chave pedida", () => {
    const a = fileDraft(file("a.pdf"));
    const b = fileDraft(file("b.pdf"));
    expect(removeDraft([a, b], a.key)).toEqual([b]);
    expect(removeDraft([a, b], "inexistente")).toEqual([a, b]);
  });
});
