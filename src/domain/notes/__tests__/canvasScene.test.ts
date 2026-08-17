import { describe, expect, it } from "vitest";
import {
  CANVAS_BLOCK_LANGUAGE,
  canvasElementCount,
  canvasReferenceBlock,
  canvasSceneSignature,
  parseCanvasReference,
  readCanvasScene,
  toCanvasData,
} from "@/domain/notes/canvasScene";
import { parseBlockLanguage } from "@/domain/notes/blockLanguage";

const rect = { id: "r1", type: "rectangle", x: 10, y: 20 };
const arrow = { id: "a1", type: "arrow" };

describe("toCanvasData", () => {
  it("guarda os elementos vivos e descarta o lixo de undo", () => {
    const data = toCanvasData(
      [rect, { id: "gone", type: "text", isDeleted: true }, arrow],
      {}
    );
    expect(data.elements).toEqual([rect, arrow]);
  });

  it("reduz o appState às chaves de documento — nada de seleção, ponteiro ou colaborador", () => {
    const data = toCanvasData([rect], {
      viewBackgroundColor: "#111827",
      gridSize: 20,
      // Estado de sessão: não pode ir para o banco.
      selectedElementIds: { r1: true },
      cursorButton: "down",
      collaborators: new Map(),
      scrollX: -420,
      zoom: { value: 2 },
    });
    expect(data.appState).toEqual({ viewBackgroundColor: "#111827", gridSize: 20 });
  });

  it("não grava o tema — o canvas segue o tema do app, não o da sessão que salvou", () => {
    const data = toCanvasData([rect], { theme: "dark" });
    expect(data.appState).not.toHaveProperty("theme");
  });

  it("sem imagem colada, files fica null em vez de objeto vazio", () => {
    expect(toCanvasData([rect], {}).files).toBeNull();
    expect(toCanvasData([rect], {}, {}).files).toBeNull();
    const files = { "file-1": { mimeType: "image/png" } };
    expect(toCanvasData([rect], {}, files).files).toEqual(files);
  });
});

describe("readCanvasScene", () => {
  it("faz o round-trip do que toCanvasData gravou", () => {
    const saved = toCanvasData([rect, arrow], { viewBackgroundColor: "#fff" });
    const scene = readCanvasScene(saved);
    expect(scene.elements).toEqual([rect, arrow]);
    expect(scene.appState).toEqual({ viewBackgroundColor: "#fff" });
  });

  it("jsonb estranho vira cena vazia, não tela de erro", () => {
    // O jsonb é dado de fora do TypeScript: pode ter sido gravado à mão no SQL editor.
    for (const garbage of [null, undefined, 42, "texto", [], {}, { elements: "não é lista" }]) {
      const scene = readCanvasScene(garbage);
      expect(scene.elements).toEqual([]);
      expect(scene.appState).toEqual({});
      expect(scene.files).toBeNull();
    }
  });

  it("elemento apagado que sobrou no banco não volta para a tela", () => {
    const scene = readCanvasScene({
      elements: [rect, { id: "x", isDeleted: true }],
    });
    expect(scene.elements).toEqual([rect]);
  });
});

describe("canvasSceneSignature", () => {
  it("cena idêntica dá a mesma assinatura — é o que impede o save de montagem", () => {
    const fromDb = readCanvasScene(toCanvasData([rect, arrow], { gridSize: 20 }));
    const onMount = toCanvasData([rect, arrow], { gridSize: 20 });
    expect(canvasSceneSignature(onMount)).toBe(
      canvasSceneSignature(
        toCanvasData(fromDb.elements, fromDb.appState, fromDb.files)
      )
    );
  });

  it("mexer num elemento muda a assinatura", () => {
    const antes = toCanvasData([rect], {});
    const depois = toCanvasData([{ ...rect, x: 999 }], {});
    expect(canvasSceneSignature(antes)).not.toBe(canvasSceneSignature(depois));
  });

  it("acrescentar elemento muda a assinatura", () => {
    expect(canvasSceneSignature(toCanvasData([rect], {}))).not.toBe(
      canvasSceneSignature(toCanvasData([rect, arrow], {}))
    );
  });
});

describe("canvasElementCount", () => {
  it("conta os elementos do desenho para o card da lista", () => {
    expect(canvasElementCount(toCanvasData([rect, arrow], {}))).toBe(2);
    expect(canvasElementCount({ elements: [] })).toBe(0);
    expect(canvasElementCount(null)).toBe(0);
  });
});

describe("referência de canvas no markdown", () => {
  it("o bloco copiado é um fence que o registry de blocos reconhece", () => {
    const block = canvasReferenceBlock("11111111-2222-3333-4444-555555555555");
    expect(block).toBe(
      "```orbyva-canvas\n11111111-2222-3333-4444-555555555555\n```\n"
    );
    // O mesmo caminho que o MarkdownPreview usa para achar o renderer (feature 057).
    expect(parseBlockLanguage(`language-${CANVAS_BLOCK_LANGUAGE}`)).toBe(
      CANVAS_BLOCK_LANGUAGE
    );
  });

  it("o id volta do bloco, com espaço e quebra de linha em volta", () => {
    expect(parseCanvasReference("  n1  ")).toBe("n1");
    expect(parseCanvasReference("\nn1\n")).toBe("n1");
  });

  it("bloco vazio ou ambíguo não vira busca no banco", () => {
    expect(parseCanvasReference("")).toBeNull();
    expect(parseCanvasReference("   \n ")).toBeNull();
    // Dois ids: recusar é melhor que escolher um sozinho.
    expect(parseCanvasReference("n1 n2")).toBeNull();
    expect(parseCanvasReference("n1\nn2")).toBeNull();
  });
});
