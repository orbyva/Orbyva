import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, matchRoutes } from "react-router-dom";
import { appRoutes } from "@/routes";
import { HubModulesGrid } from "@/pages/admin/life/HubModulesGrid";
import { HOME_MODULES, MODULE_DOT } from "@/pages/admin/life/hubMeta";
import { moduleColors } from "@/lib/design-tokens";
import { loadHealthSummary } from "@/api/health";

/**
 * Substitui a verificação manual da feature 060 (abrir o hub, achar o card "Saúde", clicar, chegar
 * em `/life/health`, conferir a cor nos dois temas): o card é renderizado de verdade a partir de
 * `HOME_MODULES`, a URL é resolvida contra a árvore de rotas do app e a cor do módulo é conferida
 * em todos os pontos de uso, inclusive nas duas declarações do `src/index.css`.
 */

vi.mock("@/api/health", () => ({ loadHealthSummary: vi.fn() }));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

beforeEach(() => {
  vi.mocked(loadHealthSummary).mockResolvedValue({
    nextMedicationDose: null,
    nextConsultation: null,
    latestMetrics: [],
    reminderPreferences: [],
  });
});

describe("hub de Vida", () => {
  it("mostra o card Saúde apontando para /life/health, logo depois de Hábitos", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <HubModulesGrid />
      </MemoryRouter>
    );

    const link = screen.getByRole("link", { name: /Saúde/ });
    expect(link).toHaveAttribute("href", "/life/health");
    expect(link).toHaveTextContent("Medicações e consultas");

    const labels = HOME_MODULES.map((mod) => mod.label);
    expect(labels[labels.indexOf("Saúde") - 1]).toBe("Hábitos");
  });

  it("o card usa a cor do módulo Saúde, não uma cor fixa de outro módulo", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <HubModulesGrid />
      </MemoryRouter>
    );

    const icon = screen
      .getByRole("link", { name: /Saúde/ })
      .querySelector("span") as HTMLElement;
    expect(icon.className).toContain("bg-[hsl(var(--health))]/10");
    expect(icon.className).toContain("text-[hsl(var(--health))]");
  });
});

describe("cor do módulo Saúde", () => {
  it("é o mesmo rose-500 em todos os pontos de uso", () => {
    expect(moduleColors.health).toBe("hsl(350 89% 60%)");
    expect(MODULE_DOT.health).toBe("bg-[hsl(var(--health))]");
  });

  it("a var --health é declarada nos dois temas, com o mesmo valor (legível no light e no dark)", () => {
    const css = readFileSync(resolve(__dirname, "../../../../index.css"), "utf8");
    const light = css.slice(css.indexOf(":root"), css.indexOf(".dark"));
    const dark = css.slice(css.indexOf(".dark"));

    expect(light).toContain("--health: 350 89% 60%;");
    expect(dark).toContain("--health: 350 89% 60%;");
  });
});

describe("rota /life/health", () => {
  it("a URL resolve para uma rota registrada no app", () => {
    const matches = matchRoutes(appRoutes, "/life/health");
    expect(matches).not.toBeNull();
    const paths = matches!.map((m) => m.route.path);
    expect(paths).toContain("life/health");
    expect(paths).not.toContain("*");
  });

  it("o elemento casado com /life/health renderiza o Health Dashboard", async () => {
    const matches = matchRoutes(appRoutes, "/life/health")!;
    const element = matches[matches.length - 1].route.element;

    render(
      <MemoryRouter initialEntries={["/life/health"]}>
        <Suspense fallback={<p>carregando</p>}>{element}</Suspense>
      </MemoryRouter>
    );

    // Timeout folgado de propósito: a rota é `lazy()`, e resolver o import da página no meio da
    // suíte inteira passa do 1s padrão do `findBy` (falso negativo só quando roda em paralelo).
    expect(
      await screen.findByRole(
        "heading",
        { name: "Saúde", level: 1 },
        { timeout: 10_000 }
      )
    ).toBeInTheDocument();
  }, 15_000);
});
