import { describe, expect, it } from "vitest";

import {
  groupForPath,
  navLeafForPath,
  quickAddModuleForPath,
} from "@/lib/nav";

describe("groupForPath", () => {
  it("acha o grupo da sidebar por caminho, incluindo detalhe e formulário", () => {
    expect(groupForPath("/home")?.title).toBe("Início");
    expect(groupForPath("/")?.title).toBe("Início");
    expect(groupForPath("/orb")?.title).toBe("Início");
    expect(groupForPath("/finance/budget-form")?.title).toBe("Finanças");
    expect(groupForPath("/tasks/projects/abc")?.title).toBe("Produtividade");
    expect(groupForPath("/shopping")?.title).toBe("Produtividade");
    expect(groupForPath("/cars/xyz")?.title).toBe("Vida");
    expect(groupForPath("/books/123")?.title).toBe("Conteúdo");
    expect(groupForPath("/(app)/movies")?.title).toBe("Conteúdo");
  });

  it("caminho fora da sidebar não tem grupo", () => {
    expect(groupForPath("/account")).toBeNull();
    expect(groupForPath("/login")).toBeNull();
  });
});

describe("navLeafForPath", () => {
  it("tela raiz é item exato da sidebar", () => {
    const finance = navLeafForPath("/finance/transactions");
    expect(finance?.group.title).toBe("Finanças");
    expect(finance?.leaf.title).toBe("Transações");
    expect(navLeafForPath("/finance")?.leaf.title).toBe("Dashboard");
    expect(navLeafForPath("/finance/")?.leaf.title).toBe("Dashboard");
    expect(navLeafForPath("/")?.leaf.title).toBe("Dashboard");
    expect(navLeafForPath("/tasks/agenda")?.group.title).toBe("Produtividade");
    expect(navLeafForPath("/(app)/habits")?.leaf.title).toBe("Hábitos");
  });

  it("detalhe, formulário e telas fora da sidebar não são raiz", () => {
    expect(navLeafForPath("/books/123")).toBeNull();
    expect(navLeafForPath("/tasks/projects/abc")).toBeNull();
    expect(navLeafForPath("/finance/form")).toBeNull();
    expect(navLeafForPath("/tasks/form")).toBeNull();
    expect(navLeafForPath("/notes/n1")).toBeNull();
    expect(navLeafForPath("/account")).toBeNull();
  });
});

describe("quickAddModuleForPath", () => {
  it("o + usa a cor do grupo da tela, como a sidebar", () => {
    expect(quickAddModuleForPath("/finance/transactions")).toBe("finance");
    expect(quickAddModuleForPath("/tasks")).toBe("productivity");
    expect(quickAddModuleForPath("/notes")).toBe("productivity");
    expect(quickAddModuleForPath("/habits")).toBe("life");
    expect(quickAddModuleForPath("/cars/xyz")).toBe("life");
    expect(quickAddModuleForPath("/movies")).toBe("entertainment");
    expect(quickAddModuleForPath("/home")).toBe("hub");
    expect(quickAddModuleForPath("/account")).toBe("hub");
  });
});
