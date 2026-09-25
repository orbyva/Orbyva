import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * `setupFiles` roda para toda a suíte (`.test.ts` em "node" e `.test.tsx` em "jsdom" —
 * ver `environmentMatchGlobs` em `vite.config.ts`). `cleanup()` do Testing Library só faz sentido
 * (e só funciona) quando há `document` de verdade, então só registra o hook em ambiente jsdom —
 * evita quebrar os testes de lógica pura que rodam em "node".
 */
if (typeof document !== "undefined") {
  afterEach(() => {
    cleanup();
  });

  // jsdom não implementa `ResizeObserver` nem a API de Pointer Capture que o Radix (Popover,
  // usado por `TaskDueQuickEdit`/`TaskDurationQuickPick`) chama ao posicionar/abrir o conteúdo —
  // sem esses stubs, renderizar/interagir com o popover lança em ambiente de teste.
  if (typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof Element.prototype.hasPointerCapture === "undefined") {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (typeof Element.prototype.setPointerCapture === "undefined") {
    Element.prototype.setPointerCapture = () => {};
  }
  if (typeof Element.prototype.releasePointerCapture === "undefined") {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (typeof Element.prototype.scrollIntoView === "undefined") {
    Element.prototype.scrollIntoView = () => {};
  }

  /**
   * `window.matchMedia` não existe no jsdom, e `useIsMobile` (`src/hooks/use-mobile.tsx`) o chama
   * no `useEffect` — sem o stub, qualquer tela que use o hook derruba o teste com
   * "matchMedia is not a function". O stub é fiel ao que o hook precisa: uma `MediaQueryList` com
   * `matches` calculado a partir de `window.innerWidth` (que o teste controla) e listeners que não
   * fazem nada, já que quem muda a largura no teste também remonta o componente.
   */
  if (typeof window.matchMedia === "undefined") {
    window.matchMedia = ((query: string) => {
      const max = /max-width:\s*(\d+)px/.exec(query);
      return {
        media: query,
        matches: max ? window.innerWidth <= Number(max[1]) : false,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      };
    }) as typeof window.matchMedia;
  }

  // O CodeMirror (editor de notas, feature 056) mede o texto pelo layout: a cada `measure` ele
  // chama `Range.getClientRects()` para descobrir a altura da linha e a posição do cursor. O jsdom
  // implementa `Range` mas não essas duas, e o erro sobe de dentro de um `requestAnimationFrame`,
  // virando "unhandled error" que derruba o arquivo de teste inteiro. Devolver uma lista vazia é
  // suficiente: o editor cai no caminho de "não consegui medir" e segue — o que os testes checam é
  // o documento e os eventos, não geometria.
  if (typeof Range.prototype.getClientRects === "undefined") {
    const emptyRect = {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect;
    Range.prototype.getClientRects = () =>
      ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
      }) as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => emptyRect;
  }
}
