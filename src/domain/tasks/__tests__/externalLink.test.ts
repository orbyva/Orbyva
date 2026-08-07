import { describe, expect, it } from "vitest";
import { detectExternalProvider, detectGitHubLink } from "@/domain/tasks/externalLink";

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
