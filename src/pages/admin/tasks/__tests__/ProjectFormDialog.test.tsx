import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ProjectFormDialog,
  type ProjectEventSaveDraft,
} from "@/pages/admin/tasks/ProjectFormDialog";
import type { Project, ProjectCreateRequest, ProjectEvent, Tag, Task } from "@/types/tasks";

/**
 * Feature 050 — `ProjectFormDialog.tsx` extrai o dialog de criar/editar projeto que vivia inline
 * em `Projects.tsx`, pra ser reusado também em `ProjectDetail.tsx`. Cobre o componente isolado:
 * validação de nome, pré-preenchimento em modo edição, seção de Eventos condicional, e que erro
 * ao salvar não fecha o dialog (o componente não sabe *por que* falhou — isso é responsabilidade
 * de quem chama via `onSave` — só garante que `open` continua controlado por fora e o botão volta
 * a ficar habilitado).
 *
 * Feature 068 — a seção de Eventos deixou de ter mini-form próprio e passou a abrir o
 * `EventFormDialog` (o mesmo da Agenda), com um handler só (`onSaveEvent`) para criar e editar.
 */

const emptyForm = (): ProjectCreateRequest => ({
  name: "",
  description: "",
  color: null,
  goal_id: null,
  status: "planned",
  tag_ids: [],
});

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Projeto Alpha",
    description: "Descrição original",
    color: "#94a3b8",
    goal_id: null,
    status: "active",
    tag_ids: [],
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: "event-1",
    project_id: "project-1",
    task_id: null,
    title: "Reunião semanal",
    starts_at: "2026-08-20T14:00:00.000Z",
    ends_at: null,
    ...overrides,
  };
}

/** Espelha como `Projects.tsx`/`ProjectDetail.tsx` usam o componente: `open`/`form` são estado
 * do call site, `ProjectFormDialog` só recebe e devolve por callback. */
function Harness({
  editing = null,
  initialForm,
  events = [],
  tasks = [],
  tags = [],
  onSave = vi.fn(),
  onSaveEvent = vi.fn(),
  onDeleteEvent = vi.fn(),
}: {
  editing?: Project | null;
  initialForm?: ProjectCreateRequest;
  events?: ProjectEvent[];
  tasks?: Task[];
  tags?: Tag[];
  onSave?: () => Promise<void> | void;
  onSaveEvent?: (draft: ProjectEventSaveDraft) => Promise<void> | void;
  onDeleteEvent?: (id: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState<ProjectCreateRequest>(initialForm ?? emptyForm());

  return (
    <ProjectFormDialog
      open={open}
      onOpenChange={setOpen}
      editing={editing}
      form={form}
      setForm={setForm}
      tags={tags}
      onCreateTag={vi.fn()}
      events={events}
      tasks={tasks}
      onSave={onSave}
      onSaveEvent={onSaveEvent}
      onDeleteEvent={onDeleteEvent}
    />
  );
}

describe("ProjectFormDialog", () => {
  it("modo criação: título 'Novo projeto', botão 'Criar projeto' desabilitado sem nome", () => {
    render(<Harness />);

    expect(screen.getByText("Novo projeto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar projeto" })).toBeDisabled();
  });

  it("preencher o nome habilita o botão e salvar chama onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSave={onSave} />);

    await user.type(screen.getByLabelText(/Nome/), "Projeto Novo");
    const saveButton = screen.getByRole("button", { name: "Criar projeto" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("modo edição: pré-preenche os campos a partir de `editing`, título e botão trocam de texto", () => {
    const project = makeProject({ name: "Projeto Alpha", description: "Descrição original" });
    render(
      <Harness
        editing={project}
        initialForm={{
          name: project.name,
          description: project.description ?? "",
          color: project.color,
          goal_id: project.goal_id,
          status: project.status,
          tag_ids: project.tag_ids,
        }}
      />
    );

    expect(screen.getByText("Editar projeto")).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome/)).toHaveValue("Projeto Alpha");
    expect(screen.getByLabelText(/Descrição/)).toHaveValue("Descrição original");
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeInTheDocument();
  });

  it("seção Eventos só aparece em modo edição (editing != null)", () => {
    const { rerender } = render(<Harness />);
    expect(screen.queryByText(/Eventos/)).not.toBeInTheDocument();

    rerender(<Harness editing={makeProject()} />);
    expect(screen.getByText(/Eventos/)).toBeInTheDocument();
  });

  it("o '+' abre o EventFormDialog e salvar chama onSaveEvent sem id, com o fim preenchido", async () => {
    const user = userEvent.setup();
    const onSaveEvent = vi.fn().mockResolvedValue(undefined);
    render(<Harness editing={makeProject()} onSaveEvent={onSaveEvent} />);

    // O mini-form inline (título + datetime-local soltos) deixou de existir na 068.
    expect(screen.queryByPlaceholderText("Título")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adicionar evento" }));
    expect(await screen.findByText("Novo evento")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Título/), "Reunião mensal");
    await user.type(screen.getByLabelText(/^Início/), "2026-09-01T10:00");
    await user.type(screen.getByLabelText(/^Fim/), "2026-09-01T11:00");
    await user.click(screen.getByRole("button", { name: "Criar evento" }));

    expect(onSaveEvent).toHaveBeenCalledWith({
      id: undefined,
      title: "Reunião mensal",
      starts_at: new Date(2026, 8, 1, 10, 0).toISOString(),
      ends_at: new Date(2026, 8, 1, 11, 0).toISOString(),
    });
  });

  it("o lápis de um evento existente abre o form preenchido e salvar manda o id", async () => {
    const user = userEvent.setup();
    const onSaveEvent = vi.fn().mockResolvedValue(undefined);
    const starts = new Date(2026, 7, 20, 14, 0);
    render(
      <Harness
        editing={makeProject()}
        events={[makeEvent({ starts_at: starts.toISOString() })]}
        onSaveEvent={onSaveEvent}
      />
    );

    await user.click(screen.getByRole("button", { name: "Editar evento Reunião semanal" }));
    expect(await screen.findByText("Editar evento")).toBeInTheDocument();

    const title = screen.getByLabelText(/^Título/);
    expect(title).toHaveValue("Reunião semanal");
    expect(screen.getByLabelText(/^Início/)).toHaveValue("2026-08-20T14:00");
    await user.clear(title);
    await user.type(title, "Reunião quinzenal");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(onSaveEvent).toHaveBeenCalledWith({
      id: "event-1",
      title: "Reunião quinzenal",
      starts_at: starts.toISOString(),
      ends_at: null,
    });
  });

  it("o seletor de vínculo não aparece no dialog de evento do projeto (lockedLink)", async () => {
    const user = userEvent.setup();
    render(<Harness editing={makeProject()} />);

    await user.click(screen.getByRole("button", { name: "Adicionar evento" }));
    await screen.findByText("Novo evento");

    expect(screen.queryByRole("tab", { name: "Projeto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Tarefa" })).not.toBeInTheDocument();
  });

  it("excluir um evento existente chama onDeleteEvent com o id", async () => {
    const user = userEvent.setup();
    const onDeleteEvent = vi.fn().mockResolvedValue(undefined);
    const event = makeEvent();
    render(<Harness editing={makeProject()} events={[event]} onDeleteEvent={onDeleteEvent} />);

    expect(screen.getByText(/Reunião semanal/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Excluir evento Reunião semanal" }));

    expect(onDeleteEvent).toHaveBeenCalledWith("event-1");
  });

  it("erro ao salvar mantém o dialog aberto e reabilita o botão", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("Falhou"));
    render(<Harness onSave={onSave} />);

    await user.type(screen.getByLabelText(/Nome/), "Projeto Novo");
    const saveButton = screen.getByRole("button", { name: "Criar projeto" });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Novo projeto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar projeto" })).toBeEnabled();
  });
});
