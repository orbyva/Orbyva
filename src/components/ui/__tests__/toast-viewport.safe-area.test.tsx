import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToastProvider, ToastViewport } from "@/components/ui/toast";

/**
 * A viewport de toasts é `fixed top-0`: ela não herda o padding do shell, então no iPhone instalado
 * o primeiro toast da pilha nasce sob a status bar e o botão de ação ("Desfazer") não recebe toque.
 * O `p-4` do mobile virou `px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top,0px))]` — o inset SOMA
 * ao padding de antes.
 *
 * O caso e2e equivalente exige disparar um toast real em sessão autenticada (fica `skipped` sem
 * credencial E2E); este roda sempre, e é o alarme de "alguém trocou o `p-4` e levou o
 * `sm:top-auto` junto", que faria o toast migrar para o topo no desktop.
 */
describe("ToastViewport — safe area de topo", () => {
  it("soma o inset de topo ao padding e preserva a ancoragem de baixo do desktop", () => {
    const { container } = render(
      <ToastProvider>
        <ToastViewport />
      </ToastProvider>
    );
    const viewport = container.querySelector("ol");

    expect(viewport).not.toBeNull();
    const className = viewport!.className;

    expect(className).toContain("pt-[calc(1rem+env(safe-area-inset-top,0px))]");
    // O padding de antes não pode ter se perdido na quebra do `p-4`.
    expect(className).toContain("px-4");
    expect(className).toContain("pb-4");
    // Desktop intocado: a viewport continua ancorada embaixo à direita.
    expect(className).toContain("sm:top-auto");
    expect(className).toContain("sm:bottom-0");
    expect(className).toContain("sm:right-0");
    expect(className).toContain("md:max-w-[420px]");
    // Se o `p-4` sobrasse, ele ganharia do `pt-[...]` conforme a ordem no CSS gerado.
    expect(className).not.toMatch(/(^|\s)p-4(\s|$)/);
  });
});
