import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickTaskDot } from "@/pages/admin/tasks/QuickTaskDot";
import type { Task } from "@/types/tasks";

/**
 * Feature 070 — a bolinha em si. Sem Chrome, é este teste que prova o pedido literal do prompt
 * ("eu consiga marcar a bolinha, ela fica verde"): o clique alterna, o verde só aparece quando a
 * tarefa está concluída, o ícone da tarefa (feature 035) é o desenho da bolinha, e a ocorrência
 * virtual não é clicável.
 */

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Losartana",
    status: "todo",
    tag_ids: [],
    due_date: "2026-08-19",
    due_time: "08:00",
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    is_quick: true,
    ...overrides,
  };
}

/** O desenho da bolinha é o `<span>` dentro do botão (o botão é só o alvo de toque de 24px). */
function dotOf(button: HTMLElement): HTMLElement {
  const span = button.querySelector("span");
  if (!span) throw new Error("desenho da bolinha não encontrado");
  return span as HTMLElement;
}

describe("QuickTaskDot — rótulos e estado", () => {
  it("pendente: rótulo de concluir, com horário, e aria-pressed false", () => {
    render(<QuickTaskDot task={makeTask()} onToggle={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Concluir «Losartana» às 08:00" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("title", "08:00 · Losartana");
  });

  it("concluída: rótulo de reabrir e aria-pressed true", () => {
    render(<QuickTaskDot task={makeTask({ status: "done" })} onToggle={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Reabrir «Losartana» às 08:00" });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("tolera o HH:mm:ss do Postgres e a pontual sem horário", () => {
    const { unmount } = render(
      <QuickTaskDot task={makeTask({ due_time: "08:00:00" })} onToggle={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Concluir «Losartana» às 08:00" })).toBeInTheDocument();
    unmount();

    render(
      <QuickTaskDot
        task={makeTask({ due_time: null, title: "Trocar lençol" })}
        onToggle={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: "Concluir «Trocar lençol»" });
    expect(button).toHaveAttribute("title", "Trocar lençol");
  });

  it("verde só quando concluída", () => {
    const { unmount } = render(<QuickTaskDot task={makeTask()} onToggle={vi.fn()} />);
    expect(dotOf(screen.getByRole("button")).className).not.toContain("bg-green-500");
    unmount();

    render(<QuickTaskDot task={makeTask({ status: "done" })} onToggle={vi.fn()} />);
    expect(dotOf(screen.getByRole("button")).className).toContain("bg-green-500");
  });
});

describe("QuickTaskDot — ícone da tarefa (feature 035)", () => {
  it("ícone customizado (icon_url) vira o desenho da bolinha", () => {
    render(
      <QuickTaskDot
        task={makeTask({ icon_url: "https://cdn.example/pill.png" })}
        onToggle={vi.fn()}
      />
    );

    const img = dotOf(screen.getByRole("button")).querySelector("img");
    expect(img).toHaveAttribute("src", "https://cdn.example/pill.png");
  });

  it("ícone preset (icon_key) também aparece", () => {
    render(<QuickTaskDot task={makeTask({ icon_key: "bell" })} onToggle={vi.fn()} />);

    expect(screen.getByLabelText("Lembrete")).toBeInTheDocument();
  });

  it("sem ícone, a bolinha é só o círculo (nenhuma imagem dentro)", () => {
    render(<QuickTaskDot task={makeTask()} onToggle={vi.fn()} />);

    expect(dotOf(screen.getByRole("button")).querySelector("img")).toBeNull();
  });
});

/**
 * Feature 071 — previsto × tomado na própria bolinha. O prompt diz o porquê: "eu devo ser capaz de
 * ver a hora em que foi tomado, se está de acordo com a hora que o evento/tarefa é criado, porque é
 * importante que eu mantenha tomando no horário certo". A tolerância é a de `isDoseLate` (60 min).
 */
function makeDose(overrides: Partial<Task> = {}): Task {
  return makeTask({
    icon_key: "pill",
    is_medication: true,
    medication_id: "med-1",
    ...overrides,
  });
}

/** ISO local do mesmo dia da dose (`2026-08-19`), no horário pedido. */
function completedAt(hour: number, minute: number): string {
  return new Date(2026, 7, 19, hour, minute).toISOString();
}

describe("QuickTaskDot — dose de medicação (feature 071)", () => {
  it("dose pendente anuncia o horário previsto", () => {
    render(<QuickTaskDot task={makeDose()} onToggle={vi.fn()} />);

    const button = screen.getByRole("button", {
      name: "Concluir «Losartana» às 08:00 — Previsto 08:00",
    });
    expect(button).toHaveAttribute("title", "Losartana · Previsto 08:00");
    // Pendente não é atraso: sem anel.
    expect(dotOf(button).className).not.toContain("ring-amber-500");
  });

  it("dose tomada no horário mostra previsto e tomado, sem anel", () => {
    render(
      <QuickTaskDot
        task={makeDose({ status: "done", completed_at: completedAt(8, 5) })}
        onToggle={vi.fn()}
      />
    );

    const button = screen.getByRole("button", {
      name: "Reabrir «Losartana» às 08:00 — Previsto 08:00 · Tomado 08:05",
    });
    expect(button).toHaveAttribute("title", "Losartana · Previsto 08:00 · Tomado 08:05");
    expect(dotOf(button).className).toContain("bg-green-500");
    expect(dotOf(button).className).not.toContain("ring-amber-500");
  });

  it("dose tomada 90 min depois acusa atraso e ganha o anel âmbar sobre o verde", () => {
    render(
      <QuickTaskDot
        task={makeDose({ status: "done", completed_at: completedAt(9, 30) })}
        onToggle={vi.fn()}
      />
    );

    const button = screen.getByRole("button", {
      name: "Reabrir «Losartana» às 08:00 — Previsto 08:00 · Tomado 09:30 (atrasada)",
    });
    // Verde continua querendo dizer "tomou"; o anel é o "fora do horário".
    expect(dotOf(button).className).toContain("bg-green-500");
    expect(dotOf(button).className).toContain("ring-amber-500");
  });

  it("dentro da tolerância de 60 min ainda não é atraso", () => {
    render(
      <QuickTaskDot
        task={makeDose({ status: "done", completed_at: completedAt(8, 59) })}
        onToggle={vi.fn()}
      />
    );

    const button = screen.getByRole("button", { name: /Tomado 08:59$/ });
    expect(button.getAttribute("aria-label")).not.toContain("(atrasada)");
    expect(dotOf(button).className).not.toContain("ring-amber-500");
  });

  it("tarefa pontual comum não ganha previsto/tomado nem anel", () => {
    render(
      <QuickTaskDot
        task={makeTask({ title: "Trocar escova", status: "done", completed_at: completedAt(23, 0) })}
        onToggle={vi.fn()}
      />
    );

    const button = screen.getByRole("button", { name: "Reabrir «Trocar escova» às 08:00" });
    expect(button).toHaveAttribute("title", "08:00 · Trocar escova");
    expect(dotOf(button).className).not.toContain("ring-amber-500");
  });

  it("dose futura (virtual) diz o previsto e continua não clicável", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <QuickTaskDot
        task={makeDose({ id: "virtual:medication:med-1:2026-08-22:08:00" })}
        onToggle={onToggle}
      />
    );

    const button = screen.getByRole("button", {
      name: "Losartana às 08:00 — próxima ocorrência, ainda não criada",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "title",
      "Próxima ocorrência — ainda não criada, aparece automaticamente nesse dia (Previsto 08:00)"
    );
    expect(dotOf(button).className).toContain("border-dashed");

    await user.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("QuickTaskDot — interação", () => {
  it("clicar chama onToggle com a tarefa", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const task = makeTask();
    render(<QuickTaskDot task={task} onToggle={onToggle} />);

    await user.click(screen.getByRole("button"));

    expect(onToggle).toHaveBeenCalledWith(task);
  });

  it("Enter e Espaço acionam a bolinha pelo teclado", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<QuickTaskDot task={makeTask()} onToggle={onToggle} />);

    await user.tab();
    expect(screen.getByRole("button")).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onToggle).toHaveBeenCalledTimes(1);

    await user.keyboard(" ");
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("ocorrência virtual não dispara onToggle e explica o porquê no title", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <QuickTaskDot
        task={makeTask({ id: "virtual:origem-1:2026-08-26" })}
        onToggle={onToggle}
      />
    );

    const button = screen.getByRole("button", {
      name: "Losartana às 08:00 — próxima ocorrência, ainda não criada",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "title",
      "Próxima ocorrência — ainda não criada, aparece automaticamente nesse dia"
    );
    expect(dotOf(button).className).toContain("border-dashed");

    await user.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
