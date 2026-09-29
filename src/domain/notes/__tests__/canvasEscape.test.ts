import { describe, expect, it } from "vitest";
import { excalidrawHandlesEscape } from "@/domain/notes/canvasEscape";

/**
 * A guarda do `Esc` da tela cheia (feature 172), campo a campo.
 *
 * O que estes casos protegem é o defeito de cada lado: guarda frouxa demais tira a pessoa do
 * desenho quando ela só queria fechar um painel; guarda apertada demais (tratar
 * `selectedElementIds: {}` como seleção, por exemplo) transforma o modo cheio numa armadilha da
 * qual o teclado nunca sai.
 */

/** Como o Excalidraw entrega o estado com nada selecionado e nenhum painel aberto. */
const CLEAN = {
  selectedElementIds: {},
  editingGroupId: null,
  editingTextElement: null,
  selectedLinearElement: null,
  croppingElementId: null,
  openMenu: null,
  openPopup: null,
  openSidebar: null,
  openDialog: null,
  contextMenu: null,
  // Estado que existe sempre e não pode contar como "o Excalidraw quer o Esc".
  activeTool: { type: "rectangle", locked: true },
  zoom: { value: 1 },
  viewBackgroundColor: "#ffffff",
};

describe("excalidrawHandlesEscape", () => {
  it("devolve false com o appState limpo — o Esc é da tela cheia", () => {
    expect(excalidrawHandlesEscape(CLEAN)).toBe(false);
  });

  it("devolve false sem appState nenhum (API do Excalidraw ainda não chegou)", () => {
    // Falha aberta: sem a API, a saída por teclado continua funcionando.
    expect(excalidrawHandlesEscape(null)).toBe(false);
    expect(excalidrawHandlesEscape(undefined)).toBe(false);
    expect(excalidrawHandlesEscape({})).toBe(false);
  });

  it("devolve true com um elemento selecionado", () => {
    expect(
      excalidrawHandlesEscape({ ...CLEAN, selectedElementIds: { r1: true } })
    ).toBe(true);
  });

  it("trata selectedElementIds vazio como 'sem seleção'", () => {
    // O Excalidraw entrega `{}` o tempo todo; objeto vazio contando como seleção prenderia o modo.
    expect(
      excalidrawHandlesEscape({ ...CLEAN, selectedElementIds: {} })
    ).toBe(false);
    // Id desmarcado (`false`) também não é seleção.
    expect(
      excalidrawHandlesEscape({ ...CLEAN, selectedElementIds: { r1: false } })
    ).toBe(false);
  });

  const owners: Array<[string, unknown]> = [
    ["editingGroupId", "g1"],
    ["editingTextElement", { id: "t1", type: "text" }],
    ["selectedLinearElement", { elementId: "l1" }],
    ["croppingElementId", "img1"],
    ["openMenu", "shape"],
    ["openPopup", "elementStroke"],
    ["openSidebar", { name: "library" }],
    ["openDialog", { name: "help" }],
    ["contextMenu", { items: [], top: 0, left: 0 }],
  ];

  it.each(owners)("devolve true só com %s ativo", (key, value) => {
    expect(excalidrawHandlesEscape({ ...CLEAN, [key]: value })).toBe(true);
  });

  it("ignora a ferramenta ativa, inclusive travada", () => {
    // O Excalidraw usa Esc para voltar à seleção, mas com *keep tool active* o estado não se
    // desfaz sozinho — incluir `activeTool` criaria um modo do qual o Esc nunca sai.
    expect(
      excalidrawHandlesEscape({
        ...CLEAN,
        activeTool: { type: "arrow", locked: true },
      })
    ).toBe(false);
  });

  it("ignora estado volátil que não é painel nem seleção", () => {
    expect(
      excalidrawHandlesEscape({
        ...CLEAN,
        cursorButton: "down",
        isResizing: true,
        hoveredElementIds: { r1: true },
        selectedGroupIds: { g1: true },
        zoom: { value: 2 },
      })
    ).toBe(false);
  });
});
