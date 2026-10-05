import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import LoadingFallback from "@/components/LoadingFallback";
import { BRAND } from "@/lib/brand";

const ROOT = path.resolve(__dirname, "../../..");

function faviconHref(): string {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const match = html.match(/<link rel="icon" type="image\/png" href="([^"]+)"/);
  if (!match) throw new Error("index.html sem <link rel=\"icon\">");
  return match[1];
}

describe("LoadingFallback", () => {
  afterEach(() => localStorage.clear());

  it("usa o PNG do favicon do index.html", () => {
    render(<LoadingFallback />);
    const logo = screen.getByRole("img", { name: BRAND.name });
    expect(logo.getAttribute("src")).toBe(faviconHref());
    expect(fs.existsSync(path.join(ROOT, "public", faviconHref()))).toBe(true);
  });

  it("tema claro salvo: fundo do tema, sem a classe dark", () => {
    localStorage.setItem("theme", "light");
    render(<LoadingFallback />);
    const root = screen.getByRole("status");
    expect(root.dataset.theme).toBe("light");
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.classList.contains("bg-background")).toBe(true);
    expect(root.className).not.toMatch(/#0c1222/);
  });

  it("tema escuro salvo: aplica a classe dark no próprio loader", () => {
    localStorage.setItem("theme", "dark");
    render(<LoadingFallback />);
    const root = screen.getByRole("status");
    expect(root.dataset.theme).toBe("dark");
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("bg-background")).toBe(true);
  });

  it("sem tema salvo cai no escuro, igual ao fundo do index.html", () => {
    render(<LoadingFallback />);
    expect(screen.getByRole("status").classList.contains("dark")).toBe(true);
  });
});

describe("theme-boot.js", () => {
  const script = fs.readFileSync(path.join(ROOT, "public", "theme-boot.js"), "utf8");

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("marca o <html> só para quem salvou o tema claro", () => {
    localStorage.setItem("theme", "light");
    new Function(script)();
    expect(document.documentElement.classList.contains("theme-boot-light")).toBe(true);

    document.documentElement.className = "";
    localStorage.setItem("theme", "dark");
    new Function(script)();
    expect(document.documentElement.classList.contains("theme-boot-light")).toBe(false);
  });

  it("é carregado de forma síncrona no <head> do index.html", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    expect(html).toMatch(/<script src="\/theme-boot\.js"><\/script>/);
  });
});
