import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PointTaskDots } from "@/pages/admin/tasks/PointTaskDots";
import type { Task } from "@/types/tasks";

/**
 * Feature 072 — a fileira de bolinhas das tarefas pontuais (remédio, trocar lençol, trocar
 * escova). A bolinha **é** o botão de concluir: um clique e ela fica verde. Sem navegador na
 * verificação, é este arquivo que prova os quatro estados, o overflow e o teclado.
 */

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Remédio",
    status: "todo",
    tag_ids: [],
    due_date: "2026-08-17",
    due_time: "08:00",
    estimated_duration: 0,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

describe("PointTaskDots — estados da bolinha", () => {
  it("pendente: bolinha vazada, sem verde e sem check, com aria-pressed false", () => {
    render(<PointTaskDots items={[makeTask()]} onToggle={vi.fn()} />);

    const dot = screen.getByRole("button", { name: "Concluir: Remédio (08:00)" });
    expect(dot).toHaveAttribute("aria-pressed", "false");
    expect(dot).not.toBeDisabled();
    expect(dot.className).toContain("border-muted-foreground/40");
    expect(dot.className).not.toContain("bg-success");
    expect(dot.querySelector("svg")).toBeNull();
    expect(dot).toHaveAttribute("title", "Remédio (08:00)");
  });

  it("concluída: bolinha verde (--success) com Check e aria-pressed true", () => {
    render(<PointTaskDots items={[makeTask({ status: "done" })]} onToggle={vi.fn()} />);

    const dot = screen.getByRole("button", { name: "Reabrir: Remédio (08:00)" });
    expect(dot).toHaveAttribute("aria-pressed", "true");
    expect(dot.className).toContain("bg-success");
    expect(dot.className).toContain("border-success");
    expect(dot.querySelector("svg")).not.toBeNull();
  });

  it("ocorrência virtual: desabilitada, opacity-60 e tooltip explicando que ainda não existe", async () => {
    const onToggle = vi.fn();
    render(
      <PointTaskDots
        items={[makeTask({ id: "virtual:origin-1:2026-08-20", title: "Trocar escova" })]}
        onToggle={onToggle}
      />
    );

    const dot = screen.getByRole("button", { name: "Trocar escova (08:00)" });
    expect(dot).toBeDisabled();
    expect(dot.className).toContain("opacity-60");
    expect(dot).toHaveAttribute("title", expect.stringContaining("ocorrência futura"));
    expect(dot).not.toHaveAttribute("aria-pressed");

    await userEvent.click(dot);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("sem onToggle (Gantt): somente leitura, desabilitada e sem hover", () => {
    render(<PointTaskDots items={[makeTask({ status: "done" })]} />);

    const dot = screen.getByRole("button", { name: "Remédio (08:00)" });
    expect(dot).toBeDisabled();
    expect(dot.className).not.toContain("hover:border-primary");
    // Continua mostrando o estado concluído — leitura, não ausência de informação.
    expect(dot.className).toContain("bg-success");
  });

  it("pontual sem horário (trocar lençol) não inventa hora no rótulo", () => {
    render(<PointTaskDots items={[makeTask({ title: "Trocar lençol", due_time: null })]} onToggle={vi.fn()} />);

    const dot = screen.getByRole("button", { name: "Concluir: Trocar lençol" });
    expect(dot).toHaveAttribute("title", "Trocar lençol");
  });

  it("chamar onToggle entrega a própria tarefa clicada", async () => {
    const onToggle = vi.fn();
    const alvo = makeTask({ id: "t-2", title: "Vitamina" });
    render(<PointTaskDots items={[makeTask(), alvo]} onToggle={onToggle} />);

    await userEvent.click(screen.getByRole("button", { name: "Concluir: Vitamina (08:00)" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(alvo);
  });
});

describe("PointTaskDots — overflow", () => {
  const doze = Array.from({ length: 12 }, (_, i) =>
    makeTask({ id: `t-${i}`, title: `Pontual ${i}`, due_time: "08:00" })
  );

  it("com 12 itens mostra 8 bolinhas e o rótulo +4", () => {
    render(<PointTaskDots items={doze} onToggle={vi.fn()} onOverflowClick={vi.fn()} />);

    const group = screen.getByRole("group", { name: "Tarefas pontuais" });
    const dots = screen.getAllByRole("button", { name: /^Concluir: Pontual/ });
    expect(dots).toHaveLength(8);
    expect(within(group).getByText("+4")).toBeInTheDocument();
  });

  it("clicar no +N dispara onOverflowClick", async () => {
    const onOverflowClick = vi.fn();
    render(<PointTaskDots items={doze} onToggle={vi.fn()} onOverflowClick={onOverflowClick} />);

    await userEvent.click(screen.getByText("+4"));
    expect(onOverflowClick).toHaveBeenCalledTimes(1);
  });

  it("com 8 itens não mostra +N", () => {
    render(<PointTaskDots items={doze.slice(0, 8)} onToggle={vi.fn()} onOverflowClick={vi.fn()} />);
    expect(screen.queryByText(/^\+\d/)).toBeNull();
  });

  it("sem overflow, o rótulo final continua existindo como 'N pontuais' — é o caminho para abrir a tarefa", async () => {
    const onOverflowClick = vi.fn();
    render(<PointTaskDots items={doze.slice(0, 3)} onToggle={vi.fn()} onOverflowClick={onOverflowClick} />);

    await userEvent.click(screen.getByText("3 pontuais"));
    expect(onOverflowClick).toHaveBeenCalledTimes(1);
  });

  it("sem onOverflowClick não existe rótulo nenhum quando tudo cabe (Gantt, grade de horas)", () => {
    render(<PointTaskDots items={doze.slice(0, 3)} onToggle={vi.fn()} />);
    expect(screen.queryByText(/pontuais$/)).toBeNull();
    expect(screen.queryByText(/^\+\d/)).toBeNull();
  });
});

/** Harness com estado: a fileira é controlada pelo pai (a Agenda), então o toggle só se prova de
 * verdade com alguém re-renderizando a lista depois do clique. */
function StatefulDots({ initial }: { initial: Task[] }) {
  const [items, setItems] = useState(initial);
  return (
    <PointTaskDots
      items={items}
      onToggle={(task) =>
        setItems((prev) =>
          prev.map((t) =>
            t.id === task.id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t
          )
        )
      }
    />
  );
}

describe("PointTaskDots — teclado e foco", () => {
  it("Enter e Espaço alternam a bolinha", async () => {
    render(<StatefulDots initial={[makeTask({ title: "Vitamina" })]} />);

    const pendente = screen.getByRole("button", { name: "Concluir: Vitamina (08:00)" });
    pendente.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Reabrir: Vitamina (08:00)" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await userEvent.keyboard(" ");
    expect(screen.getByRole("button", { name: "Concluir: Vitamina (08:00)" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("Tab percorre as bolinhas na ordem em que a fileira as recebeu (ordem do horário)", async () => {
    render(
      <PointTaskDots
        items={[
          makeTask({ id: "a", title: "Primeiro", due_time: "07:00" }),
          makeTask({ id: "b", title: "Segundo", due_time: "08:00" }),
          makeTask({ id: "c", title: "Terceiro", due_time: "09:00" }),
        ]}
        onToggle={vi.fn()}
      />
    );

    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Concluir: Primeiro (07:00)" }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Concluir: Segundo (08:00)" }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Concluir: Terceiro (09:00)" }));
  });

  it("o foco não é perdido depois do toggle, mesmo com a lista re-renderizando", async () => {
    render(
      <StatefulDots
        initial={[
          makeTask({ id: "a", title: "Primeiro", due_time: "07:00" }),
          makeTask({ id: "b", title: "Segundo", due_time: "08:00" }),
        ]}
      />
    );

    const segundo = screen.getByRole("button", { name: "Concluir: Segundo (08:00)" });
    segundo.focus();
    await userEvent.keyboard("{Enter}");

    const depois = screen.getByRole("button", { name: "Reabrir: Segundo (08:00)" });
    expect(document.activeElement).toBe(depois);
  });
});
