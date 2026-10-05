import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { NAV_GROUPS } from "@/lib/nav";

const APP = path.resolve(__dirname, "../../app/(app)");

function layouts(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return layouts(full);
    return entry.name === "_layout.tsx" ? [full] : [];
  });
}

/** Bloco `<Stack.Screen name="x" ... />` (ou com filhos) de uma tela no layout. */
function screenBlock(src: string, name: string): string | null {
  const start = src.indexOf(`name="${name}"`);
  if (start < 0) return null;
  const end = src.indexOf("/>", start);
  return src.slice(start, end < 0 ? undefined : end);
}

describe("navegação nos layouts", () => {
  const all = layouts(APP);

  it("todo stack com header nativo usa o título tocável do grupo", () => {
    const sem = all
      .filter((f) => {
        const src = fs.readFileSync(f, "utf8");
        return src.includes("headerTintColor") && !src.includes("headerTitle: groupHeaderTitle");
      })
      .map((f) => path.relative(APP, f));
    expect(sem).toEqual([]);
  });

  it("layout raiz não monta FAB da Orb e não tem voltar por gesto entre módulos", () => {
    const src = fs.readFileSync(path.join(APP, "_layout.tsx"), "utf8");
    expect(src).not.toContain("OrbAccessFab");
    expect(src).toContain("gestureEnabled: false");
    expect(src).toContain("<SidebarEdgeSwipe>");
  });

  it("tela raiz empilhada dentro do módulo deixa a borda para a sidebar", () => {
    const faltando: string[] = [];
    for (const group of NAV_GROUPS) {
      for (const leaf of group.items) {
        if (!leaf.href) continue;
        const parts = leaf.href.split("/").filter(Boolean);
        if (parts.length < 2) continue;
        const name = parts.pop() as string;
        const layout = path.join(APP, ...parts, "_layout.tsx");
        const block = screenBlock(fs.readFileSync(layout, "utf8"), name);
        if (!block?.includes("gestureEnabled: false")) faltando.push(leaf.href);
      }
    }
    expect(faltando).toEqual([]);
  });
});
