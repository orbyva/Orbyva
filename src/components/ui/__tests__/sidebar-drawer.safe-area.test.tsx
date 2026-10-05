import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

/**
 * O drawer mobile da sidebar é um overlay `fixed` (`SheetContent`): ele sai do fluxo do shell e
 * **não** herda o `padding-top` do `SidebarInset`. Sem os insets próprios, o `TeamSwitcher` nasce
 * sob a status bar do iOS (sem toque) e o `NavUser` encosta no home indicator.
 *
 * A prova planejada para o drawer era só a e2e — mas os dois casos e2e dele exigem sessão
 * autenticada e saem `skipped` em ambiente sem credencial E2E, deixando o drawer sem nenhum
 * artefato executado. Este teste roda sempre e guarda os três pontos que podem dar errado:
 * o inset no `<div>` de conteúdo (e não no `SheetContent`, que carrega `p-0`), os **dois** insets
 * (topo e base) e o `flex h-full w-full flex-col` que faz o `SidebarFooter` ficar no rodapé.
 */
describe("drawer mobile da sidebar — safe area", () => {
  const larguraOriginal = window.innerWidth;

  beforeEach(() => {
    // `useIsMobile` (`src/hooks/use-mobile.tsx`) decide por `window.innerWidth < 768`, e o stub de
    // `matchMedia` do setup jsdom lê a mesma largura. 390px = iPhone 14.
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: larguraOriginal,
    });
  });

  async function abrirDrawer() {
    render(
      <SidebarProvider>
        <SidebarTrigger />
        <Sidebar>
          <SidebarHeader>seletor de workspace</SidebarHeader>
          <SidebarFooter>bloco do usuário</SidebarFooter>
        </Sidebar>
      </SidebarProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /toggle sidebar/i }));
    await waitFor(() =>
      expect(document.querySelector('[data-mobile="true"]')).not.toBeNull()
    );
    return document.querySelector('[data-mobile="true"]') as HTMLElement;
  }

  /**
   * O `<div>` de conteúdo não é o `firstElementChild` do `SheetContent` — o `SheetPrimitive.Close`
   * vem antes dele (escondido pelo `[&>button]:hidden` do drawer). Alcança-se pelo pai do
   * `SidebarHeader`, que é exatamente o contêiner que o `sidebar.tsx:209` envolve.
   */
  function conteudoDoDrawer(sheet: HTMLElement) {
    const header = sheet.querySelector('[data-sidebar="header"]');
    expect(header).not.toBeNull();
    return header!.parentElement as HTMLElement;
  }

  it("desconta os dois insets no conteúdo do SheetContent, não no SheetContent", async () => {
    const sheet = await abrirDrawer();

    // O pai continua com `p-0` e o `--sidebar-width`: o inset não pode ter ido para cá.
    expect(sheet.className).toContain("p-0");
    expect(sheet.className).not.toContain("safe-area-inset");

    const conteudo = conteudoDoDrawer(sheet);
    expect(conteudo.className).toContain("pt-[env(safe-area-inset-top,0px)]");
    expect(conteudo.className).toContain(
      "pb-[env(safe-area-inset-bottom,0px)]"
    );
    // O layout de coluna é o que mantém o `SidebarFooter` (NavUser) no rodapé do drawer.
    expect(conteudo.className).toContain("flex");
    expect(conteudo.className).toContain("h-full");
    expect(conteudo.className).toContain("w-full");
    expect(conteudo.className).toContain("flex-col");
  });

  it("renderiza o primeiro e o último item dentro do contêiner que leva os insets", async () => {
    const sheet = await abrirDrawer();
    const conteudo = conteudoDoDrawer(sheet);

    const header = conteudo.querySelector('[data-sidebar="header"]');
    const footer = conteudo.querySelector('[data-sidebar="footer"]');

    // Se os insets estivessem num irmão, ou se o `<div>` deixasse de ser o pai desses dois, o
    // padding não empurraria nem o TeamSwitcher nem o NavUser.
    expect(header).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(header!.textContent).toContain("seletor de workspace");
    expect(footer!.textContent).toContain("bloco do usuário");
  });
});
