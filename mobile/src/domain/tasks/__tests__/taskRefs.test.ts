import { describe, expect, it } from "vitest";

import { mentionsWikiTitle } from "@/domain/notes/wikiLinks";
import { mentionsTaskId, parseTaskRefs } from "@/domain/tasks/taskRefs";

const ID = "11111111-2222-4333-8444-555555555555";

describe("parseTaskRefs", () => {
  it("acha a marca com rótulo (inclusive vazio) e ignora link comum e id fora do formato", () => {
    const text = `ver [Deploy](orbyva-task:${ID}) e [](orbyva-task:${ID}) e [docs](https://x.com) e [x](orbyva-task:123)`;
    expect(parseTaskRefs(text).map((m) => m.label)).toEqual(["Deploy", ""]);
  });

  it("marca dentro de bloco cercado ou código inline não conta", () => {
    expect(mentionsTaskId("```\n[a](orbyva-task:" + ID + ")\n```", ID)).toBe(false);
    expect(mentionsTaskId("`[a](orbyva-task:" + ID + ")`", ID)).toBe(false);
    expect(mentionsTaskId("[a](orbyva-task:" + ID.toUpperCase() + ")", ID)).toBe(true);
    expect(mentionsTaskId("[a](orbyva-task:" + ID + ")", "")).toBe(false);
  });

  it("wiki-link continua respeitando código depois da extração de codeRanges", () => {
    expect(mentionsWikiTitle("ver [[Plano]]", "Plano")).toBe(true);
    expect(mentionsWikiTitle("`[[Plano]]`", "Plano")).toBe(false);
    expect(mentionsWikiTitle("~~~\n[[Plano]]\n~~~", "Plano")).toBe(false);
  });
});
