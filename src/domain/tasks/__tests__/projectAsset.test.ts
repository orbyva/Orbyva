import { describe, it, expect } from "vitest";
import {
  normalizeProjectAssetDraft,
  isValidAssetUrl,
  EXTERNAL_URL_HINT,
} from "../projectAsset";
import { EXTERNAL_URL_HINT as EXTERNAL_LINK_FIELD_HINT } from "@/pages/admin/tasks/TaskExternalLinksField";

describe("normalizeProjectAssetDraft", () => {
  it("title vazio vira host", () => {
    const d = normalizeProjectAssetDraft({
      title: "",
      url: "https://github.com/user/repo",
      comment: null,
      position: 0,
      project_id: "proj-1",
      kind: "link",
    });
    expect(d.title).toBe("github.com");
  });

  it("host impossível de extrair cai na URL", () => {
    const d = normalizeProjectAssetDraft({
      title: "",
      url: "not-a-url",
      comment: null,
      position: 0,
      project_id: "proj-1",
      kind: "link",
    });
    expect(d.title).toBe("not-a-url");
  });

  it("comentário só com espaço vira null", () => {
    const d = normalizeProjectAssetDraft({
      title: "Título",
      url: "https://example.com",
      comment: "   ",
      position: 0,
      project_id: "proj-1",
      kind: "link",
    });
    expect(d.comment).toBeNull();
  });

  it("URL sem http(s) é recusada por isValidAssetUrl", () => {
    expect(isValidAssetUrl("ftp://example.com", "link")).toBe(false);
    expect(isValidAssetUrl("example.com", "link")).toBe(false);
    expect(isValidAssetUrl("https://example.com", "link")).toBe(true);
  });

  it("título com espaços é aparado", () => {
    const d = normalizeProjectAssetDraft({
      title: "  Título  ",
      url: "https://example.com",
      comment: null,
      position: 0,
      project_id: "proj-1",
      kind: "link",
    });
    expect(d.title).toBe("Título");
  });

  it("kind='file' sempre passa na validação de URL", () => {
    expect(isValidAssetUrl("", "file")).toBe(true);
    expect(isValidAssetUrl("qualquer-coisa", "file")).toBe(true);
  });

  it("EXTERNAL_URL_HINT é a mesma constante da 085", () => {
    expect(EXTERNAL_URL_HINT).toBe(EXTERNAL_LINK_FIELD_HINT);
  });
});