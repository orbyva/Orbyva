import { describe, expect, it } from "vitest";

import { mapOrbWebPathToMobile } from "@/domain/orb/navigationMap";

describe("mapOrbWebPathToMobile", () => {
  it("reescreve aliases web → mobile", () => {
    expect(mapOrbWebPathToMobile("/shopping-list")).toEqual({ pathname: "/shopping" });
    expect(mapOrbWebPathToMobile("/finance/dashboard")).toEqual({ pathname: "/finance" });
    expect(mapOrbWebPathToMobile("/life/health")).toEqual({ pathname: "/health" });
    expect(mapOrbWebPathToMobile("/car")).toEqual({ pathname: "/cars" });
    expect(mapOrbWebPathToMobile("/timeline")).toEqual({ pathname: "/home" });
  });

  it("preserva query como params", () => {
    expect(mapOrbWebPathToMobile("/tasks?q=p%C3%A3o&status=pending")).toEqual({
      pathname: "/tasks",
      params: { q: "pão", status: "pending" },
    });
  });

  it("mapeia detalhe de projeto", () => {
    expect(mapOrbWebPathToMobile("/tasks/projects/abc-123?tab=tarefas")).toEqual({
      pathname: "/tasks/projects/[id]",
      params: { id: "abc-123", tab: "tarefas" },
    });
  });

  it("recusa caminho perigoso ou desconhecido", () => {
    expect(mapOrbWebPathToMobile("../evil")).toBeNull();
    expect(mapOrbWebPathToMobile("//evil.com")).toBeNull();
    expect(mapOrbWebPathToMobile("/ops")).toBeNull();
  });
});
