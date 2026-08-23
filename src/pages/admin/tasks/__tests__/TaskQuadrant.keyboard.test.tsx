import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TaskQuadrant, buildQuadrantAnnouncements } from "@/pages/admin/tasks/TaskQuadrant";
import type { Task } from "@/types/tasks";

/**
 * Feature 082 — "acessibilidade não é acabamento": a reordenação precisa funcionar por teclado
 * (Espaço pega, setas movem, Espaço solta) e anunciar o resultado.
 *
 * Este arquivo usa o `@dnd-kit` **de verdade** (nada de duplo), incluindo o `KeyboardSensor`. O
 * único remendo é geométrico: em jsdom todo `getBoundingClientRect` devolve zero, e sem retângulos
 * o `sortableKeyboardCoordinates` não tem para onde mover. O stub abaixo dá a cada linha do painel
 * a altura que ela teria no navegador — é a única coisa que o jsdom não entrega, e o resto do
 * caminho (sensor, colisão, `onDragEnd`, renumeração) é o código real.
 */

const TODAY = "2026-08-20";
const ROW_HEIGHT = 24;
const PANEL_WIDTH = 300;

function makeTask(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    project_id: "proj-1",
    parent_task_id: null,
    recurrence_origin_id: null,
    status: "todo",
    tag_ids: [],
    due_date: null,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    sort_order: 0,
    ...overrides,
  };
}

const BAND: Task[] = [
  makeTask({ id: "t-a", title: "Assinar contrato", priority: "high" }),
  makeTask({ id: "t-b", title: "Ligar para o cliente", priority: "high" }),
  makeTask({ id: "t-c", title: "Revisar orçamento", priority: "high" }),
];

function makeRect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    right: PANEL_WIDTH,
    bottom: top + height,
    width: PANEL_WIDTH,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * Empilha as linhas verticalmente na ordem em que estão no DOM: cada `button` ocupa `ROW_HEIGHT`.
 * Todo o resto (painéis, wrappers, `body`) fica com retângulo zerado de propósito — é assim que o
 * jsdom já se comporta, e dar altura a esses elementos faz o `closestCenter` do @dnd-kit
 * considerar os ancestrais roláveis e escolher alvos errados.
 */
function stubLayout() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    const rows = Array.from(document.querySelectorAll("button"));
    const index = rows.indexOf(this as HTMLButtonElement);
    return index >= 0 ? makeRect(index * ROW_HEIGHT, ROW_HEIGHT) : makeRect(0, 0);
  });
}

function renderBand(tasks: Task[] = BAND) {
  const onReorder = vi.fn();
  const onPriorityChange = vi.fn();
  const onSelectTask = vi.fn();
  render(
    <TaskQuadrant
      tasks={tasks}
      todayIso={TODAY}
      onSelectTask={onSelectTask}
      onReorder={onReorder}
      onPriorityChange={onPriorityChange}
    />
  );
  stubLayout();
  return { onReorder, onPriorityChange, onSelectTask };
}

function row(title: string): HTMLElement {
  const found = Array.from(document.querySelectorAll("button")).find(
    (button) => button.querySelector("span")?.textContent?.trim() === title
  );
  if (!found) throw new Error(`linha não encontrada: ${title}`);
  return found as HTMLElement;
}

/** O `KeyboardSensor` registra o listener de `keydown` do documento dentro de um `setTimeout`. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function liveRegionText(): string {
  return Array.from(document.querySelectorAll("[role='status']"))
    .map((node) => node.textContent?.trim() ?? "")
    .join(" ");
}

describe("TaskQuadrant — reordenar por teclado (feature 082)", () => {
  it("pegar, mover e soltar sem mouse renumera a faixa", async () => {
    const { onReorder } = renderBand();
    const target = row("Assinar contrato");
    target.focus();

    // 1) pegar. A região viva já está falando da tarefa pega — o texto exato de cada momento tem
    // teste próprio em `buildQuadrantAnnouncements` (o `@dnd-kit` substitui o anúncio de "pegou"
    // pelo de "sobre o quê" no mesmo instante, então o DOM só guarda o último).
    fireEvent.keyDown(target, { code: "Space", key: " " });
    expect(liveRegionText()).toContain("Assinar contrato");
    await flush();

    // 2) mover uma posição para baixo
    await act(async () => {
      fireEvent.keyDown(document, { code: "ArrowDown", key: "ArrowDown" });
    });
    await flush();

    // 3) soltar
    await act(async () => {
      fireEvent.keyDown(document, { code: "Space", key: " " });
    });
    await flush();

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith([
      { id: "t-b", sort_order: 0 },
      { id: "t-a", sort_order: 1 },
      { id: "t-c", sort_order: 2 },
    ]);
    expect(liveRegionText()).toContain("solta na posição 2 de 3 da faixa Alta");
  });

  it("Esc cancela o arraste sem escrever nada", async () => {
    const { onReorder } = renderBand();
    const target = row("Assinar contrato");
    target.focus();

    fireEvent.keyDown(target, { code: "Space", key: " " });
    await flush();
    await act(async () => {
      fireEvent.keyDown(document, { code: "ArrowDown", key: "ArrowDown" });
    });
    await flush();
    await act(async () => {
      fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
    });
    await flush();

    expect(onReorder).not.toHaveBeenCalled();
    expect(liveRegionText()).toContain("cancelado");
  });

  it("Enter continua abrindo a tarefa — só Espaço pega a linha", async () => {
    const { onSelectTask, onReorder } = renderBand();
    const target = row("Assinar contrato");
    target.focus();

    // `Enter` num <button> nativo dispara o click; o KeyboardSensor foi configurado para ignorá-lo.
    fireEvent.keyDown(target, { code: "Enter", key: "Enter" });
    fireEvent.click(target);
    await flush();

    expect(onReorder).not.toHaveBeenCalled();
    expect(onSelectTask).toHaveBeenCalledTimes(1);
    expect(onSelectTask.mock.calls[0][0]).toMatchObject({ id: "t-a" });
  });

  it("as linhas do painel «Por prioridade» são alças de arraste; as do «Por prazo» não", () => {
    renderBand();
    const priorityRows = (
      screen.getByText("Por prioridade").closest("div") as HTMLElement
    ).querySelectorAll("button");
    const dueRows = (
      screen.getByText("Por prazo").closest("div") as HTMLElement
    ).querySelectorAll("button");

    expect(priorityRows).toHaveLength(3);
    for (const button of Array.from(priorityRows)) {
      expect(button.getAttribute("aria-roledescription")).toBe("sortable");
    }
    expect(dueRows).toHaveLength(3);
    for (const button of Array.from(dueRows)) {
      expect(button.getAttribute("aria-roledescription")).toBeNull();
    }
  });
});

describe("buildQuadrantAnnouncements", () => {
  const byPriority = {
    high: [BAND[0], BAND[1]],
    medium: [],
    low: [makeTask({ id: "t-low", title: "Arquivar notas", priority: "low" })],
    none: [],
  };
  const announcements = buildQuadrantAnnouncements(byPriority);

  it("anuncia a tarefa pega, com a instrução de como mover", () => {
    expect(
      announcements.onDragStart({ active: { id: "t-a" } } as never)
    ).toBe(
      "Pegou Assinar contrato. Use as setas para mover, Espaço para soltar e Esc para cancelar."
    );
  });

  it("anuncia a posição dentro da faixa ao passar por cima de outra linha", () => {
    expect(
      announcements.onDragOver?.({ active: { id: "t-a" }, over: { id: "t-b" } } as never)
    ).toBe("Assinar contrato na posição 2 de 2 da faixa Alta.");
  });

  it("uma tarefa que vem de outra faixa conta como uma a mais no total", () => {
    expect(
      announcements.onDragEnd?.({ active: { id: "t-low" }, over: { id: "t-a" } } as never)
    ).toBe("Arquivar notas solta na posição 1 de 3 da faixa Alta.");
  });

  it("sem alvo, anuncia que a tarefa voltou para o lugar", () => {
    expect(announcements.onDragEnd?.({ active: { id: "t-a" }, over: null } as never)).toBe(
      "Assinar contrato voltou para o lugar de origem."
    );
  });

  it("cancelar diz explicitamente que a ordem não mudou", () => {
    expect(announcements.onDragCancel?.({ active: { id: "t-a" } } as never)).toBe(
      "Arraste de Assinar contrato cancelado — a ordem não mudou."
    );
  });
});
