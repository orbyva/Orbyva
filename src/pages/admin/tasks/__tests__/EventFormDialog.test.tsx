import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  EventFormDialog,
  EVENT_ENDS_BEFORE_STARTS_MESSAGE,
  type EventFormLockedLink,
} from "@/pages/admin/tasks/EventFormDialog";
import { toLocalDateTimeInputValue } from "@/lib/dates";
import type { Project, ProjectEvent, Task } from "@/types/tasks";

/**
 * Feature 067: dialog de criar/editar evento da Agenda. Sem navegador na verificação, é aqui que se
 * prova o comportamento — validação, conversão de fuso do `datetime-local`, vínculo mutuamente
 * exclusivo e o que acontece quando `onSave` falha.
 */

function makeProject(overrides: Partial<Project> = {}): Project {
  return { id: "project-1", name: "Projeto Alpha", color: "#ff0000", status: "active", tag_ids: [], ...overrides };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: "project-1",
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Comprar cimento",
    status: "todo",
    tag_ids: [],
    due_date: null,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: "event-1",
    project_id: null,
    task_id: null,
    title: "Evento",
    starts_at: new Date(2026, 7, 17, 9, 0).toISOString(),
    ends_at: null,
    ...overrides,
  };
}

function renderDialog({
  editing = null as ProjectEvent | null,
  projects = [makeProject()],
  tasks = [makeTask()],
  lockedLink,
  prefillStartsAt,
  onSave = vi.fn(),
  onDelete,
  onOpenTask,
}: {
  editing?: ProjectEvent | null;
  projects?: Project[];
  tasks?: Task[];
  lockedLink?: EventFormLockedLink;
  prefillStartsAt?: string | null;
  onSave?: (draft: unknown) => Promise<void> | void;
  onDelete?: () => void;
  onOpenTask?: (taskId: string) => void;
} = {}) {
  const onOpenChange = vi.fn();
  const utils = render(
    <MemoryRouter>
      <EventFormDialog
        open
        onOpenChange={onOpenChange}
        editing={editing}
        projects={projects}
        tasks={tasks}
        lockedLink={lockedLink}
        prefillStartsAt={prefillStartsAt}
        onSave={onSave}
        onDelete={onDelete}
        onOpenTask={onOpenTask}
      />
    </MemoryRouter>
  );
  return { ...utils, onSave, onOpenChange };
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /Criar evento|Salvar alterações/ }) as HTMLButtonElement;
}

async function fillDateTime(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
  await user.clear(input);
  await user.type(input, value);
}

describe("EventFormDialog — validação", () => {
  it("salvar fica desabilitado sem título", async () => {
    const user = userEvent.setup();
    renderDialog();

    await fillDateTime(user, "Início", "2026-08-17T09:00");
    expect(saveButton()).toBeDisabled();

    await user.type(screen.getByLabelText(/^Título/), "Reunião");
    expect(saveButton()).toBeEnabled();
  });

  it("salvar fica desabilitado sem início", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/^Título/), "Reunião");
    expect(saveButton()).toBeDisabled();

    await fillDateTime(user, "Início", "2026-08-17T09:00");
    expect(saveButton()).toBeEnabled();
  });

  it("fim anterior ao início bloqueia o envio e mostra a mensagem no form", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    await user.type(screen.getByLabelText(/^Título/), "Reunião");
    await fillDateTime(user, "Início", "2026-08-17T09:00");
    await fillDateTime(user, "Fim", "2026-08-17T08:00");

    expect(screen.getByText(EVENT_ENDS_BEFORE_STARTS_MESSAGE)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    // Corrigido o fim, o bloqueio some.
    await fillDateTime(user, "Fim", "2026-08-17T10:00");
    expect(screen.queryByText(EVENT_ENDS_BEFORE_STARTS_MESSAGE)).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("EventFormDialog — criação", () => {
  it("chama onSave com título, ISO de início/fim e sem vínculo nenhum", async () => {
    const user = userEvent.setup();
    const { onSave, onOpenChange } = renderDialog();

    await user.type(screen.getByLabelText(/^Título/), "  Dentista  ");
    await fillDateTime(user, "Início", "2026-08-17T09:00");
    await fillDateTime(user, "Fim", "2026-08-17T10:30");
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith({
      title: "Dentista",
      starts_at: new Date(2026, 7, 17, 9, 0).toISOString(),
      ends_at: new Date(2026, 7, 17, 10, 30).toISOString(),
      project_id: null,
      task_id: null,
    });
    // Sucesso fecha o dialog.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("prefillStartsAt pré-preenche o início na hora local", () => {
    renderDialog({ prefillStartsAt: new Date(2026, 7, 17, 9, 0).toISOString() });

    expect(screen.getByLabelText(/^Início/)).toHaveValue("2026-08-17T09:00");
    expect(screen.getByLabelText(/^Título/)).toHaveValue("");
  });

  it("fim vazio vira null (evento sem hora de término)", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({ prefillStartsAt: new Date(2026, 7, 17, 9, 0).toISOString() });

    await user.type(screen.getByLabelText(/^Título/), "Sem fim");
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ ends_at: null }));
  });
});

describe("EventFormDialog — edição", () => {
  it("pré-preenche os campos a partir de `editing`, com a hora local correta", () => {
    const startsAt = new Date(2026, 7, 17, 14, 5).toISOString();
    const endsAt = new Date(2026, 7, 17, 15, 45).toISOString();
    renderDialog({ editing: makeEvent({ title: "Reunião de obra", starts_at: startsAt, ends_at: endsAt }) });

    expect(screen.getByText("Editar evento")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Título/)).toHaveValue("Reunião de obra");
    expect(screen.getByLabelText(/^Início/)).toHaveValue(toLocalDateTimeInputValue(startsAt));
    expect(screen.getByLabelText(/^Início/)).toHaveValue("2026-08-17T14:05");
    expect(screen.getByLabelText(/^Fim/)).toHaveValue("2026-08-17T15:45");
  });

  it("mantém o vínculo do evento em edição ao salvar sem mexer nele", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({
      editing: makeEvent({ task_id: "task-1", title: "Reunião sobre o cimento" }),
    });

    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: null, task_id: "task-1" })
    );
  });

  it("excluir aparece só quando onDelete é passado e dispara a confirmação", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const { unmount } = renderDialog({ editing: makeEvent(), onDelete });

    await user.click(screen.getByRole("button", { name: /Excluir/ }));
    await user.click(await screen.findByRole("button", { name: "Excluir" }));
    expect(onDelete).toHaveBeenCalled();

    unmount();
    renderDialog({ editing: makeEvent() });
    expect(screen.queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument();
  });
});

describe("EventFormDialog — vínculo (projeto | tarefa | nenhum)", () => {
  it("escolher Projeto manda project_id e deixa task_id nulo", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({ prefillStartsAt: new Date(2026, 7, 17, 9, 0).toISOString() });

    await user.type(screen.getByLabelText(/^Título/), "Reunião de obra");
    await user.click(screen.getByRole("tab", { name: "Projeto" }));
    await user.click(await screen.findByRole("option", { name: "Projeto Alpha" }));
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "project-1", task_id: null })
    );
  });

  it("escolher Tarefa manda task_id e deixa project_id nulo (projeto derivado, nunca copiado)", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({ prefillStartsAt: new Date(2026, 7, 17, 9, 0).toISOString() });

    await user.type(screen.getByLabelText(/^Título/), "Reunião sobre o cimento");
    await user.click(screen.getByRole("tab", { name: "Tarefa" }));
    await user.click(await screen.findByRole("option", { name: /Comprar cimento/ }));
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: null, task_id: "task-1" })
    );
  });

  it("trocar de segmento zera o id anterior — project_id e task_id nunca vão preenchidos juntos", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({ prefillStartsAt: new Date(2026, 7, 17, 9, 0).toISOString() });

    await user.type(screen.getByLabelText(/^Título/), "Reunião");

    await user.click(screen.getByRole("tab", { name: "Projeto" }));
    await user.click(await screen.findByRole("option", { name: "Projeto Alpha" }));

    await user.click(screen.getByRole("tab", { name: "Tarefa" }));
    await user.click(await screen.findByRole("option", { name: /Comprar cimento/ }));
    await user.click(saveButton());

    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ project_id: null, task_id: "task-1" })
    );

    // E de volta para "Sem vínculo": nenhum dos dois sobra.
    await user.click(screen.getByRole("tab", { name: "Sem vínculo" }));
    await user.click(saveButton());

    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ project_id: null, task_id: null })
    );
  });

  it("modo edição abre no segmento do vínculo atual, com o item marcado", async () => {
    renderDialog({ editing: makeEvent({ task_id: "task-1", title: "Reunião sobre o cimento" }) });

    expect(screen.getByRole("tab", { name: "Tarefa" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("option", { name: /Comprar cimento/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("lockedLink esconde o seletor e fixa o projeto no que foi passado", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({
      lockedLink: { kind: "project", id: "project-1" },
      prefillStartsAt: new Date(2026, 7, 17, 9, 0).toISOString(),
    });

    expect(screen.queryByRole("tab", { name: "Sem vínculo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Título/), "Reunião travada no projeto");
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "project-1", task_id: null })
    );
  });
});

describe("EventFormDialog — evento de tarefa: título e 'Ir para a tarefa' (feature 068)", () => {
  it("mostra o título da tarefa vinculada e chama onOpenTask com o id dela", async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    renderDialog({
      editing: makeEvent({ task_id: "task-1", title: "Reunião sobre o cimento" }),
      onOpenTask,
    });

    // "Comprar cimento" também aparece como opção do `TaskPicker`: o que importa aqui é a legenda.
    expect(screen.getByText(/Tarefa vinculada:/)).toHaveTextContent(
      "Tarefa vinculada: Comprar cimento"
    );
    await user.click(screen.getByRole("button", { name: /Ir para a tarefa/ }));

    expect(onOpenTask).toHaveBeenCalledWith("task-1");
  });

  it("sem onOpenTask, 'Ir para a tarefa' vira um link para /tasks (nunca um botão morto)", () => {
    renderDialog({ editing: makeEvent({ task_id: "task-1" }) });

    expect(screen.getByRole("link", { name: /Ir para a tarefa/ })).toHaveAttribute("href", "/tasks");
  });

  it("tarefa fora da lista carregada também cai no link, sem quebrar o dialog", () => {
    const onOpenTask = vi.fn();
    renderDialog({ editing: makeEvent({ task_id: "task-fora-do-filtro" }), onOpenTask });

    expect(screen.getByText(/tarefa fora da lista carregada/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ir para a tarefa/ })).toHaveAttribute("href", "/tasks");
  });

  it("evento sem tarefa não mostra nada disso", () => {
    renderDialog({ editing: makeEvent({ project_id: "project-1" }) });

    expect(screen.queryByText(/Ir para a tarefa/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tarefa vinculada/)).not.toBeInTheDocument();
  });
});

describe("EventFormDialog — erro ao salvar", () => {
  it("erro em onSave mantém o dialog aberto e reabilita o botão", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("falhou"));
    const { onOpenChange } = renderDialog({
      prefillStartsAt: new Date(2026, 7, 17, 9, 0).toISOString(),
      onSave,
    });

    await user.type(screen.getByLabelText(/^Título/), "Reunião");
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText(/^Título/)).toHaveValue("Reunião");
    expect(saveButton()).toBeEnabled();
  });
});
