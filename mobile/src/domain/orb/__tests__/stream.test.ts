import { describe, expect, it } from "vitest";

import { createOrbStreamParser } from "@/domain/orb/stream";

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

describe("createOrbStreamParser", () => {
  it("entrega eventos de um chunk único", () => {
    const parser = createOrbStreamParser();
    expect(
      parser.push(
        sse({ type: "tool", name: "query_tasks", phase: "start" }) +
          sse({ type: "text", text: "Oi" })
      )
    ).toEqual([
      { type: "tool", name: "query_tasks", phase: "start" },
      { type: "text", text: "Oi" },
    ]);
  });

  it("segura evento partido até o próximo chunk", () => {
    const parser = createOrbStreamParser();
    const raw = sse({ type: "text", text: "orçamento" });
    const cut = Math.floor(raw.length / 2);
    expect(parser.push(raw.slice(0, cut))).toEqual([]);
    expect(parser.push(raw.slice(cut))).toEqual([{ type: "text", text: "orçamento" }]);
  });

  it("flush entrega último evento sem linha em branco final", () => {
    const parser = createOrbStreamParser();
    expect(parser.push(`data: ${JSON.stringify({ type: "done" })}`)).toEqual([]);
    expect(parser.flush()).toEqual([{ type: "done" }]);
    expect(parser.flush()).toEqual([]);
  });

  it("ignora keep-alive, JSON quebrado e tipo desconhecido", () => {
    const parser = createOrbStreamParser();
    expect(
      parser.push(
        "\n\n: ping\n\ndata: {x}\n\n" +
          sse({ type: "proposal", id: "1" }) +
          sse({ type: "text", text: "ok" })
      )
    ).toEqual([{ type: "text", text: "ok" }]);
  });
});
