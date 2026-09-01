import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectFormDialog } from "@/pages/admin/tasks/ProjectFormDialog";
import type { Project, ProjectCreateRequest, ProjectEvent, Tag } from "@/types/tasks";

/**
 * Feature 050 — `ProjectFormDialog.tsx` extrai o dialog de criar/editar projeto que vivia inline
 * em `Projects.tsx`, pra ser reusado também em `ProjectDetail.tsx`. Cobre o componente isolado:
 * validação de nome, pré-preenchimento em modo edição, seção de Eventos condicional, e que erro
 * ao salvar não fecha o dialog (o componente não sabe *por que* falhou — isso é responsabilidade
 * de quem chama via `onSave` — só garante que `open` continua controlado por fora e o botão volta
 * a ficar habilitado).
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
    title: "Reunião semanal",
    starts_at: "2026-08-20T14:00:00.000Z",
    ...overrides,
  };
}

/** Espelha como `Projects.tsx`/`ProjectDetail.tsx` usam o componente: `open`/`form` são estado
 * do call site, `ProjectFormDialog` só recebe e devolve por callback. */
function Harness({
  editing = null,
  initialForm,
  events = [],
  tags = [],
  onSave = vi.fn(),
  onAddEvent = vi.fn(),
  onDeleteEvent = vi.fn(),
}: {
  editing?: Project | null;
  initialForm?: ProjectCreateRequest;
  events?: ProjectEvent[];
  tags?: Tag[];
  onSave?: () => Promise<void> | void;
  onAddEvent?: (payload: { title: string; startsAt: string }) => Promise<void> | void;
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
      onSave={onSave}
      onAddEvent={onAddEvent}
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

  it("adicionar evento chama onAddEvent com título, data do DatePicker e horário", async () => {
    const user = userEvent.setup();
    const onAddEvent = vi.fn().mockResolvedValue(undefined);
    render(<Harness editing={makeProject()} onAddEvent={onAddEvent} />);

    await user.type(screen.getByPlaceholderText("Título"), "Reunião mensal");
    await user.click(screen.getByRole("button", { name: "Data do evento" }));
    await user.click(screen.getByRole("button", { name: "Hoje" }));
    const time = screen.getByLabelText("Horário do evento");
    await user.clear(time);
    await user.type(time, "10:00");
    await user.click(screen.getByRole("button", { name: "Adicionar evento" }));

    expect(onAddEvent).toHaveBeenCalledWith({
      title: "Reunião mensal",
      startsAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T10:00$/),
    });
  });

  it("excluir um evento existente chama onDeleteEvent com o id", async () => {
    const user = userEvent.setup();
    const onDeleteEvent = vi.fn().mockResolvedValue(undefined);
    const event = makeEvent();
    render(<Harness editing={makeProject()} events={[event]} onDeleteEvent={onDeleteEvent} />);

    expect(screen.getByText(/Reunião semanal/)).toBeInTheDocument();
    // A linha do evento tem dois botões de ícone desde a feature 076 (convidar e excluir), então
    // o alvo é pelo rótulo acessível, não pela posição.
    await user.click(
      screen.getByRole("button", { name: "Excluir Reunião semanal" })
    );

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
