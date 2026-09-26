import { describe, expect, it } from "vitest";
import {
  LINK_ICON_PATTERN_MAX,
  applyLabelTemplate,
  compileLinkIconRule,
  validateLinkIconPattern,
  matchLinkIconRule,
  resolveLinkAppearance,
  type LinkIconRuleShape,
} from "@/domain/tasks/linkIconRules";
import {
  EXTERNAL_LINK_LABEL_MAX,
  describeExternalLink,
} from "@/domain/tasks/externalLink";
import type { LinkIconRule } from "@/types/tasks";

describe("compileLinkIconRule", () => {
  it("compila com a flag `i` e sem `g`", () => {
    const re = compileLinkIconRule({ pattern: "^https?://github\\.com/" });
    expect(re).toBeInstanceOf(RegExp);
    expect(re?.flags).toBe("i");
    expect(re?.global).toBe(false);
  });

  it("devolve null (em vez de lançar) quando a regex não compila", () => {
    expect(() => compileLinkIconRule({ pattern: "([unclosed" })).not.toThrow();
    expect(compileLinkIconRule({ pattern: "([unclosed" })).toBeNull();
  });

  it("devolve null para pattern vazia ou só espaços", () => {
    expect(compileLinkIconRule({ pattern: "" })).toBeNull();
    expect(compileLinkIconRule({ pattern: "   " })).toBeNull();
  });

  it("devolve null acima do teto de caracteres", () => {
    const noLimite = "a".repeat(LINK_ICON_PATTERN_MAX);
    expect(compileLinkIconRule({ pattern: noLimite })).toBeInstanceOf(RegExp);
    expect(compileLinkIconRule({ pattern: `${noLimite}a` })).toBeNull();
  });
});

describe("validateLinkIconPattern", () => {
  it("aceita uma regex válida", () => {
    expect(validateLinkIconPattern("^https?://github\\.com/([^/]+)")).toBeNull();
  });

  it("devolve a mensagem do RegExp quando a sintaxe é inválida", () => {
    const message = validateLinkIconPattern("([unclosed");
    expect(message).toBeTruthy();
    expect(message).toMatch(/regular expression/i);
  });

  it("cobra a expressão e o teto de caracteres", () => {
    expect(validateLinkIconPattern("  ")).toBe("Informe a expressão regular.");
    expect(validateLinkIconPattern("a".repeat(LINK_ICON_PATTERN_MAX + 1))).toBe(
      `A expressão deve ter no máximo ${LINK_ICON_PATTERN_MAX} caracteres.`
    );
  });
});

describe("applyLabelTemplate", () => {
  const issueUrl = "https://github.com/pedroynk/Orbyva/issues/123";
  const issueMatch = issueUrl.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/i
  ) as RegExpMatchArray;

  it("substitui os grupos capturados", () => {
    expect(applyLabelTemplate("$1/$2#$3", issueMatch, issueUrl)).toBe("pedroynk/Orbyva#123");
  });

  it("cai no host quando o template está vazio", () => {
    expect(applyLabelTemplate("", issueMatch, issueUrl)).toBe("github.com");
    expect(applyLabelTemplate(null, issueMatch, issueUrl)).toBe("github.com");
  });
});

/** Uma regra completa por padrão; cada teste sobrescreve só o que interessa. */
function rule(over: Partial<LinkIconRuleShape> = {}): LinkIconRuleShape {
  return {
    pattern: "github\\.com",
    label_template: "GitHub",
    icon_key: "github",
    icon_url: null,
    position: 0,
    enabled: true,
    ...over,
  };
}

describe("matchLinkIconRule — ordem e conflito", () => {
  const issueUrl = "https://github.com/pedroynk/Orbyva/issues/123";
  const especifica = rule({
    pattern: "^https?://github\\.com/([^/]+)/([^/]+)/issues/(\\d+)",
    label_template: "$1/$2#$3",
    position: 0,
  });
  const generica = rule({ pattern: "github\\.com", label_template: "GitHub", position: 1 });

  it("a regra de `position` menor vence quando as duas casam", () => {
    const match = matchLinkIconRule(issueUrl, [generica, especifica]);
    expect(match?.rule).toBe(especifica);
    expect(match?.label).toBe("pedroynk/Orbyva#123");
  });

  it("reordenar inverte o vencedor", () => {
    const match = matchLinkIconRule(issueUrl, [
      { ...especifica, position: 1 },
      { ...generica, position: 0 },
    ]);
    expect(match?.label).toBe("GitHub");
  });

  it("não reordena a lista recebida", () => {
    const rules = [generica, especifica];
    matchLinkIconRule(issueUrl, rules);
    expect(rules[0]).toBe(generica);
  });

  it("pula a regra desabilitada mesmo quando ela casa", () => {
    const match = matchLinkIconRule(issueUrl, [
      { ...especifica, enabled: false },
      generica,
    ]);
    expect(match?.label).toBe("GitHub");
  });

  it("pula a regra com regex inválida, sem lançar", () => {
    const quebrada = rule({ pattern: "([unclosed", position: 0 });
    expect(() => matchLinkIconRule(issueUrl, [quebrada, generica])).not.toThrow();
    expect(matchLinkIconRule(issueUrl, [quebrada, generica])?.label).toBe("GitHub");
  });

  it("devolve null quando nenhuma regra casa", () => {
    expect(matchLinkIconRule("https://figma.com/file/abc", [generica])).toBeNull();
  });
});

describe("resolveLinkAppearance", () => {
  const issueUrl = "https://github.com/pedroynk/Orbyva/issues/123";

  it("lista vazia devolve o fallback de `describeExternalLink`", () => {
    expect(resolveLinkAppearance(issueUrl, [])).toEqual({
      ...describeExternalLink(issueUrl),
      iconUrl: null,
    });
    expect(resolveLinkAppearance("https://docs.google.com/document/d/1", [])).toEqual({
      iconKey: "external",
      iconUrl: null,
      label: "docs.google.com",
    });
  });

  it("usa o ícone e o rótulo da regra vencedora", () => {
    expect(
      resolveLinkAppearance(issueUrl, [
        rule({ pattern: "^https?://github\\.com/([^/]+)", label_template: "$1", icon_key: "star" }),
      ])
    ).toEqual({ iconKey: "star", iconUrl: null, label: "pedroynk" });
  });

  it("ícone da biblioteca tem prioridade e zera o preset", () => {
    expect(
      resolveLinkAppearance(issueUrl, [
        rule({ icon_key: "star", icon_url: "https://cdn.test/gh.svg" }),
      ])
    ).toEqual({ iconKey: null, iconUrl: "https://cdn.test/gh.svg", label: "GitHub" });
  });
});

describe("applyLabelTemplate — bordas do rótulo", () => {
  const issueUrl = "https://github.com/pedroynk/Orbyva/issues/123";
  const issuePattern =
    "^https?://(?:www\\.)?github\\.com/([^/]+)/([^/]+)/(?:issues|pull)/(\\d+)";

  function labelOf(template: string | null, url = issueUrl, pattern = issuePattern) {
    return matchLinkIconRule(url, [rule({ pattern, label_template: template })])?.label;
  }

  it("reproduz `owner/repo#123` — o que era código, agora como dado", () => {
    expect(labelOf("$1/$2#$3")).toBe("pedroynk/Orbyva#123");
  });

  it("grupo inexistente vira vazio, não o literal `$7`", () => {
    expect(labelOf("$1$7")).toBe("pedroynk");
  });

  it("grupo opcional que não capturou vira vazio", () => {
    const match = "https://github.com/pedroynk".match(
      /^https?:\/\/github\.com\/([^/]+)(?:\/(issues))?/i
    ) as RegExpMatchArray;
    expect(applyLabelTemplate("$1|$2", match, "https://github.com/pedroynk")).toBe("pedroynk|");
  });

  it("template vazio cai no host", () => {
    expect(labelOf("")).toBe("github.com");
  });

  it("template que resulta em só espaços cai no host", () => {
    expect(labelOf("  $7  ")).toBe("github.com");
  });

  it("`$$` vira um `$` literal e não engole o dígito seguinte", () => {
    expect(labelOf("$$ $1")).toBe("$ pedroynk");
    expect(labelOf("$$1")).toBe("$1");
  });

  it("corta o rótulo longo com `…` na mesma régua do chip sem regra", () => {
    const label = labelOf("x".repeat(EXTERNAL_LINK_LABEL_MAX + 20));
    expect(label).toHaveLength(EXTERNAL_LINK_LABEL_MAX + 1);
    expect(label?.endsWith("…")).toBe(true);
  });

  it("URL que não parseia não quebra e cai na string crua", () => {
    expect(labelOf("", "github.com/pedroynk/Orbyva/issues/9", "github\\.com")).toBe(
      "github.com/pedroynk/Orbyva/issues/9"
    );
  });
});

describe("matchLinkIconRule — borda de entrada", () => {
  it("URL vazia (ou só espaços) não casa regra nenhuma", () => {
    const casaTudo = rule({ pattern: ".*" });
    expect(matchLinkIconRule("", [casaTudo])).toBeNull();
    expect(matchLinkIconRule("   ", [casaTudo])).toBeNull();
    expect(resolveLinkAppearance("", [casaTudo])).toEqual({
      iconKey: "external",
      iconUrl: null,
      label: "",
    });
  });

  it("URL sem protocolo casa normalmente — a regra é sobre a string, não sobre um `URL` válido", () => {
    expect(matchLinkIconRule("github.com/pedroynk", [rule()])?.label).toBe("GitHub");
  });

  it("o casamento é case-insensitive", () => {
    expect(matchLinkIconRule("https://GitHub.com/pedroynk", [rule()])?.label).toBe("GitHub");
    expect(
      matchLinkIconRule("https://GITHUB.COM/pedroynk/Orbyva/ISSUES/7", [
        rule({ pattern: "/issues/(\\d+)", label_template: "#$1" }),
      ])?.label
    ).toBe("#7");
  });

  it("pattern sem âncora casa no meio da URL — comportamento esperado", () => {
    expect(
      matchLinkIconRule("https://intranet.example.com/jira/browse/ABC-42", [
        rule({ pattern: "jira/browse/([A-Z]+-\\d+)", label_template: "$1" }),
      ])?.label
    ).toBe("ABC-42");
  });

  it("pattern acima de 200 caracteres é rejeitada pela validação e pulada no casamento", () => {
    const gigante = `${"a".repeat(LINK_ICON_PATTERN_MAX)}|github\\.com`;
    expect(validateLinkIconPattern(gigante)).toContain(String(LINK_ICON_PATTERN_MAX));
    expect(matchLinkIconRule("https://github.com/x", [rule({ pattern: gigante })])).toBeNull();
  });
});

describe("LinkIconRule (a linha do banco) e LinkIconRuleShape (o que o casamento exige)", () => {
  it("a linha do banco é aceita direto pelo casamento, sem adaptador", () => {
    const row: LinkIconRule = {
      id: "r1",
      user_id: "u1",
      name: "GitHub issue",
      pattern: "^https?://github\\.com/([^/]+)/([^/]+)/issues/(\\d+)",
      label_template: "$1/$2#$3",
      icon_key: "github",
      icon_url: null,
      position: 0,
      enabled: true,
      created_at: "2026-08-23T00:00:00Z",
    };
    const shape: LinkIconRuleShape = row;

    expect(resolveLinkAppearance("https://github.com/pedroynk/Orbyva/issues/8", [shape])).toEqual({
      iconKey: "github",
      iconUrl: null,
      label: "pedroynk/Orbyva#8",
    });
  });
});
