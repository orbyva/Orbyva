import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidebarInset } from "@/components/ui/sidebar";

/**
 * O shell do admin (`src/layouts/AdminLayout.tsx`) desconta o inset de topo do iOS no
 * `SidebarInset`: `pt-[env(safe-area-inset-top,0px)]` mais
 * `min-h-[calc(100svh-env(safe-area-inset-top,0px))]`.
 *
 * O desenho depende de o `cn`/twMerge (`src/components/ui/sidebar.tsx:322-327`) deixar o `min-h` do
 * chamador **vencer** o `min-h-svh` do componente. Se o twMerge não colapsar as duas classes, o
 * padding entra e o desconto não: o bug de toque vira rolagem fantasma silenciosa, do tipo que
 * nenhum `tsc`/lint pega. Este é o alarme disso.
 *
 * `SidebarInset` é um `<main>` puro — não consome `useSidebar`, então renderiza sem provider.
 */
const CLASSES_DO_SHELL =
  "pt-[env(safe-area-inset-top,0px)] min-h-[calc(100svh-env(safe-area-inset-top,0px))]";

describe("SidebarInset — safe area de topo", () => {
  it("mantém o padding do inset e deixa o min-h do chamador vencer o min-h-svh", () => {
    const { container } = render(<SidebarInset className={CLASSES_DO_SHELL} />);
    const main = container.querySelector("main");

    expect(main).not.toBeNull();
    const className = main!.className;

    expect(className).toContain("pt-[env(safe-area-inset-top");
    expect(className).toContain("min-h-[calc(100svh-env(");
    // O `min-h-svh` do componente tem de ter sido colapsado pelo twMerge; se sobrar, a última
    // regra do CSS gerado pode ganhar e o desconto de altura não vale nada.
    expect(className).not.toContain("min-h-svh");
  });

  it("sem className do chamador, continua com o min-h-svh de sempre", () => {
    const { container } = render(<SidebarInset />);
    const className = container.querySelector("main")!.className;

    expect(className).toContain("min-h-svh");
    expect(className).not.toContain("safe-area-inset-top");
  });

  /**
   * O teste acima prova o twMerge; este prova que o **shell real** passa essas classes. Sem ele, o
   * único artefato ligando `AdminLayout` ao inset é o caso e2e autenticado, que fica `skipped` em
   * ambiente sem credencial E2E — e aí a regressão de "alguém apagou a className do shell" passaria
   * batido.
   */
  it("o SidebarInset do AdminLayout carrega o padding e o desconto de altura", () => {
    const adminLayout = readFileSync(
      resolve(process.cwd(), "src/layouts/AdminLayout.tsx"),
      "utf8"
    );
    const abertura = adminLayout.match(/<SidebarInset[^>]*>/)?.[0] ?? "";

    expect(abertura).toContain("pt-[env(safe-area-inset-top,0px)]");
    expect(abertura).toContain(
      "min-h-[calc(100svh-env(safe-area-inset-top,0px))]"
    );
  });
});
