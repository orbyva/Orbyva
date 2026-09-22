import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { TaskFormFields } from "@/pages/admin/tasks/TaskFormFields";
import { emptyTask } from "@/domain/tasks/taskDraft";
import { dueDateForShortcut } from "@/domain/tasks/agenda";
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateBR } from "@/lib/currency";
import { fetchTasksMentioningTask, uploadIconAsset } from "@/api/tasks";
import { fetchNotesMentioningTask } from "@/api/notes/notes";
import type { Note } from "@/types/notes";
import type {
  Project,
  SubtaskDraft,
  Task,
  TaskCreateRequest,
  TaskExternalLinkDraft,
} from "@/types/tasks";

/**
 * Feature 042 — `TaskFormFields.tsx` é a fonte única do formulário de tarefa dos três call sites.
 * Feature 080 — deixou de ser 4 abas de uma coluna e virou um **painel único**: os testes de
 * navegação entre abas viraram testes de painel (todos os campos de uma vez, na ordem pedida) e o
 * que saiu da tela principal (descrição, repetição, subtarefas, registros) está a um clique.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 106: o formulário em edição procura quem cita a tarefa ("Referenciada em").
  fetchTasksMentioningTask: vi.fn(async () => []),
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
  fetchEntriesForTask: vi.fn().mockResolvedValue([]),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  createRecurringApi: vi.fn(),
}));

// Feature 084: em modo edição o painel consulta as notas já vinculadas à tarefa. Aqui não
// interessa o que ela devolve — só que o teste não vá à rede.
vi.mock("@/api/notes/noteLinks", () => ({
  fetchNotesLinkedTo: vi.fn().mockResolvedValue([]),
  addNoteLink: vi.fn(),
}));

vi.mock("@/api/notes/notes", () => ({
  // Feature 106: a outra metade de "Referenciada em".
  fetchNotesMentioningTask: vi.fn(async () => []),
  createNote: vi.fn(),
  fetchNotes: vi.fn().mockResolvedValue([]),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return { id: "project-1", name: "Projeto Alpha", status: "active", tag_ids: [], ...overrides };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa",
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

/** Espelha como `TaskList.tsx`/`ProjectDetail.tsx`/`AgendaGrid.tsx` usam o componente: `form` é
 * estado do call site, `TaskFormFields` só recebe e devolve por callback. */
function Harness({
  editing = null,
  projects,
  tasks = [],
  initialForm,
  initialLinks,
}: {
  editing?: Task | null;
  projects?: Project[];
  tasks?: Task[];
  initialForm?: TaskCreateRequest;
  initialLinks?: TaskExternalLinkDraft[];
}) {
  const [form, setForm] = useState<TaskCreateRequest>(initialForm ?? emptyTask());
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  // Feature 085: o link externo deixou de ser um campo do `form` e virou lista própria, controlada
  // pelo call site como as subtarefas.
  const [externalLinks, setExternalLinks] = useState<TaskExternalLinkDraft[]>(initialLinks ?? []);

  return (
    // Feature 084: o painel agora tem os atalhos de nota/canvas, que navegam para o editor —
    // `useNavigate` exige um Router acima, como nos três call sites reais (todos são páginas).
    <MemoryRouter initialEntries={["/tasks"]}>
      <pre data-testid="form">{JSON.stringify(form)}</pre>
      <TaskFormFields
        form={form}
        setForm={setForm}
        editing={editing}
        tasks={tasks}
        tags={[]}
        onCreateTag={vi.fn()}
        recurrings={[]}
        onRecurringCreated={vi.fn()}
        dimensions={[]}
        subtasks={subtasks}
        onAddSubtask={(title) => setSubtasks((prev) => [...prev, { title }])}
        onRemoveSubtask={(_subtask, index) =>
          setSubtasks((prev) => prev.filter((_, i) => i !== index))
        }
        externalLinks={externalLinks}
        onExternalLinksChange={setExternalLinks}
        projects={projects}
      />
    </MemoryRouter>
  );
}

/** Aproximação suficiente do nome acessível para o que o painel usa: `aria-label`, `<label for>`,
 * `<label>` em volta, ou o próprio texto do controle. */
function accessibleName(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim();
  const id = el.getAttribute("id");
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  const wrapping = el.closest("label");
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
  return (el.textContent ?? "").trim();
}

function currentForm(): TaskCreateRequest {
  return JSON.parse(screen.getByTestId("form").textContent as string);
}

describe("TaskFormFields — painel único (feature 080)", () => {
  it("não existe mais navegação por abas: nenhuma `tab` no formulário principal", () => {
    render(<Harness projects={[makeProject()]} />);

    expect(screen.queryByRole("tab", { name: "Geral" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Data e repetição" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Organização" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Registros de tempo" })).not.toBeInTheDocument();
  });

  it("todos os campos do fluxo de criação aparecem de uma vez, sem clique nenhum", () => {
    render(<Harness projects={[makeProject()]} />);

    // Bloco 1 e 2
    expect(screen.getByLabelText(/^Título/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Descrição/ })).toBeInTheDocument();
    // Bloco 3 — projeto + operadores de tempo
    expect(screen.getByText("Projeto")).toBeInTheDocument();
    expect(screen.getByText("Duração")).toBeInTheDocument();
    expect(screen.getByText("Data limite")).toBeInTheDocument();
    expect(screen.getByText("Início")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Repetição da tarefa/ })).toBeInTheDocument();
    // Bloco 4 — instrumentos
    expect(screen.getByText("Ícone")).toBeInTheDocument();
    expect(screen.getByText("Prioridade")).toBeInTheDocument();
    expect(screen.getByText("Marco")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Tarefa pontual \(sem duração\)/ })
    ).toBeInTheDocument();
    // Bloco 5, 6
    expect(screen.getByText("Tags")).toBeInTheDocument();
    // Feature 085: o campo único "Link externo" virou a seção "Links externos", no mesmo idioma
    // colapsável de Descrição/Subtarefas — vários links, cada um com comentário.
    expect(screen.getByRole("button", { name: /Links externos/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Subtarefas/ })).toBeInTheDocument();
  });

  it("a ordem dos blocos é a pedida: título → descrição → projeto/tempo → instrumentos → tags/link → subtarefas", () => {
    render(<Harness projects={[makeProject()]} />);

    const marks = [
      screen.getByLabelText(/^Título/),
      screen.getByRole("button", { name: /Descrição/ }),
      screen.getByText("Projeto"),
      screen.getByText("Data limite"),
      screen.getByText("Prioridade"),
      screen.getByText("Tags"),
      screen.getByRole("button", { name: /Links externos/ }),
      screen.getByRole("button", { name: /Subtarefas/ }),
    ];

    for (let i = 1; i < marks.length; i += 1) {
      // Node.compareDocumentPosition: 4 = o argumento vem DEPOIS do nó de referência.
      expect(marks[i - 1].compareDocumentPosition(marks[i]) & 4).toBeTruthy();
    }
  });

  it("Ícone e Prioridade dividem a mesma linha de instrumentos (a queixa literal do pedido)", () => {
    render(<Harness />);

    const iconLabel = screen.getByText("Ícone");
    const priorityLabel = screen.getByText("Prioridade");
    const milestoneLabel = screen.getByText("Marco");
    const quickLabel = screen.getByText("Tarefa pontual");

    const row = iconLabel.closest("div.flex.flex-wrap");
    expect(row).not.toBeNull();
    expect(row).toContainElement(priorityLabel);
    expect(row).toContainElement(milestoneLabel);
    expect(row).toContainElement(quickLabel);
  });

  it("campo Projeto só aparece quando a prop `projects` é passada (TaskList.tsx)", async () => {
    const user = userEvent.setup();
    render(<Harness projects={[makeProject()]} />);

    expect(screen.getByText("Projeto")).toBeInTheDocument();
    // Uma linha só: o badge clicável, e a lista aparece no popover.
    await user.click(screen.getByRole("button", { name: "Sem projeto" }));
    expect(await screen.findByRole("listbox", { name: "Projeto" })).toBeInTheDocument();
  });

  it("campo Projeto não aparece quando `projects` está ausente (ProjectDetail.tsx)", () => {
    render(<Harness />);

    expect(screen.queryByText("Projeto")).not.toBeInTheDocument();
  });

  it("escolher um projeto no popover grava `project_id`", async () => {
    const user = userEvent.setup();
    render(<Harness projects={[makeProject({ id: "p-9", name: "Casa" })]} />);

    await user.click(screen.getByRole("button", { name: "Sem projeto" }));
    await user.click(await screen.findByRole("option", { name: "Casa" }));

    expect(currentForm().project_id).toBe("p-9");
  });

  it("subtarefa em edição mostra o projeto herdado, sem seletor", () => {
    render(
      <Harness
        editing={makeTask({ id: "sub-1", parent_task_id: "parent-1" })}
        projects={[makeProject()]}
        initialForm={{ ...emptyTask(), parent_task_id: "parent-1", project_id: "project-1" }}
      />
    );

    expect(screen.getByText("Herdado da tarefa principal")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sem projeto" })).not.toBeInTheDocument();
  });

  it("a seção Registros de tempo só existe em modo edição", () => {
    const { unmount } = render(<Harness />);
    expect(screen.queryByRole("button", { name: /Registros de tempo/ })).not.toBeInTheDocument();
    unmount();

    render(<Harness editing={makeTask({ id: "task-1" })} />);
    expect(screen.getByRole("button", { name: /Registros de tempo/ })).toBeInTheDocument();
  });

  it("subtarefa não tem sub-subtarefas: a seção Subtarefas some", () => {
    render(
      <Harness
        editing={makeTask({ id: "sub-1", parent_task_id: "parent-1", due_date: "2026-08-20" })}
      />
    );

    expect(screen.queryByRole("button", { name: /Subtarefas/ })).not.toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
  });

  it("o painel é uma coluna por padrão e só vira grade a partir de `sm` (mobile em 1 coluna)", () => {
    render(<Harness projects={[makeProject()]} />);

    const projectLabel = screen.getByText("Projeto");
    const block3 = projectLabel.closest("div")?.parentElement;
    expect(block3?.className).toContain("grid-cols-1");
    expect(block3?.className).toContain("sm:grid-cols-3");

    // Feature 085: o Bloco 5 deixou de ser Tags | Link e virou uma coluna só — Tags ocupa a linha
    // inteira e os links viraram a seção colapsável logo abaixo.
    const tagsBlock = screen.getByText("Tags").closest("div")?.parentElement;
    expect(tagsBlock?.className).toContain("grid-cols-1");
    expect(tagsBlock?.className).not.toContain("sm:grid-cols-2");
  });

  it("cabe em uma página: o painel inteiro são poucos blocos de topo, não um campo por linha", () => {
    render(<Harness editing={makeTask({ id: "task-1" })} projects={[makeProject()]} />);

    const panelRoot = screen.getByLabelText(/^Título/).closest("div.gap-3") as HTMLElement;
    expect(panelRoot).not.toBeNull();

    // Título, Descrição (colapsada), Projeto+tempo, Instrumentos, Tags+Link, Subtarefas,
    // Registros: 7 blocos no modo edição — contra as 4 abas de antes, em que só a "Geral" já
    // tinha 6 linhas inteiras.
    expect(panelRoot.children.length).toBeLessThanOrEqual(7);

    // E os quatro "instrumentos" moram num bloco só, não em quatro.
    const instrumentRow = screen.getByText("Ícone").closest("div.flex.flex-wrap") as HTMLElement;
    expect(Array.from(panelRoot.children)).toContain(instrumentRow);
    for (const label of ["Prioridade", "Marco", "Tarefa pontual"]) {
      expect(instrumentRow).toContainElement(screen.getByText(label));
    }
  });

  it("bloco 3: Projeto ocupa 1/3 da linha e os operadores de tempo os outros 2/3", () => {
    render(<Harness projects={[makeProject()]} />);

    const projectColumn = screen.getByText("Projeto").parentElement as HTMLElement;
    expect(projectColumn.className).toContain("sm:col-span-1");

    const timeColumn = screen.getByText("Data limite").parentElement?.parentElement as HTMLElement;
    expect(timeColumn.className).toContain("sm:col-span-2");
    // Os "operadores de tempo" do pedido moram todos nesses 2/3.
    for (const label of ["Duração", "Data limite", "Início"]) {
      expect(timeColumn).toContainElement(screen.getByText(label));
    }
    expect(timeColumn).toContainElement(
      screen.getByRole("button", { name: /Repetição da tarefa/ })
    );
  });

  it("sem a prop `projects`, os operadores de tempo ocupam a linha inteira", () => {
    render(<Harness />);

    const timeColumn = screen.getByText("Data limite").parentElement?.parentElement as HTMLElement;
    expect(timeColumn.className).toContain("sm:col-span-3");
  });

  it("no mobile os controles densos mantêm área de toque ≥44px", () => {
    render(<Harness projects={[makeProject()]} />);

    // `min-h-[44px] sm:min-h-0`: confortável no toque, denso no desktop.
    const dueDateBox = screen.getByText("Data limite").nextElementSibling;
    expect(dueDateBox?.className).toContain("min-h-[44px]");
    expect(dueDateBox?.className).toContain("sm:min-h-0");
  });
});

describe("TaskFormFields — bloco 1, título", () => {
  it("é obrigatório e anunciado como tal", () => {
    render(<Harness />);

    const title = screen.getByLabelText(/^Título/);
    expect(title).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("Título").parentElement).toHaveTextContent("*");
  });

  it("recebe foco automático em modo criação, e não em edição", () => {
    const { unmount } = render(<Harness />);
    expect(screen.getByLabelText(/^Título/)).toHaveFocus();
    unmount();

    render(<Harness editing={makeTask()} initialForm={{ ...emptyTask(), title: "Tarefa" }} />);
    expect(screen.getByLabelText(/^Título/)).not.toHaveFocus();
  });

  it("digitar propaga para o formulário", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText(/^Título/), "Comprar pão");
    expect(currentForm().title).toBe("Comprar pão");
  });
});

describe("TaskFormFields — bloco 2, descrição colapsada", () => {
  it("o editor só aparece depois do toggle", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole("tab", { name: "Escrever" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Descrição/ }));

    expect(screen.getByRole("tab", { name: "Escrever" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Visualizar" })).toBeInTheDocument();
  });

  it("o texto digitado sobrevive a fechar e reabrir, e vira resumo no gatilho", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: /Descrição/ });
    await user.click(trigger);
    await user.type(
      screen.getByRole("textbox", { name: "Descrição" }),
      "Levar a lista da feira"
    );

    await user.click(trigger);
    expect(screen.queryByRole("tab", { name: "Escrever" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Levar a lista da feira/ })).toBeInTheDocument();
    expect(currentForm().description).toBe("Levar a lista da feira");

    await user.click(trigger);
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveTextContent(
      "Levar a lista da feira"
    );
  });

  it("descrição longa vira resumo truncado no gatilho", () => {
    const longText = "a".repeat(120);
    render(<Harness initialForm={{ ...emptyTask(), description: longText }} />);

    const trigger = screen.getByRole("button", { name: /Descrição/ });
    expect(trigger.textContent).toContain(`${"a".repeat(80)}…`);
    expect(trigger.textContent).not.toContain("a".repeat(81));
  });
});

describe("TaskFormFields — bloco 3, operadores de tempo", () => {
  it("Data limite, Horário e Duração vivem no mesmo bloco do Projeto", async () => {
    const user = userEvent.setup();
    render(<Harness projects={[makeProject()]} />);

    // Horário só existe depois de haver data — igual a antes.
    expect(screen.queryByLabelText(/Horário/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Data limite" }));
    await user.click(await screen.findByRole("button", { name: "Hoje" }));

    expect(screen.getByLabelText(/Horário/)).toBeInTheDocument();
    expect(currentForm().due_date).toBeTruthy();
  });

  it("o botão de recorrência mostra o estado atual em texto e abre o modal", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: /Repetição da tarefa — Não se repete/ });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Esta tarefa se repete?")).toBeInTheDocument();
  });

  it("o resumo do botão reflete a regra já salva, sem abrir o modal", () => {
    render(
      <Harness
        initialForm={{
          ...emptyTask(),
          due_date: "2026-08-19",
          recurrence_rule: { frequency: "weekly", interval: 1, weekdays: [1, 3], time: null },
        }}
      />
    );

    expect(
      screen.getByRole("button", { name: "Repetição da tarefa — A cada 1 semana, seg e qua" })
    ).toBeInTheDocument();
  });

  it("mudar a repetição no modal reflete no resumo do botão do painel", async () => {
    const user = userEvent.setup();
    render(<Harness initialForm={{ ...emptyTask(), due_date: "2026-08-19" }} />);

    await user.click(screen.getByRole("button", { name: /Repetição da tarefa/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Recorrência simples" }));
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("button", { name: "Repetição da tarefa — A cada 1 dia" })
    ).toBeInTheDocument();
    expect(currentForm().recurrence_rule?.frequency).toBe("daily");
  });

  it("subtarefa não tem série própria: sem botão de recorrência, sem Início e sem Duração", () => {
    render(
      <Harness
        editing={makeTask({ id: "sub-1", parent_task_id: "parent-1" })}
        initialForm={{ ...emptyTask(), parent_task_id: "parent-1" }}
      />
    );

    expect(screen.queryByRole("button", { name: /Repetição da tarefa/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Início")).not.toBeInTheDocument();
    expect(screen.queryByText("Duração")).not.toBeInTheDocument();
    expect(screen.getByText("Data limite")).toBeInTheDocument();
  });
});

/**
 * Feature 070 — o interruptor "Tarefa pontual (sem duração)" é o oposto da duração: ligar zera
 * `estimated_duration` e desabilita o controle. Depois da 080 os dois estão na mesma tela, sem
 * aba nenhuma entre eles.
 */
describe("TaskFormFields — tarefa pontual (feature 070)", () => {
  it("o interruptor está visível no painel, desligado por padrão", () => {
    render(<Harness />);

    expect(
      screen.getByRole("checkbox", { name: /Tarefa pontual \(sem duração\)/ })
    ).not.toBeChecked();
  });

  it("ligar zera a duração estimada e desabilita o controle de duração", async () => {
    const user = userEvent.setup();
    render(<Harness initialForm={{ ...emptyTask(), estimated_duration: 60 }} />);

    expect(screen.getByRole("button", { name: "1h" })).toBeEnabled();

    await user.click(screen.getByRole("checkbox", { name: /Tarefa pontual \(sem duração\)/ }));

    expect(screen.getByRole("checkbox", { name: /Tarefa pontual \(sem duração\)/ })).toBeChecked();
    expect(screen.queryByRole("button", { name: "1h" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pontual \(sem duração\)/ })).toBeDisabled();
    expect(currentForm().estimated_duration).toBeNull();
  });

  it("desligar devolve o campo de duração editável", async () => {
    const user = userEvent.setup();
    render(<Harness initialForm={{ ...emptyTask(), estimated_duration: 60, is_quick: true }} />);

    await user.click(screen.getByRole("checkbox", { name: /Tarefa pontual \(sem duração\)/ }));

    expect(
      screen.getByRole("checkbox", { name: /Tarefa pontual \(sem duração\)/ })
    ).not.toBeChecked();
    expect(screen.getByRole("button", { name: "1h" })).toBeEnabled();
  });

  it("tarefa já pontual abre com o interruptor ligado", () => {
    render(<Harness initialForm={{ ...emptyTask(), is_quick: true }} />);

    expect(screen.getByRole("checkbox", { name: /Tarefa pontual \(sem duração\)/ })).toBeChecked();
  });
});

describe("TaskFormFields — ícone (feature 073)", () => {
  it("editando uma ocorrência recorrente, o campo Ícone avisa da série e o upload vai para a biblioteca", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadIconAsset).mockResolvedValue({
      id: "icon-1",
      name: "Ícone",
      url: "https://cdn.example.com/origem.png",
    });
    render(<Harness editing={makeTask({ id: "ocorrencia-3", recurrence_origin_id: "origem" })} />);

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    expect(
      await screen.findByText("Vale para todas as ocorrências desta recorrência.")
    ).toBeInTheDocument();

    const file = new File(["conteudo"], "icone.png", { type: "image/png" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
    // Feature 086: o caminho no bucket é por ícone (`{userId}/library/{uuid}.{ext}`), então o id da
    // origem da série deixou de entrar no upload — o aviso da 073 é o que resta dela aqui.
    expect(uploadIconAsset).toHaveBeenCalledWith({ file });
  });

  it("editando uma tarefa avulsa, o campo Ícone não avisa nada e o upload funciona", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadIconAsset).mockResolvedValue({
      id: "icon-2",
      name: "Ícone",
      url: "https://cdn.example.com/task-1.png",
    });
    render(<Harness editing={makeTask({ id: "task-1" })} />);

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    expect(await screen.findByRole("button", { name: "Enviar imagem" })).toBeInTheDocument();
    expect(
      screen.queryByText("Vale para todas as ocorrências desta recorrência.")
    ).not.toBeInTheDocument();

    const file = new File(["conteudo"], "icone.png", { type: "image/png" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
    expect(uploadIconAsset).toHaveBeenCalledWith({ file });
  });
});

/**
 * Feature 085 — os links externos saíram do `form` e viraram uma lista própria. A validação por
 * linha (blur, duplicata, prévia) é testada onde ela mora, em `TaskExternalLinksField.test.tsx`;
 * aqui interessa só o que é do painel: a seção existe, abre, e o gatilho resume o que tem dentro.
 */
describe("TaskFormFields — seção Links externos (feature 085)", () => {
  it("a seção fica fechada por padrão e abre num clique, com a lista dentro", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: /Links externos/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Nenhum link ainda/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar link" })).toBeInTheDocument();
  });

  it("com um link só, o gatilho resume pelo rótulo dele; com vários, pela contagem", () => {
    const { unmount } = render(
      <Harness
        initialLinks={[
          { url: "https://github.com/owner/repo/issues/7", comment: null, position: 0 },
        ]}
      />
    );
    // Um link só: o rótulo que vai sair no chip diz mais do que "1 link".
    expect(screen.getByRole("button", { name: /Links externos/ })).toHaveTextContent(
      "owner/repo#7"
    );
    unmount();

    render(
      <Harness
        initialLinks={[
          { url: "https://a.com", comment: null, position: 0 },
          { url: "https://b.com", comment: null, position: 1 },
        ]}
      />
    );
    expect(screen.getByRole("button", { name: /Links externos/ })).toHaveTextContent("2 links");
  });

  it("o campo único de link externo não existe mais no painel", () => {
    render(<Harness />);
    expect(screen.queryByLabelText(/^Link externo$/)).not.toBeInTheDocument();
  });

  it("adicionar um link no painel não mexe no `form` da tarefa (lista à parte, como as subtarefas)", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /Links externos/ }));
    await user.click(screen.getByRole("button", { name: "Adicionar link" }));
    await user.type(screen.getByLabelText("URL do link 1 de 1"), "https://a.com");

    // O `form` da tarefa não tem mais campo de link nenhum (feature 085) — o que muda é a lista à
    // parte, que o call site grava depois.
    expect(Object.keys(currentForm())).not.toContain("external_url");
  });
});

describe("TaskFormFields — validação no blur", () => {

  it("prazo de subtarefa que passa do prazo da tarefa principal avisa no próprio campo", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", due_date: "2026-08-20" });
    render(
      <Harness
        editing={makeTask({ id: "sub-1", parent_task_id: "parent-1" })}
        tasks={[parent]}
        initialForm={{
          ...emptyTask(),
          parent_task_id: "parent-1",
          // Estado que só o `handleSave` pegava antes: a subtarefa já abre com prazo inválido.
          due_date: "2026-08-25",
        }}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "O prazo não pode passar de 20/08/2026, prazo da tarefa principal."
    );

    // Corrigir o campo tira o aviso na hora, sem passar pelo salvamento.
    await user.click(screen.getByRole("button", { name: /^Data limite/ }));
    await user.click(await screen.findByRole("button", { name: "Limpar" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(currentForm().due_date).toBeNull();
  });

  it("prazo de subtarefa dentro do limite não acusa nada", () => {
    const parent = makeTask({ id: "parent-1", due_date: "2026-08-20" });
    render(
      <Harness
        editing={makeTask({ id: "sub-1", parent_task_id: "parent-1" })}
        tasks={[parent]}
        initialForm={{ ...emptyTask(), parent_task_id: "parent-1", due_date: "2026-08-19" }}
      />
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("TaskFormFields — teclado e nomes acessíveis", () => {
  it("o painel é percorrido por Tab na ordem visual", async () => {
    const user = userEvent.setup();
    render(<Harness projects={[makeProject()]} />);

    // O título já começa focado em modo criação.
    expect(screen.getByLabelText(/^Título/)).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /Descrição/ })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Sem projeto" })).toHaveFocus();
  });

  it("os colapsáveis abrem pelo teclado", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: /Descrição/ });
    trigger.focus();
    await user.keyboard("{Enter}");

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tab", { name: "Escrever" })).toBeInTheDocument();
  });

  it("o modal de recorrência abre e fecha pelo teclado, e o botão continua sendo o caminho de volta", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: /Repetição da tarefa/ });
    // O gatilho se anuncia como quem abre um dialog (a configuração não sumiu, mudou de lugar).
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");

    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Nota: a devolução de foco é do `FocusScope` do Radix e não é observável neste jsdom (ver
    // `## Notas` da 080). O que dá para garantir é que o gatilho continua lá, focável e operante.
    const backToTrigger = screen.getByRole("button", { name: /Repetição da tarefa/ });
    backToTrigger.focus();
    expect(backToTrigger).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("todo controle do painel tem nome acessível", () => {
    render(<Harness projects={[makeProject()]} />);

    const nameless = [
      ...screen.getAllByRole("button"),
      ...screen.getAllByRole("textbox"),
      ...screen.getAllByRole("checkbox"),
      ...screen.queryAllByRole("combobox"),
    ].filter((control) => accessibleName(control).length === 0);

    expect(nameless.map((el) => el.outerHTML)).toEqual([]);
  });
});

describe("TaskFormFields — atalhos de prazo (feature 083)", () => {
  const todayIso = () => formatLocalIsoDate(new Date());
  const shortcut = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label} —`) });

  it("no form de criação, os três atalhos aparecem **antes** do botão de calendário", () => {
    render(<Harness projects={[makeProject()]} />);

    const group = screen.getByRole("group", { name: "Atalhos de prazo" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Hoje", "Esta semana", "Este mês"]);

    const calendar = screen.getByRole("button", { name: "Data limite" });
    // `compareDocumentPosition` = "o grupo vem antes do calendário na ordem do documento".
    expect(
      group.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("clicar 'Este mês' põe o último dia do mês no prazo e o calendário passa a exibir a data", async () => {
    const user = userEvent.setup();
    render(<Harness projects={[makeProject()]} />);

    const expected = dueDateForShortcut("this_month", todayIso());
    await user.click(shortcut("Este mês"));

    expect(currentForm().due_date).toBe(expected);
    expect(
      screen.getByRole("button", { name: `Data limite — ${formatDateBR(expected)}` })
    ).toHaveTextContent(formatDateBR(expected));
  });

  it("clicar 'Hoje' põe a data de hoje no prazo", async () => {
    const user = userEvent.setup();
    render(<Harness projects={[makeProject()]} />);

    await user.click(shortcut("Hoje"));
    expect(currentForm().due_date).toBe(todayIso());
  });

  it("o atalho preserva horário, duração e 'tarefa pontual' — muda só o dia", async () => {
    const user = userEvent.setup();
    const initialForm: TaskCreateRequest = {
      ...emptyTask(),
      title: "Com horário e duração",
      due_date: "2026-01-15",
      due_time: "09:30",
      estimated_duration: 60,
      is_quick: true,
    };
    render(<Harness projects={[makeProject()]} initialForm={initialForm} />);

    const before = currentForm();
    await user.click(shortcut("Esta semana"));
    const after = currentForm();

    expect(after.due_date).toBe(dueDateForShortcut("this_week", todayIso()));
    expect(after.due_time).toBe("09:30");
    expect(after.estimated_duration).toBe(60);
    expect(after.is_quick).toBe(true);
    expect({ ...after, due_date: null }).toEqual({ ...before, due_date: null });
  });

  it("com 'Recorrência simples' ligada, o atalho reconstrói a recurrence_rule (não a dessincroniza)", async () => {
    const user = userEvent.setup();
    render(<Harness projects={[makeProject()]} initialForm={{ ...emptyTask(), due_time: "09:30" }} />);

    await user.click(screen.getByRole("button", { name: /Repetição da tarefa/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Recorrência simples" }));
    await user.keyboard("{Escape}");

    await user.click(shortcut("Este mês"));

    const after = currentForm();
    expect(after.due_date).toBe(dueDateForShortcut("this_month", todayIso()));
    expect(after.recurrence_rule).toEqual({ frequency: "daily", interval: 1, time: "09:30" });
  });

  it("sem modo simples, o atalho deixa recurrence_rule em null", async () => {
    const user = userEvent.setup();
    render(<Harness projects={[makeProject()]} />);

    await user.click(shortcut("Hoje"));
    expect(currentForm().recurrence_rule).toBeNull();
  });

  it("em subtarefa, o atalho que passa do prazo da mãe fica inerte e o que cabe funciona", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Mãe", due_date: todayIso() });
    render(
      <Harness
        projects={[makeProject()]}
        tasks={[parent]}
        initialForm={{ ...emptyTask(), parent_task_id: "parent-1" }}
      />
    );

    const esteMes = shortcut("Este mês");
    if (dueDateForShortcut("this_month", todayIso()) > todayIso()) {
      expect(esteMes).toHaveAttribute("aria-disabled", "true");
      await user.click(esteMes);
      expect(currentForm().due_date).toBeNull();
    }

    await user.click(shortcut("Hoje"));
    expect(currentForm().due_date).toBe(todayIso());
  });
  it("pedido literal: os atalhos não substituem o calendário — ele continua abrindo para escolher uma data específica", async () => {
    const user = userEvent.setup();
    render(<Harness projects={[makeProject()]} />);

    // 1) Os três atalhos estão à vista, sem clique nenhum, na ordem do pedido.
    const group = screen.getByRole("group", { name: "Atalhos de prazo" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Hoje",
      "Esta semana",
      "Este mês",
    ]);

    // 2) "e aí sim o botão do calendário": abre e permite escolher um dia qualquer.
    await user.click(screen.getByRole("button", { name: "Data limite" }));
    const grid = await screen.findByRole("grid");
    const day15 = within(grid)
      .getAllByRole("button")
      .find((b) => b.textContent?.trim() === "15") as HTMLElement;
    await user.click(day15);

    expect(currentForm().due_date?.slice(-2)).toBe("15");
    // E a escolha manual não deixa nenhum atalho pressionado por engano.
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });
});

/**
 * Feature 106 — "Referenciada em" dentro do formulário. O comportamento da seção em si está em
 * `TaskMentionsSection.test.tsx`; aqui se prova só o encaixe: ela existe em tarefa que já existe e
 * **não** existe em "Nova tarefa", onde não há id para procurar.
 */
describe("TaskFormFields — Referenciada em (feature 106)", () => {
  // Id de verdade: o parser da 103 só reconhece a marca com uuid, então "task-1" nunca casaria.
  const TASK_REF_ID = "11111111-2222-4333-8444-555555555555";

  function makeNote(): Note {
    return {
      id: "note-9",
      project_id: null,
      title: "Reforma da sala",
      content: `Depende de [subir painel](orbyva-task:${TASK_REF_ID})`,
      kind: "markdown",
      canvas_data: null,
    };
  }

  beforeEach(() => {
    vi.mocked(fetchNotesMentioningTask).mockClear().mockResolvedValue([]);
    vi.mocked(fetchTasksMentioningTask).mockClear().mockResolvedValue([]);
  });

  it("em tarefa que já existe, lista quem cita a tarefa", async () => {
    vi.mocked(fetchNotesMentioningTask).mockResolvedValue([makeNote()]);

    render(<Harness editing={makeTask({ id: TASK_REF_ID })} projects={[makeProject()]} />);

    expect(await screen.findByText("Referenciada em")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reforma da sala" })).toHaveAttribute(
      "href",
      "/notes/note-9"
    );
    expect(fetchNotesMentioningTask).toHaveBeenCalledWith(TASK_REF_ID);
    expect(fetchTasksMentioningTask).toHaveBeenCalledWith(TASK_REF_ID);
  });

  it("em 'Nova tarefa' a seção não aparece e nem consulta nada (não há id)", async () => {
    render(<Harness projects={[makeProject()]} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Descrição/ })).toBeInTheDocument()
    );
    expect(screen.queryByText("Referenciada em")).not.toBeInTheDocument();
    expect(fetchNotesMentioningTask).not.toHaveBeenCalled();
    expect(fetchTasksMentioningTask).not.toHaveBeenCalled();
  });

  it("tarefa que ninguém cita não ganha seção nenhuma no formulário", async () => {
    render(<Harness editing={makeTask({ id: TASK_REF_ID })} projects={[makeProject()]} />);

    await waitFor(() => expect(fetchNotesMentioningTask).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText("Referenciada em")).not.toBeInTheDocument()
    );
  });
});
