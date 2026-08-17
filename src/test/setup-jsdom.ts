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
}
