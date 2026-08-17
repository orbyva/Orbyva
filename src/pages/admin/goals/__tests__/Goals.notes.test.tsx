import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Goals from "@/pages/admin/goals/Goals";
import type { PersonalGoal } from "@/types/goals";
import type { Note } from "@/types/notes";

/**
 * O vínculo de `note_link` visto **do outro lado** (feature 056): a página de Metas mostrando quais
 * notas falam de cada meta. É a prova de que a referência polimórfica funciona fora do módulo de
 * Notas — o motivo de a tarefa exigir uma entidade não-projeto.
 */

const { store } = vi.hoisted(() => ({
  store: {
    goals: [] as PersonalGoal[],
    notesByGoal: {} as Record<string, Note[]>,
    fail: false,
    calls: [] as { type: string; ids: readonly string[] }[],
  },
}));

vi.mock("@/api/goals", () => ({
  fetchGoals: vi.fn(async () => store.goals.map((g) => ({ ...g }))),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  sumGoalAporteFromLedger: vi.fn(async () => 0),
}));

vi.mock("@/api/finance", () => ({
  fetchValueByNatureForMonth: vi.fn(async () => null),
  createTransactionApi: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(async () => []),
  createRecurringApi: vi.fn(),
}));

vi.mock("@/api/notes/noteLinks", () => ({
  fetchNotesLinkedToMany: vi.fn(
    async (entityType: string, entityIds: readonly string[]) => {
      store.calls.push({ type: entityType, ids: entityIds });
      if (store.fail) throw new Error("row level security");
      return store.notesByGoal;
    }
  ),
}));

// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

// `toast` precisa ter identidade estável: o `load` da página é `useCallback([toast])` — um `vi.fn()`
// novo a cada render recarregaria a página em laço.
const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function goal(id: string, title: string): PersonalGoal {
  return {
    id,
    title,
    category: "other",
    target_value: 10,
    current_value: 0,
    status: "active",
  };
}

function note(id: string, title: string): Note {
  return { id, title, content: "", project_id: null };
}

function renderGoals() {
  return render(
    <MemoryRouter>
      <Goals />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.goals = [goal("g1", "Correr 10km"), goal("g2", "Ler 12 livros")];
  store.notesByGoal = {};
  store.fail = false;
  store.calls = [];
});

describe("Metas — notas vinculadas (consulta reversa de note_link)", () => {
  it("mostra, no card da meta, as notas ligadas a ela", async () => {
    store.notesByGoal = {
      g1: [note("n1", "Planilha de treinos")],
      g2: [note("n2", "Lista de leitura")],
    };
    renderGoals();

    const card = (await screen.findByText("Correr 10km")).closest(
      "article"
    ) as HTMLElement;
    const link = within(card).getByRole("link", { name: "Planilha de treinos" });
    expect(link).toHaveAttribute("href", "/notes/n1");
    // A nota da outra meta fica no card da outra meta, não neste.
    expect(within(card).queryByText("Lista de leitura")).toBeNull();
  });

  it("carrega as notas de todas as metas numa consulta só, com o tipo goal", async () => {
    store.notesByGoal = { g1: [note("n1", "Planilha de treinos")] };
    renderGoals();

    await screen.findByText("Planilha de treinos");
    // Uma chamada por card seria uma ida ao banco por meta.
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0].type).toBe("goal");
    expect([...store.calls[0].ids]).toEqual(["g1", "g2"]);
  });

  it("meta sem nota vinculada não ganha bloco 'Notas' vazio", async () => {
    renderGoals();
    const card = (await screen.findByText("Correr 10km")).closest(
      "article"
    ) as HTMLElement;
    expect(within(card).queryByText("Notas")).toBeNull();
  });

  it("falha ao buscar as notas não derruba a página de Metas", async () => {
    store.fail = true;
    renderGoals();
    // As metas continuam na tela: nota é informação acessória da meta.
    expect(await screen.findByText("Correr 10km")).toBeInTheDocument();
    expect(screen.getByText("Ler 12 livros")).toBeInTheDocument();
  });
});
