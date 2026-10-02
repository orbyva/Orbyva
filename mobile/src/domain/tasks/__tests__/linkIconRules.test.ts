import { describe, expect, it } from "vitest";

import {
  DEFAULT_LINK_ICON_RULES,
  LINK_ICON_PATTERN_MAX,
  matchLinkIconRule,
  moveRuleId,
  resolveLinkAppearance,
  validateLinkIconPattern,
  type LinkIconRuleShape,
} from "@/domain/tasks/linkIconRules";
import { countTagUsage } from "@/domain/tasks/tags";

const seeds: LinkIconRuleShape[] = DEFAULT_LINK_ICON_RULES.map((seed, position) => ({
  ...seed,
  position,
  enabled: true,
}));

describe("resolveLinkAppearance", () => {
  it("a regra específica (issue) vence a genérica (repo) por vir antes", () => {
    expect(
      resolveLinkAppearance("https://github.com/acme/app/issues/42", seeds)
    ).toEqual({ iconKey: "github", iconUrl: null, label: "acme/app#42" });
    expect(resolveLinkAppearance("https://github.com/acme/app", seeds).label).toBe(
      "acme/app"
    );
  });

  it("a ordem vem de position, não da ordem do array", () => {
    const reversed = [...seeds].reverse();
    expect(
      resolveLinkAppearance("https://github.com/acme/app/pull/7", reversed).label
    ).toBe("acme/app#7");
  });

  it("regra desligada ou com regex inválida é pulada sem quebrar", () => {
    const rules: LinkIconRuleShape[] = [
      { pattern: "(", label_template: "quebrada", icon_key: "flag", position: 0, enabled: true },
      { pattern: "figma", label_template: "off", icon_key: "flag", position: 1, enabled: false },
      ...seeds.map((s) => ({ ...s, position: s.position + 2 })),
    ];
    expect(
      resolveLinkAppearance("https://www.figma.com/design/abc/Tela-Login", rules)
    ).toEqual({ iconKey: "figma", iconUrl: null, label: "Tela-Login" });
  });

  it("sem regra que case, cai no host da URL; ícone da biblioteca vence o preset", () => {
    expect(resolveLinkAppearance("https://www.exemplo.com.br/a", seeds)).toEqual({
      iconKey: "external",
      iconUrl: null,
      label: "exemplo.com.br",
    });
    const withLibrary: LinkIconRuleShape[] = [
      { pattern: "exemplo", label_template: "$$ $9", icon_key: "flag", icon_url: "https://cdn/x.png", position: 0, enabled: true },
    ];
    expect(resolveLinkAppearance("https://exemplo.com", withLibrary)).toEqual({
      iconKey: null,
      iconUrl: "https://cdn/x.png",
      label: "$",
    });
  });

  it("matchLinkIconRule devolve null para URL vazia", () => {
    expect(matchLinkIconRule("   ", seeds)).toBeNull();
  });
});

describe("validateLinkIconPattern", () => {
  it("explica o problema da expressão", () => {
    expect(validateLinkIconPattern("")).toBe("Informe a expressão regular.");
    expect(validateLinkIconPattern("a".repeat(LINK_ICON_PATTERN_MAX + 1))).toMatch(
      /no máximo 200/
    );
    expect(validateLinkIconPattern("([")).toMatch(/Invalid regular expression/);
    expect(validateLinkIconPattern("github\\.com")).toBeNull();
  });
});

describe("moveRuleId", () => {
  it("troca com a vizinha e recusa passar da borda", () => {
    expect(moveRuleId(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveRuleId(["a", "b", "c"], "a", -1)).toBeNull();
    expect(moveRuleId(["a", "b", "c"], "c", 1)).toBeNull();
    expect(moveRuleId(["a"], "x", 1)).toBeNull();
  });
});

describe("countTagUsage", () => {
  it("soma tarefas e projetos sem contar tag repetida na mesma linha", () => {
    const usage = countTagUsage([
      { tag_ids: ["t1", "t2"] },
      { tag_ids: ["t1", "t1"] },
      { tag_ids: null },
      { tag_ids: ["t2"] },
    ]);
    expect(usage.get("t1")).toBe(2);
    expect(usage.get("t2")).toBe(2);
    expect(usage.get("t3")).toBeUndefined();
  });
});
