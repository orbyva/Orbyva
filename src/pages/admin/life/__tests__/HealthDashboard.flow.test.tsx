import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import HealthDashboard from "@/pages/admin/life/HealthDashboard";
import { pickDate } from "@/test/pickDate";
import type { Medication, MedicationCreateRequest } from "@/types/health";
import type { Task, TaskCreateRequest } from "@/types/tasks";

/**
 * Fluxo do Health Dashboard (features 060 e 061) contra um backend falso em memória: a tabela
 * `task` é uma lista, e `loadHealthSummary` escolhe dela a próxima dose e a próxima consulta
 * pendentes do jeito que a consulta real faz (a consulta em si é coberta por
 * `src/api/__tests__/health.test.ts`). Substitui a verificação manual no navegador (proibida pela
 * skill `next`): tela vazia → cadastrar pelo CTA → ver o próximo compromisso com data e hora →
 * erro de carregamento virando toast.
 */

const { store } = vi.hoisted(() => ({
  store: {
    tasks: [] as Task[],
    medications: [] as Medication[],
    seq: 0,
    /** Quando setado, o próximo `loadHealthSummary` estoura — simula falha de rede. */
    failNextLoad: null as Error | null,
  },
}));


// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

vi.mock("@/api/health", () => ({
  // A seção "Hoje" (feature 062) tem fluxo próprio em `HealthDashboard.habits.test.tsx`; aqui ela
  // fica vazia de propósito, pra este arquivo continuar sendo sobre dose e consulta.
  fetchHealthHabitsToday: vi.fn(async () => []),
  loadHealthSummary: vi.fn(async () => {
    if (store.failNextLoad) {
      const error = store.failNextLoad;
      store.failNextLoad = null;
      throw error;
    }
    const today = "2026-08-16";
    const bySchedule = (a: Task, b: Task) =>
      (a.due_date ?? "").localeCompare(b.due_date ?? "") ||
      (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99");
    const nextPending = (flag: "is_medication" | "is_consultation") =>
      store.tasks
        .filter(
          (task) =>
            task[flag] === true &&
            task.status === "todo" &&
            task.due_date != null &&
            task.due_date >= today
        )
        .sort(bySchedule)[0] ?? null;
    return {
      nextMedicationDose: nextPending("is_medication"),
      nextConsultation: nextPending("is_consultation"),
      todayDoses: store.tasks
        .filter(
          (task) =>
            task.is_medication === true &&
            task.due_date != null &&
            (task.due_date === today ||
              (task.due_date < today && task.status === "todo"))
        )
        .sort(bySchedule),
      upcomingConsultations: store.tasks
        .filter(
          (task) =>
            task.is_consultation === true &&
            task.due_date != null &&
            ((task.status === "todo" && task.due_date >= today) ||
              (task.status === "done" && task.due_date === today))
        )
        .sort(bySchedule),
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
      activeMedicationCount: store.medications.length,
      medications: store.medications,
    };
  }),
}));

// O dialog de consulta (feature 061) grava por `createTask` — o falso escreve na mesma lista que
// o resumo lê, então o que a tela mostra depois vem mesmo do que foi salvo.
vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  createTask: vi.fn(async (draft: TaskCreateRequest) => {
    const created = { ...draft, id: `t${++store.seq}` } as Task;
    store.tasks.push(created);
    return created;
  }),
  updateTask: vi.fn(async (patch: { id: string; status?: Task["status"]; title?: string; description?: string | null; due_date?: string | null; due_time?: string | null }) => {
    const row = store.tasks.find((task) => task.id === patch.id);
    if (row) {
      if (patch.status !== undefined) {
        row.status = patch.status;
        row.completed_at = patch.status === "done" ? new Date().toISOString() : null;
      }
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.description !== undefined) row.description = patch.description;
      if (patch.due_date !== undefined) row.due_date = patch.due_date;
      if (patch.due_time !== undefined) row.due_time = patch.due_time;
    }
  }),
  deleteTask: vi.fn(async (id: string) => {
    store.tasks = store.tasks.filter((task) => task.id !== id);
  }),
}));

// Desde a 064 o dialog de medicação grava numa `medication`, e as doses saem da materialização.
// O falso reproduz os dois lados: guarda o tratamento e escreve a dose de hoje na mesma lista de
// tarefas que o resumo lê — é o que prova que cadastrar aqui faz a próxima dose aparecer.
vi.mock("@/api/health/medications", () => ({
  createMedicationWithDoses: vi.fn(async (input: MedicationCreateRequest) => {
    const medication = { ...input, id: `m${++store.seq}`, active: true } as Medication;
    store.medications.push(medication);
    store.tasks.push({
      id: `t${++store.seq}`,
      project_id: null,
      parent_task_id: null,
      recurrence_origin_id: null,
      title: medication.name,
      status: "todo",
      tag_ids: [],
      due_date: medication.started_on,
      due_time: medication.times[0]!,
      dose_time: medication.times[0]!,
      recurrence_rule: null,
      linked_recurring_id: null,
      linked_installment_number: null,
      is_medication: true,
      medication_id: medication.id,
    });
    return medication;
  }),
  updateMedication: vi.fn(),
  deactivateMedication: vi.fn(async (id: string) => {
    store.medications = store.medications.filter((item) => item.id !== id);
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
  store.medications = [];
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
      screen.getByRole("heading", { name: "Medicações", level: 2 })
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
    expect(screen.getByText("hoje às 20:00")).toBeInTheDocument();
    expect(screen.queryByText("Losartana")).toBeNull();
  });

  it("cadastrar uma medicação pelo CTA cria o tratamento e a próxima dose aparece na tela", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Cadastrar medicação" }));

    await user.type(await screen.findByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    // Desde a 064 o que se cria é um tratamento; a dose é a task materializada a partir dele.
    await waitFor(() => expect(store.medications).toHaveLength(1));
    expect(store.medications[0].times).toEqual(["08:00"]);
    expect(store.medications[0].interval_days).toBe(1);
    expect(store.medications[0].started_on).toBe("2026-08-16");
    expect(store.tasks).toHaveLength(1);
    expect(store.tasks[0].is_medication).toBe(true);
    expect(store.tasks[0].medication_id).toBe(store.medications[0].id);
    expect(store.tasks[0].status).toBe("todo");
    expect(store.tasks[0].due_date).toBe("2026-08-16");
    expect(store.tasks[0].due_time).toBe("08:00");

    // E a tela recarregou sozinha mostrando a dose recém-criada.
    expect(await screen.findByText("Losartana")).toBeInTheDocument();
    expect(screen.getByText("hoje às 08:00")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma dose agendada")).toBeNull();
  });

  it("sem consulta cadastrada, a seção Consultas mostra o estado vazio com o CTA", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Consultas", level: 2 })
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Nenhuma consulta agendada")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Agendar consulta" })
    ).toBeInTheDocument();
  });

  it("agendar uma consulta pelo CTA salva a tarefa e ela aparece na seção Consultas", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Agendar consulta" }));

    await user.type(await screen.findByLabelText(/Especialidade/), "Cardiologista");
    await user.type(screen.getByLabelText(/Profissional/), "Dr. Silva");
    await pickDate(user, /^Data/, "2026-09-10");
    await user.type(screen.getByLabelText(/Horário/), "14:30");
    await user.type(screen.getByLabelText(/Local e preparo/), "Clínica Vida — jejum de 8h");
    await user.click(screen.getByRole("button", { name: "Agendar" }));

    // Gravou como tarefa de consulta pendente — é o que a coloca no calendário geral.
    await waitFor(() => expect(store.tasks).toHaveLength(1));
    expect(store.tasks[0].is_consultation).toBe(true);
    expect(store.tasks[0].is_medication).toBe(false);
    expect(store.tasks[0].status).toBe("todo");
    expect(store.tasks[0].title).toBe("Cardiologista — Dr. Silva");
    expect(store.tasks[0].due_date).toBe("2026-09-10");
    expect(store.tasks[0].due_time).toBe("14:30");

    // E a tela recarregou sozinha mostrando a consulta recém-agendada.
    expect(await screen.findByText("Cardiologista — Dr. Silva")).toBeInTheDocument();
    expect(screen.getByText("10/09/2026 14:30")).toBeInTheDocument();
    expect(screen.getByText("Clínica Vida — jejum de 8h")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma consulta agendada")).toBeNull();
  });

  it("dose e consulta convivem: cada seção mostra o seu, sem trocar", async () => {
    const base = {
      project_id: null,
      parent_task_id: null,
      recurrence_origin_id: null,
      status: "todo" as const,
      tag_ids: [],
      recurrence_rule: null,
      linked_recurring_id: null,
      linked_installment_number: null,
    };
    store.tasks = [
      {
        ...base,
        id: "t1",
        title: "Losartana",
        due_date: "2026-08-18",
        due_time: "08:00",
        is_medication: true,
      },
      {
        ...base,
        id: "t2",
        title: "Cardiologista — Dr. Silva",
        due_date: "2026-09-10",
        due_time: "14:30",
        is_consultation: true,
      },
    ];
    renderPage();

    expect(await screen.findByText("Losartana")).toBeInTheDocument();
    expect(screen.getByText("18/08/2026 08:00")).toBeInTheDocument();
    expect(screen.getByText("Cardiologista — Dr. Silva")).toBeInTheDocument();
    expect(screen.getByText("10/09/2026 14:30")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma dose agendada")).toBeNull();
    expect(screen.queryByText("Nenhuma consulta agendada")).toBeNull();
  });

  it("lista as doses de hoje e as próximas consultas, não só a imediata", async () => {
    const base = {
      project_id: null,
      parent_task_id: null,
      recurrence_origin_id: null,
      status: "todo" as const,
      tag_ids: [],
      recurrence_rule: null,
      linked_recurring_id: null,
      linked_installment_number: null,
    };
    store.tasks = [
      {
        ...base,
        id: "t1",
        title: "Losartana",
        due_date: "2026-08-16",
        due_time: "08:00",
        is_medication: true,
        medication_id: "m1",
      },
      {
        ...base,
        id: "t2",
        title: "Vitamina D",
        due_date: "2026-08-16",
        due_time: "20:00",
        is_medication: true,
        medication_id: "m2",
      },
      {
        ...base,
        id: "c1",
        title: "Cardiologista — Dr. Silva",
        due_date: "2026-09-10",
        due_time: "14:30",
        is_consultation: true,
      },
      {
        ...base,
        id: "c2",
        title: "Dermatologista — Dra. Costa",
        due_date: "2026-10-02",
        due_time: "09:00",
        is_consultation: true,
      },
    ];
    renderPage();

    expect(await screen.findByText("Losartana")).toBeInTheDocument();
    expect(screen.getByText("Vitamina D")).toBeInTheDocument();
    expect(screen.getByText("hoje às 08:00")).toBeInTheDocument();
    expect(screen.getByText("hoje às 20:00")).toBeInTheDocument();
    expect(screen.getByText("Cardiologista — Dr. Silva")).toBeInTheDocument();
    expect(screen.getByText("Dermatologista — Dra. Costa")).toBeInTheDocument();
  });

  it("clicar na dose de hoje marca como tomada, com toast da hora", async () => {
    const user = userEvent.setup();
    store.tasks = [
      {
        id: "t1",
        project_id: null,
        parent_task_id: null,
        recurrence_origin_id: null,
        title: "Losartana",
        status: "todo",
        tag_ids: [],
        due_date: "2026-08-16",
        due_time: "08:00",
        recurrence_rule: null,
        linked_recurring_id: null,
        linked_installment_number: null,
        is_medication: true,
        medication_id: "m1",
      },
    ];
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Marcar Losartana como tomada" })
    );

    await waitFor(() => expect(store.tasks[0].status).toBe("done"));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/^Tomado às /) })
    );
    expect(
      screen.getByRole("button", { name: "Desmarcar Losartana como tomada" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("os atalhos de criar ficam no card, não no cabeçalho da página", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "Saúde", level: 1 });
    const medSection = screen
      .getByRole("heading", { name: "Medicações", level: 2 })
      .closest("section")!;
    const consultSection = screen
      .getByRole("heading", { name: "Consultas", level: 2 })
      .closest("section")!;
    const todaySection = screen
      .getByRole("heading", { name: "Hoje", level: 2 })
      .closest("section")!;

    expect(
      within(medSection).getByRole("button", { name: "Cadastrar medicação" })
    ).toBeInTheDocument();
    expect(
      within(consultSection).getByRole("button", { name: "Agendar consulta" })
    ).toBeInTheDocument();
    expect(
      within(todaySection).getByRole("button", { name: "Novo hábito de saúde" })
    ).toBeInTheDocument();
    expect(
      within(consultSection).getByRole("link", { name: "Ver consultas" })
    ).toHaveAttribute("href", "/life/health/consultations");
    expect(
      screen.getByRole("link", { name: "Ver progresso" })
    ).toHaveAttribute("href", "/life/health/progress");
    expect(
      screen.getAllByRole("button", { name: "Cadastrar medicação" })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Agendar consulta" })
    ).toHaveLength(1);
  });

  it("editar a consulta pelo ícone grava o título novo nesta ocorrência", async () => {
    const user = userEvent.setup();
    store.tasks = [
      {
        id: "c1",
        project_id: null,
        parent_task_id: null,
        recurrence_origin_id: null,
        title: "tesste — Dr Teste",
        status: "todo",
        tag_ids: [],
        due_date: "2026-08-16",
        due_time: "11:06",
        recurrence_rule: null,
        linked_recurring_id: null,
        linked_installment_number: null,
        is_consultation: true,
      },
    ];
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Editar tesste — Dr Teste" })
    );
    const specialty = await screen.findByLabelText(/Especialidade/);
    await user.clear(specialty);
    await user.type(specialty, "Cardiologista");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(store.tasks[0]!.title).toBe("Cardiologista — Dr Teste")
    );
    expect(await screen.findByText("Cardiologista — Dr Teste")).toBeInTheDocument();
  });

  it("excluir a consulta pede confirmação e tira a linha da seção", async () => {
    const user = userEvent.setup();
    store.tasks = [
      {
        id: "c1",
        project_id: null,
        parent_task_id: null,
        recurrence_origin_id: null,
        title: "Cardiologista — Dr. Silva",
        status: "todo",
        tag_ids: [],
        due_date: "2026-09-10",
        due_time: "14:30",
        recurrence_rule: null,
        linked_recurring_id: null,
        linked_installment_number: null,
        is_consultation: true,
      },
    ];
    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: "Excluir Cardiologista — Dr. Silva",
      })
    );
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    expect(await screen.findByText("Nenhuma consulta agendada")).toBeInTheDocument();
    expect(store.tasks).toHaveLength(0);
  });

  it("editar a medicação pelo ícone abre o cadastro preenchido", async () => {
    const user = userEvent.setup();
    store.medications = [
      {
        id: "m1",
        name: "Losartana",
        times: ["08:00"],
        interval_days: 1,
        started_on: "2026-08-16",
        active: true,
      },
    ];
    store.tasks = [
      {
        id: "t1",
        project_id: null,
        parent_task_id: null,
        recurrence_origin_id: null,
        title: "Losartana",
        status: "todo",
        tag_ids: [],
        due_date: "2026-08-16",
        due_time: "08:00",
        recurrence_rule: null,
        linked_recurring_id: null,
        linked_installment_number: null,
        is_medication: true,
        medication_id: "m1",
      },
    ];
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Editar Losartana" }));
    expect(await screen.findByRole("heading", { name: "Editar medicação" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome do remédio/)).toHaveValue("Losartana");
  });

  it("encerrar a medicação a partir da dose tira o tratamento da lista ativa", async () => {
    const user = userEvent.setup();
    store.medications = [
      {
        id: "m1",
        name: "Losartana",
        times: ["08:00"],
        interval_days: 1,
        started_on: "2026-08-16",
        active: true,
      },
    ];
    store.tasks = [
      {
        id: "t1",
        project_id: null,
        parent_task_id: null,
        recurrence_origin_id: null,
        title: "Losartana",
        status: "todo",
        tag_ids: [],
        due_date: "2026-08-16",
        due_time: "08:00",
        recurrence_rule: null,
        linked_recurring_id: null,
        linked_installment_number: null,
        is_medication: true,
        medication_id: "m1",
      },
    ];
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Encerrar Losartana" }));
    await user.click(screen.getByRole("button", { name: "Encerrar" }));

    await waitFor(() => expect(store.medications).toHaveLength(0));
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
      screen.getByRole("heading", { name: "Medicações", level: 2 })
    ).toBeInTheDocument();
  });
});
