import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { BrandLogo } from "@/components/BrandLogo";
import { PublicPageShell } from "@/components/PublicPageShell";
import { TeamSwitcher } from "@/components/team-switcher";
import { SidebarProvider } from "@/components/ui/sidebar";

const ROOT = path.resolve(__dirname, "../../..");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const FAVICON = indexHtml.match(/<link rel="icon" type="image\/png" href="([^"]+)"/)![1];
/** Mesmo desenho do favicon reduzido a 128px (o PNG de 1024px pesa 148 KB no header). */
const FAVICON_SMALL = FAVICON.replace(/\.png$/, "-128.webp");

function expectFaviconWithoutBox(img: HTMLElement) {
  expect(img.getAttribute("src")).toBe(FAVICON_SMALL);
  expect(img.className).not.toMatch(/\bbg-white\b/);
}

describe("BrandLogo variant favicon", () => {
  it("o WebP pequeno existe em public/ e é bem mais leve que o PNG do favicon", () => {
    const small = fs.statSync(path.join(ROOT, "public", FAVICON_SMALL));
    const original = fs.statSync(path.join(ROOT, "public", FAVICON));
    expect(small.size).toBeLessThan(10 * 1024);
    expect(small.size).toBeLessThan(original.size / 10);
  });

  it("usa a versão pequena do <link rel=icon>", () => {
    render(<BrandLogo variant="favicon" alt="Orbyva" />);
    expectFaviconWithoutBox(screen.getByRole("img", { name: "Orbyva" }));
  });
});

describe("logo da sidebar", () => {
  it("é o desenho do favicon, sem caixa branca", () => {
    const { container } = render(
      <SidebarProvider>
        <TeamSwitcher />
      </SidebarProvider>
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expectFaviconWithoutBox(img!);
  });
});

describe("logo do header da landing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("é o desenho do favicon, sem caixa branca", async () => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const { default: Landing } = await import("@/pages/Landing");
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
    const home = await screen.findAllByRole("link", { name: "Orbyva" });
    const img = home[0].querySelector("img");
    expect(img).not.toBeNull();
    expectFaviconWithoutBox(img!);
  });
});

describe("logo do header das páginas públicas", () => {
  it("é o desenho do favicon, sem caixa branca", () => {
    render(
      <MemoryRouter>
        <PublicPageShell>
          <p>conteúdo</p>
        </PublicPageShell>
      </MemoryRouter>
    );
    expectFaviconWithoutBox(screen.getAllByRole("img", { name: "Orbyva" })[0]);
  });
});
