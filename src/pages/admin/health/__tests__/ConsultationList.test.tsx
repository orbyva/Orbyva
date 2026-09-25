import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ConsultationList from "@/pages/admin/health/ConsultationList";
import { fetchConsultationTasks } from "@/api/health";
import { deleteTask } from "@/api/tasks";
import type { Task } from "@/types/tasks";

/**
 * Lista completa de consultas (hub de Saúde). Substitui a verificação no navegador: vazia →
 * agendar → pendente na seção Próximas → comparecida no Histórico → excluir.
 */

vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

vi.mock("@/api/health", () => ({
  fetchConsultationTasks: vi.fn(),
}));

vi.mock("@/api/tasks", () => ({
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function consultation(over: Partial<Task> & { id: string; title: string }): Task {
  return {
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    status: "todo",
    tag_ids: [],
    due_date: "2026-09-10",
    due_time: "14:30",
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    is_consultation: true,
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/life/health/consultations"]}>
      <ConsultationList />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchConsultationTasks).mockResolvedValue([]);
  vi.mocked(deleteTask).mockResolvedValue(undefined);
});

describe("ConsultationList", () => {
  it("sem consulta, mostra o estado vazio com o CTA", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Consultas", level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma consulta agendada")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Agendar consulta" })
    ).toBeInTheDocument();
  });

  it("separa pendentes em Próximas e comparecidas no Histórico", async () => {
    vi.mocked(fetchConsultationTasks).mockResolvedValue([
      consultation({
        id: "c1",
        title: "Cardiologista — Dr. Silva",
        due_date: "2026-09-10",
      }),
      consultation({
        id: "c0",
        title: "Dermatologista — Dra. Costa",
        status: "done",
        due_date: "2026-08-02",
        due_time: "09:00",
      }),
    ]);
    renderPage();

    expect(await screen.findByText("Cardiologista — Dr. Silva")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Próximas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Histórico" })).toBeInTheDocument();

    const upcoming = screen.getByRole("heading", { name: "Próximas" }).parentElement!;
    expect(within(upcoming).getByText("Cardiologista — Dr. Silva")).toBeInTheDocument();
    expect(within(upcoming).getByText("Pendente")).toBeInTheDocument();

    const history = screen.getByRole("heading", { name: "Histórico" }).parentElement!;
    expect(within(history).getByText("Dermatologista — Dra. Costa")).toBeInTheDocument();
    expect(within(history).getByText("Compareceu")).toBeInTheDocument();
  });

  it("excluir pede confirmação e some a linha", async () => {
    const user = userEvent.setup();
    const row = consultation({
      id: "c1",
      title: "Cardiologista — Dr. Silva",
    });
    vi.mocked(fetchConsultationTasks)
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([]);
    renderPage();

    await user.click(
      within(await screen.findByRole("listitem", { name: "Cardiologista — Dr. Silva" })).getByRole(
        "button",
        { name: "Excluir" }
      )
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Excluir",
      })
    );

    await waitFor(() => expect(deleteTask).toHaveBeenCalledWith("c1"));
    expect(await screen.findByText("Nenhuma consulta agendada")).toBeInTheDocument();
  });
});
