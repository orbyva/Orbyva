import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import ExcalidrawCanvas from "@/pages/admin/notes/ExcalidrawCanvas";
import { excalidrawHandlesEscape } from "@/domain/notes/canvasEscape";

/**
 * A fronteira entre a lib e o resto do app (feature 172).
 *
 * `ExcalidrawCanvas` é o único módulo autorizado a importar `@excalidraw/excalidraw` — aqui ele é
 * renderizado com a **lib trocada por um duplo**, que é o que permite afirmar algo sobre a fiação
 * (`onApiReady` → atributo `excalidrawAPI` → adaptador) sem carregar os 2,7 MB do pacote e sem
 * precisar de navegador. Sem este teste, a única prova de que a API chega a quem pediu seria o
 * `tsc`, que só diz que o nome da prop existe.
 */

const { libSpy } = vi.hoisted(() => ({
  libSpy: { props: null as Record<string, unknown> | null },
}));

vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: (props: Record<string, unknown>) => {
    libSpy.props = props;
    return <div data-testid="excalidraw-lib" />;
  },
}));

/** O CSS da lib tem 144 KB e não diz nada em jsdom. */
vi.mock("@excalidraw/excalidraw/index.css", () => ({}));

const scene = {
  elements: [] as readonly unknown[],
  appState: {} as Record<string, unknown>,
  files: null,
};

beforeEach(() => {
  libSpy.props = null;
});

describe("ExcalidrawCanvas: entrega da API imperativa", () => {
  it("liga onApiReady ao atributo excalidrawAPI e repassa o getAppState da lib", () => {
    const received: Array<{ getAppState: () => Record<string, unknown> }> = [];
    render(
      <ExcalidrawCanvas
        initialScene={scene}
        theme="light"
        onApiReady={(api) => received.push(api)}
      />
    );

    const handOver = libSpy.props?.excalidrawAPI as (api: unknown) => void;
    expect(typeof handOver).toBe("function");

    // A lib entrega a API na montagem dela; o adaptador tem que repassá-la ao chamador.
    handOver({
      getAppState: () => ({ openPopup: "elementStroke", selectedElementIds: {} }),
      getSceneElements: () => [],
    });

    expect(received).toHaveLength(1);
    expect(received[0].getAppState()).toMatchObject({
      openPopup: "elementStroke",
    });
    // E é exatamente esse objeto que decide de quem é o `Esc`.
    expect(excalidrawHandlesEscape(received[0].getAppState())).toBe(true);
  });

  it("lê o appState no momento da chamada, não o do instante da entrega", () => {
    const received: Array<{ getAppState: () => Record<string, unknown> }> = [];
    render(
      <ExcalidrawCanvas
        initialScene={scene}
        theme="light"
        onApiReady={(api) => received.push(api)}
      />
    );

    let live: Record<string, unknown> = { selectedElementIds: { r1: true } };
    (libSpy.props?.excalidrawAPI as (api: unknown) => void)({
      getAppState: () => live,
    });

    expect(excalidrawHandlesEscape(received[0].getAppState())).toBe(true);
    // O Excalidraw limpou a seleção depois da entrega — a guarda tem que enxergar o novo estado.
    live = { selectedElementIds: {} };
    expect(excalidrawHandlesEscape(received[0].getAppState())).toBe(false);
  });

  it("sem onApiReady não liga excalidrawAPI — o canvas embutido não pede nada", () => {
    render(<ExcalidrawCanvas initialScene={scene} theme="light" readOnly />);
    expect(libSpy.props?.excalidrawAPI).toBeUndefined();
    // E a prop é opcional: o contrato antigo (058/132) continua valendo sem edição.
    expect(libSpy.props?.viewModeEnabled).toBe(true);
  });
});
