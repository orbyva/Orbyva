import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import HealthDashboard from "@/pages/admin/life/HealthDashboard";
import type { Task, TaskCreateRequest } from "@/types/tasks";

/**
 * Fluxo do Health Dashboard (feature 060) contra um backend falso em memória: a tabela `task` é uma
 * lista, e `loadHealthSummary` escolhe dela a próxima dose pendente do jeito que a consulta real faz
 * (a consulta em si é coberta por `src/api/__tests__/health.test.ts`). Substitui a verificação
 * manual no navegador (proibida pela skill `next`): tela vazia → cadastrar medicação pelo CTA →
 * ver a próxima dose com data e hora → erro de carregamento virando toast.
 */

const { store } = vi.hoisted(() => ({
  store: {
    tasks: [] as Task[],
    seq: 0,
    /** Quando setado, o próximo `loadHealthSummary` estoura — simula falha de rede. */
    failNextLoad: null as Error | null,
  },
}));

vi.mock("@/api/health", () => ({
  loadHealthSummary: vi.fn(async () => {
    if (store.failNextLoad) {
      const error = store.failNextLoad;
      store.failNextLoad = null;
      throw error;
    }
    const today = "2026-08-16";
    const pending = store.tasks
      .filter(
        (task) =>
          task.is_medication === true &&
          task.status === "todo" &&
          task.due_date != null &&
          task.due_date >= today
      )
      .sort(
        (a, b) =>
          (a.due_date ?? "").localeCompare(b.due_date ?? "") ||
          (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99")
      );
    return { nextMedicationDose: pending[0] ?? null };
  }),
}));

// O dialog de medicação (feature 049) grava por `createTask` — o falso escreve na mesma lista que
// o resumo lê, então o que a tela mostra depois vem mesmo do que foi salvo.
vi.mock("@/api/tasks", () => ({
  createTask: vi.fn(async (draft: TaskCreateRequest) => {
    const created = { ...draft, id: `t${++store.seq}` } as Task;
    store.tasks.push(created);
    return created;
  }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/life/health"]}>
      <HealthDashboard />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 16, 9, 0, 0));
  store.tasks = [];
  store.seq = 0;
  store.failNextLoad = null;
});

describe("Health Dashboard — fluxo", () => {
  it("sem medicação cadastrada, mostra o estado vazio com o CTA de cadastrar", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Saúde", level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Próxima dose", level: 2 })
    ).toBeInTheDocument();
    expect(await screen.findByText("Nenhuma dose agendada")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cadastrar medicação" })
    ).toBeInTheDocument();
  });

  it("com uma medicação agendada, mostra o remédio com data e horário", async () => {
    store.tasks = [
      {
        id: "t1",
        project_id: null,
        parent_task_id: null,
        recurrence_origin_id: null,
        title: "Losartana",
        status: "todo",
        tag_ids: [],
        due_date: "2026-08-18",
        due_time: "08:00",
        recurrence_rule: null,
        linked_recurring_id: null,
        linked_installment_number: null,
        is_medication: true,
      },
    ];
    renderPage();

    expect(await screen.findByText("Losartana")).toBeInTheDocument();
    expect(screen.getByText("18/08/2026 08:00")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma dose agendada")).toBeNull();
  });

  it("entre duas doses pendentes, mostra a mais próxima", async () => {
    const base = {
      project_id: null,
      parent_task_id: null,
      recurrence_origin_id: null,
      status: "todo" as const,
      tag_ids: [],
      recurrence_rule: null,
      linked_recurring_id: null,
      linked_installment_number: null,
      is_medication: true,
    };
    store.tasks = [
      { ...base, id: "t2", title: "Losartana", due_date: "2026-08-18", due_time: "08:00" },
      { ...base, id: "t1", title: "Vitamina D", due_date: "2026-08-16", due_time: "20:00" },
    ];
    renderPage();

    expect(await screen.findByText("Vitamina D")).toBeInTheDocument();
    expect(screen.getByText("16/08/2026 20:00")).toBeInTheDocument();
    expect(screen.queryByText("Losartana")).toBeNull();
  });

  it("cadastrar uma medicação pelo CTA salva a tarefa e a próxima dose aparece na tela", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Cadastrar medicação" }));

    await user.type(await screen.findByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText(/Horário/), "08:00");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    // Gravou como tarefa de medicação pendente para hoje (é o que a 049 faz por baixo).
    await waitFor(() => expect(store.tasks).toHaveLength(1));
    expect(store.tasks[0].is_medication).toBe(true);
    expect(store.tasks[0].status).toBe("todo");
    expect(store.tasks[0].due_date).toBe("2026-08-16");
    expect(store.tasks[0].due_time).toBe("08:00");

    // E a tela recarregou sozinha mostrando a dose recém-criada.
    expect(await screen.findByText("Losartana")).toBeInTheDocument();
    expect(screen.getByText("16/08/2026 08:00")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma dose agendada")).toBeNull();
  });

  it("falha ao carregar vira toast de erro, sem quebrar a tela", async () => {
    store.failNextLoad = new Error("Failed to fetch");
    renderPage();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    // A página continua de pé: o cabeçalho da seção segue lá.
    expect(
      screen.getByRole("heading", { name: "Próxima dose", level: 2 })
    ).toBeInTheDocument();
  });
});
