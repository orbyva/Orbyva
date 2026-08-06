import { describe, expect, it } from "vitest";
import { dropZoneAttrs, readDropZone } from "@/lib/dropZone";

describe("dropZone", () => {
  it("serializa tipo e partes no atributo data-drop-zone", () => {
    expect(dropZoneAttrs("visit", "day-1", 2)).toEqual({
      "data-drop-zone": "visit|day-1|2",
    });
  });

  it("lê de volta o que foi serializado", () => {
    const attrs = dropZoneAttrs("visit", "6f0c1e2a", 0);
    expect(readDropZone(attrs["data-drop-zone"])).toEqual({
      kind: "visit",
      parts: ["6f0c1e2a", "0"],
    });
  });

  it("aceita zona sem partes extras", () => {
    expect(readDropZone("type|7")).toEqual({ kind: "type", parts: ["7"] });
    expect(readDropZone("type")).toEqual({ kind: "type", parts: [] });
  });

  it("devolve null quando não há zona sob o ponteiro", () => {
    expect(readDropZone(null)).toBeNull();
    expect(readDropZone(undefined)).toBeNull();
    expect(readDropZone("")).toBeNull();
  });
});
