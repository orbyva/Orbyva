import { describe, expect, it } from "vitest";
import {
  EXTERNAL_LINK_LABEL_MAX,
  describeExternalLink,
  detectExternalProvider,
  detectGitHubLink,
  normalizeExternalLinkDrafts,
} from "@/domain/tasks/externalLink";
import type { TaskExternalLinkDraft } from "@/types/tasks";

describe("detectGitHubLink", () => {
  it("detecta uma issue do GitHub", () => {
    expect(detectGitHubLink("https://github.com/pedroynk/Orbyva/issues/123")).toEqual({
      owner: "pedroynk",
      repo: "Orbyva",
      number: 123,
      kind: "issues",
    });
  });

  it("detecta um PR do GitHub", () => {
    expect(detectGitHubLink("https://github.com/pedroynk/Orbyva/pull/45")).toEqual({
      owner: "pedroynk",
      repo: "Orbyva",
      number: 45,
      kind: "pull",
    });
  });

  it("aceita URL com querystring/fragmento/barra final", () => {
    expect(detectGitHubLink("https://github.com/a/b/issues/1?tab=comments")).not.toBeNull();
    expect(detectGitHubLink("https://github.com/a/b/issues/1#issuecomment-1")).not.toBeNull();
    expect(detectGitHubLink("https://github.com/a/b/issues/1/")).not.toBeNull();
  });

  it("aceita sem www e sem protocolo explícito https", () => {
    expect(detectGitHubLink("http://github.com/a/b/issues/1")).not.toBeNull();
    expect(detectGitHubLink("https://www.github.com/a/b/issues/1")).not.toBeNull();
  });

  it("retorna null para URLs que não são issue/PR do GitHub", () => {
    expect(detectGitHubLink("https://github.com/pedroynk/Orbyva")).toBeNull();
    expect(detectGitHubLink("https://gitlab.com/a/b/issues/1")).toBeNull();
    expect(detectGitHubLink("https://example.com")).toBeNull();
    expect(detectGitHubLink("")).toBeNull();
  });
});

describe("detectExternalProvider", () => {
  it("retorna 'github' para link de issue/PR", () => {
    expect(detectExternalProvider("https://github.com/a/b/issues/1")).toBe("github");
  });

  it("retorna null para outras URLs", () => {
    expect(detectExternalProvider("https://example.com/ticket/1")).toBeNull();
  });
});

/** Atalho pra montar rascunho sem repetir os campos que o caso não está testando. */
function draft(over: Partial<TaskExternalLinkDraft> & { url: string }): TaskExternalLinkDraft {
  return { comment: null, position: 0, ...over };
}

describe("normalizeExternalLinkDrafts", () => {
  it("descarta linha com URL vazia, levando o comentário junto", () => {
    const { drafts } = normalizeExternalLinkDrafts([
      draft({ url: "https://a.com" }),
      draft({ url: "", comment: "comentário órfão" }),
      draft({ url: "   ", comment: "só espaço na URL" }),
    ]);
    expect(drafts).toEqual([{ url: "https://a.com", comment: null, position: 0 }]);
  });

  it("apara espaços da URL e do comentário", () => {
    const { drafts } = normalizeExternalLinkDrafts([
      draft({ url: "  https://a.com  ", comment: "  vale a pena  " }),
    ]);
    expect(drafts[0].url).toBe("https://a.com");
    expect(drafts[0].comment).toBe("vale a pena");
  });

  it("comentário que sobra vazio vira null, não string vazia", () => {
    const { drafts } = normalizeExternalLinkDrafts([draft({ url: "https://a.com", comment: "   " })]);
    expect(drafts[0].comment).toBeNull();
  });

  it("recalcula position em 0..n-1 depois de remover a linha do meio", () => {
    const { drafts } = normalizeExternalLinkDrafts([
      draft({ url: "https://a.com", position: 0 }),
      draft({ url: "", position: 1 }),
      draft({ url: "https://c.com", position: 2 }),
      draft({ url: "https://d.com", position: 3 }),
    ]);
    expect(drafts.map((d) => [d.url, d.position])).toEqual([
      ["https://a.com", 0],
      ["https://c.com", 1],
      ["https://d.com", 2],
    ]);
  });

  it("reporta URL repetida e mantém só a primeira ocorrência", () => {
    const { drafts, duplicates } = normalizeExternalLinkDrafts([
      draft({ url: "https://a.com", comment: "primeira" }),
      draft({ url: "https://b.com" }),
      draft({ url: "https://a.com", comment: "segunda" }),
    ]);
    expect(duplicates).toEqual(["https://a.com"]);
    expect(drafts.map((d) => d.url)).toEqual(["https://a.com", "https://b.com"]);
    expect(drafts[0].comment).toBe("primeira");
  });

  it("URLs que só diferem por espaço contam como a mesma duplicata", () => {
    const { drafts, duplicates } = normalizeExternalLinkDrafts([
      draft({ url: "https://a.com" }),
      draft({ url: "  https://a.com " }),
    ]);
    expect(duplicates).toEqual(["https://a.com"]);
    expect(drafts).toHaveLength(1);
  });

  it("a mesma URL três vezes é reportada uma vez só", () => {
    const { duplicates } = normalizeExternalLinkDrafts([
      draft({ url: "https://a.com" }),
      draft({ url: "https://a.com" }),
      draft({ url: "https://a.com" }),
    ]);
    expect(duplicates).toEqual(["https://a.com"]);
  });

  it("preserva o id do link já gravado (é ele que a UI usa como chave da linha)", () => {
    const { drafts } = normalizeExternalLinkDrafts([
      draft({ id: "l1", url: "https://a.com", position: 5 }),
    ]);
    expect(drafts[0]).toEqual({ id: "l1", url: "https://a.com", comment: null, position: 0 });
  });

  it("lista vazia devolve vazio, sem erro", () => {
    expect(normalizeExternalLinkDrafts([])).toEqual({ drafts: [], duplicates: [] });
  });
});

describe("describeExternalLink", () => {
  it("issue do GitHub sai como owner/repo#N com o ícone do GitHub", () => {
    expect(describeExternalLink("https://github.com/pedroynk/Orbyva/issues/123")).toEqual({
      iconKey: "github",
      label: "pedroynk/Orbyva#123",
    });
  });

  it("PR do GitHub também sai como owner/repo#N", () => {
    expect(describeExternalLink("https://github.com/a/b/pull/45").label).toBe("a/b#45");
  });

  it("repositório do GitHub, sem issue, cai no host", () => {
    expect(describeExternalLink("https://github.com/pedroynk/Orbyva")).toEqual({
      iconKey: "external",
      label: "github.com",
    });
  });

  it("URL comum vira o host, sem o www.", () => {
    expect(describeExternalLink("https://www.figma.com/file/abc/Design").label).toBe("figma.com");
    expect(describeExternalLink("https://docs.google.com/document/d/abc").label).toBe(
      "docs.google.com"
    );
  });

  it("URL sem protocolo não lança e cai na string crua", () => {
    expect(describeExternalLink("github.com/a/b")).toEqual({
      iconKey: "external",
      label: "github.com/a/b",
    });
  });

  it("string que não é URL nenhuma não lança", () => {
    expect(describeExternalLink("isto não é um link")).toEqual({
      iconKey: "external",
      label: "isto não é um link",
    });
  });

  it("URL vazia devolve rótulo vazio sem quebrar", () => {
    expect(describeExternalLink("")).toEqual({ iconKey: "external", label: "" });
    expect(describeExternalLink("    ")).toEqual({ iconKey: "external", label: "" });
  });

  it("rótulo longo é cortado com … no limite exportado", () => {
    const longo = `https://${"a".repeat(90)}.com/x`;
    const { label } = describeExternalLink(longo);
    expect(label).toHaveLength(EXTERNAL_LINK_LABEL_MAX + 1);
    expect(label.endsWith("…")).toBe(true);
  });

  it("rótulo de GitHub longo também é cortado (mesma constante, um corte só)", () => {
    const { label } = describeExternalLink(
      `https://github.com/${"o".repeat(40)}/${"r".repeat(40)}/issues/1`
    );
    expect(label).toHaveLength(EXTERNAL_LINK_LABEL_MAX + 1);
    expect(label.endsWith("…")).toBe(true);
  });
});
