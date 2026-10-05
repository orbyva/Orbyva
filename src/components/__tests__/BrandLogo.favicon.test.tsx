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

function expectFaviconWithoutBox(img: HTMLElement) {
  expect(img.getAttribute("src")).toBe(FAVICON);
  expect(img.className).not.toMatch(/\bbg-white\b/);
}

describe("BrandLogo variant favicon", () => {
  it("usa o PNG do <link rel=icon>", () => {
    render(<BrandLogo variant="favicon" alt="Orbyva" />);
    expectFaviconWithoutBox(screen.getByRole("img", { name: "Orbyva" }));
  });
});

describe("logo da sidebar", () => {
  it("é o PNG do favicon, sem caixa branca", () => {
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

  it("é o PNG do favicon, sem caixa branca", async () => {
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
  it("é o PNG do favicon, sem caixa branca", () => {
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
