import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, matchRoutes } from "react-router-dom";
import { appRoutes } from "@/routes";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
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

vi.mock("@/api/health", () => ({
  loadHealthSummary: vi.fn(),
  // A lista de tratamentos carrega as preferências de lembrete junto (atalho "Lembretes" da 071).
  fetchReminderPreferences: vi.fn(async () => []),
  upsertReminderPreference: vi.fn(),
  fetchConsultationTasks: vi.fn(async () => []),
  fetchHealthMetrics: vi.fn(async () => []),
  fetchHealthHabitsToday: vi.fn(async () => []),
  deleteHealthMetric: vi.fn(),
}));

vi.mock("@/api/tasks", () => ({
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

// A lista de tratamentos (064) é montada de verdade pela rota — a API é mockada para o teste ser
// sobre a navegação, não sobre o Supabase.
vi.mock("@/api/health/medications", () => ({
  fetchMedications: vi.fn(async () => []),
  fetchDosesSince: vi.fn(async () => []),
  deactivateMedication: vi.fn(),
  createMedicationWithDoses: vi.fn(),
  updateMedication: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { email: "eu@example.com", user_metadata: { full_name: "Eu" } },
    loading: false,
  }),
}));

beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  vi.mocked(loadHealthSummary).mockResolvedValue({
    nextMedicationDose: null,
    nextConsultation: null,
    latestMetrics: [],
    reminderPreferences: [],
    medicationAdherence: {
      total: 0,
      taken: 0,
      onTime: 0,
      late: 0,
      missed: 0,
      takenRate: 0,
      onTimeRate: 0,
    },
    activeMedicationCount: 0,
    todayDoses: [],
    upcomingConsultations: [],
    medications: [],
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

/**
 * Feature 071: até então `/life/health` não aparecia em menu nenhum — só pelo card do hub ou pela
 * URL. Trocar a criação de medicação de Tarefas para a Saúde sem isto seria trocar um lugar ruim
 * por um lugar escondido.
 */
describe("sidebar — Saúde no grupo Vida (071)", () => {
  it("lista 'Saúde' apontando para /life/health, logo depois de Hábitos", () => {
    render(
      <MemoryRouter initialEntries={["/life/health"]}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    );

    const link = screen.getByRole("link", { name: "Saúde" });
    expect(link).toHaveAttribute("href", "/life/health");

    const vida = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.getAttribute("href"))
      .filter((href): href is string => href != null);
    expect(vida[vida.indexOf("/life/health") - 1]).toBe("/habits");
  });

  it("o item fica ativo em /life/health e também na rota-filha /life/health/medications", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/life/health"]}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Saúde" })).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.getByRole("link", { name: "Hábitos" })).toHaveAttribute(
      "data-active",
      "false"
    );
    unmount();

    render(
      <MemoryRouter initialEntries={["/life/health/medications"]}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Saúde" })).toHaveAttribute(
      "data-active",
      "true"
    );
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

describe("rota /life/health/medications (feature 064)", () => {
  it("a URL resolve para uma rota registrada, e não para o 404", () => {
    const matches = matchRoutes(appRoutes, "/life/health/medications");
    expect(matches).not.toBeNull();
    const paths = matches!.map((m) => m.route.path);
    expect(paths).toContain("life/health/medications");
    expect(paths).not.toContain("*");
  });

  it("o elemento casado renderiza a lista de tratamentos", async () => {
    const matches = matchRoutes(appRoutes, "/life/health/medications")!;
    const element = matches[matches.length - 1].route.element;

    render(
      <MemoryRouter initialEntries={["/life/health/medications"]}>
        <Suspense fallback={<p>carregando</p>}>{element}</Suspense>
      </MemoryRouter>
    );

    // Mesmo timeout folgado da rota acima: a página é `lazy()`.
    expect(
      await screen.findByRole(
        "heading",
        { name: "Medicações", level: 1 },
        { timeout: 10_000 }
      )
    ).toBeInTheDocument();
  }, 15_000);
});

describe("rota /life/health/consultations", () => {
  it("a URL resolve para uma rota registrada, e não para o 404", () => {
    const matches = matchRoutes(appRoutes, "/life/health/consultations");
    expect(matches).not.toBeNull();
    const paths = matches!.map((m) => m.route.path);
    expect(paths).toContain("life/health/consultations");
    expect(paths).not.toContain("*");
  });

  it("o elemento casado renderiza a lista de consultas", async () => {
    const matches = matchRoutes(appRoutes, "/life/health/consultations")!;
    const element = matches[matches.length - 1].route.element;

    render(
      <MemoryRouter initialEntries={["/life/health/consultations"]}>
        <Suspense fallback={<p>carregando</p>}>{element}</Suspense>
      </MemoryRouter>
    );

    expect(
      await screen.findByRole(
        "heading",
        { name: "Consultas", level: 1 },
        { timeout: 10_000 }
      )
    ).toBeInTheDocument();
  }, 15_000);
});

describe("rota /life/health/progress", () => {
  it("a URL resolve para uma rota registrada, e não para o 404", () => {
    const matches = matchRoutes(appRoutes, "/life/health/progress");
    expect(matches).not.toBeNull();
    const paths = matches!.map((m) => m.route.path);
    expect(paths).toContain("life/health/progress");
    expect(paths).not.toContain("*");
  });

  it("o elemento casado renderiza o histórico de medições", async () => {
    const matches = matchRoutes(appRoutes, "/life/health/progress")!;
    const element = matches[matches.length - 1].route.element;

    render(
      <MemoryRouter initialEntries={["/life/health/progress"]}>
        <Suspense fallback={<p>carregando</p>}>{element}</Suspense>
      </MemoryRouter>
    );

    expect(
      await screen.findByRole(
        "heading",
        { name: "Progresso", level: 1 },
        { timeout: 10_000 }
      )
    ).toBeInTheDocument();
  }, 15_000);
});
