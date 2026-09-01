import { describe, expect, it } from "vitest";
import { BREADCRUMB_LABELS } from "@/lib/brand";

describe("BREADCRUMB_LABELS", () => {
  it("traduz os segmentos de Produtividade e Saúde para PT-BR", () => {
    expect(BREADCRUMB_LABELS.tasks).toBe("Tarefas");
    expect(BREADCRUMB_LABELS.projects).toBe("Projetos");
    expect(BREADCRUMB_LABELS.notes).toBe("Notas");
    expect(BREADCRUMB_LABELS["shopping-list"]).toBe("Lista de Compras");
    expect(BREADCRUMB_LABELS.agenda).toBe("Agenda");
    expect(BREADCRUMB_LABELS["link-icons"]).toBe("Ícones de link");
    expect(BREADCRUMB_LABELS.life).toBe("Vida");
    expect(BREADCRUMB_LABELS.health).toBe("Saúde");
    expect(BREADCRUMB_LABELS.medications).toBe("Medicações");
  });
});
