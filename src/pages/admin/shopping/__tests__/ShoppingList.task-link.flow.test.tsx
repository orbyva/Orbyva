import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ShoppingList from "@/pages/admin/shopping/ShoppingList";
import { deleteTask, updateTask } from "@/api/tasks/tasks";

/**
 * Fluxo fim a fim do vínculo item ↔ tarefa (feature 051) contra um backend falso de Supabase em
 * memória — a camada de API real roda de verdade, só o cliente é substituído. O falso imita as
 * regras de integridade que a migration `20260816140000_task_shopping_item_link.sql` provou no
 * Postgres descartável: excluir o item **zera** `task.linked_shopping_item_id` sem apagar a
 * tarefa (`on delete set null`), e excluir a categoria cascateia nos itens.
 *
 * Substitui a "verificação manual fim a fim" que a tarefa original pedia (navegador está fora
 * deste fluxo), no mesmo padrão de `ShoppingList.flow.test.tsx` da feature 050.
 */

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({
  db: {
    tables: {} as Record<string, Row[]>,
    seq: 0,
  },
}));

function rowsOf(table: string): Row[] {
  db.tables[table] ??= [];
  return db.tables[table];
}

function makeBuilder(table: string) {
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row[] = [];
  const filters: Array<[string, unknown]> = [];
  let inFilter: [string, unknown[]] | null = null;

  function matches(row: Row): boolean {
    if (!filters.every(([column, value]) => row[column] === value)) return false;
    if (inFilter && !inFilter[1].includes(row[inFilter[0]])) return false;
    return true;
  }

  /** `on delete` do schema: item apagado zera o vínculo da tarefa; categoria cascateia nos itens. */
  function applyReferentialActions(removed: Row[], from: string) {
    if (from === "shopping_item") {
      for (const item of removed) {
        for (const task of rowsOf("task")) {
          if (task.linked_shopping_item_id === item.id) {
            task.linked_shopping_item_id = null;
          }
        }
      }
      return;
    }
    if (from === "shopping_category") {
      for (const category of removed) {
        const cascaded = rowsOf("shopping_item").filter(
          (item) => item.shopping_category_id === category.id
        );
        db.tables.shopping_item = rowsOf("shopping_item").filter(
          (item) => item.shopping_category_id !== category.id
        );
        applyReferentialActions(cascaded, "shopping_item");
      }
    }
  }

  function run(): { data: unknown; error: null } {
    if (op === "insert") {
      const inserted = payload.map((row) => ({
        id: row.id ?? `${table}-${++db.seq}`,
        ...row,
      }));
      rowsOf(table).push(...inserted);
      return { data: inserted.map((row) => ({ ...row })), error: null };
    }
    const matched = rowsOf(table).filter(matches);
    if (op === "update") {
      for (const row of matched) Object.assign(row, payload[0]);
    }
    if (op === "delete") {
      db.tables[table] = rowsOf(table).filter((row) => !matches(row));
      applyReferentialActions(matched, table);
    }
    return { data: matched.map((row) => ({ ...row })), error: null };
  }

  const single = () => {
    const { data } = run();
    return Promise.resolve({
      data: (data as Row[])[0] ?? null,
      error: null,
    });
  };

  const builder = {
    select: () => builder,
    insert(rows: Row[]) {
      op = "insert";
      payload = rows;
      return builder;
    },
    update(row: Row) {
      op = "update";
      payload = [row];
      return builder;
    },
    delete() {
      op = "delete";
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return builder;
    },
    in(column: string, values: unknown[]) {
      inFilter = [column, values];
      return builder;
    },
    order: () => Promise.resolve(run()),
    single,
    maybeSingle: single,
    then(
      resolve: (value: { data: unknown; error: null }) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(run()).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

// Vínculo com Recorrência Financeira (feature 002) roda no mesmo ponto de `updateTask`; aqui é
// neutralizado pra que o fluxo fale só do vínculo com a Lista de Compras.
vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactionsByIds: vi.fn(async () => []),
  updateRecurringParcelPayment: vi.fn(async () => {}),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

beforeEach(() => {
  db.tables = {
    shopping_category: [
      { id: "cat-1", user_id: "user-1", name: "Mercado", description: null, color: null },
    ],
    shopping_item: [
      {
        id: "item-1",
        user_id: "user-1",
        shopping_category_id: "cat-1",
        title: "Café",
        description: null,
        quantity: 2,
        unit: "pacotes",
        provider_link: null,
        status: "pending",
      },
    ],
    task: [],
  };
  db.seq = 0;
  toastMock.mockClear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ShoppingList />
    </MemoryRouter>
  );
}

const taskRows = () => rowsOf("task");
const itemRows = () => rowsOf("shopping_item");

describe("Lista de Compras — item vira tarefa (fluxo fim a fim)", () => {
  it("cria a tarefa a partir do item, sincroniza status nos dois sentidos e sobrevive a exclusões dos dois lados", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();

    // 1. O item ainda não tem tarefa: a linha oferece criar uma.
    await user.click(
      await screen.findByRole("button", { name: "Criar tarefa para Café" })
    );

    // 2. A tarefa nasce com o ícone de compras e o vínculo com o item — "ESSA TAREFA JÁ DEVE TER
    //    O ÍCONE VINCULADO" do pedido original.
    await waitFor(() => expect(taskRows()).toHaveLength(1));
    expect(taskRows()[0]).toMatchObject({
      title: "Comprar Café",
      icon_key: "shopping-cart",
      linked_shopping_item_id: "item-1",
      status: "todo",
      user_id: "user-1",
    });
    expect(taskRows()[0].description).toContain("Mercado");

    // 3. A linha troca o botão pelo atalho pra tarefa, com o ícone de compras.
    const link = await screen.findByRole("link", { name: 'Ver tarefa "Comprar Café"' });
    expect(link).toHaveAttribute("href", "/tasks");
    expect(
      screen.queryByRole("button", { name: "Criar tarefa para Café" })
    ).not.toBeInTheDocument();

    // 4. Concluir a tarefa (o que aconteceria em /tasks) marca o item como comprado.
    const taskId = taskRows()[0].id as string;
    await updateTask({ id: taskId, status: "done" });
    expect(itemRows()[0].status).toBe("purchased");

    // Recarregar a página mostra o item comprado (riscado, checkbox marcado).
    unmount();
    renderPage();
    const checkbox = await screen.findByRole("checkbox", {
      name: "Marcar Café como comprado",
    });
    await waitFor(() => expect(checkbox).toBeChecked());

    // 5. Desmarcar o item na lista reabre a tarefa vinculada.
    await user.click(checkbox);
    await waitFor(() => expect(taskRows()[0].status).toBe("todo"));
    expect(taskRows()[0].completed_at).toBeNull();
    expect(itemRows()[0].status).toBe("pending");

    // 6. Excluir a tarefa não apaga o item — ele volta a ser um item comum, sem vínculo.
    await deleteTask(taskId);
    expect(taskRows()).toHaveLength(0);
    expect(itemRows()).toHaveLength(1);
  });

  it("excluir o item vinculado mantém a tarefa, só zerando o vínculo (on delete set null)", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Criar tarefa para Café" })
    );
    await waitFor(() => expect(taskRows()).toHaveLength(1));

    await user.click(await screen.findByRole("button", { name: "Excluir Café" }));
    await user.click(await screen.findByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(itemRows()).toHaveLength(0));
    // A tarefa continua existindo — excluir a compra não desfaz o compromisso já assumido.
    expect(taskRows()).toHaveLength(1);
    expect(taskRows()[0].linked_shopping_item_id).toBeNull();
    expect(taskRows()[0].title).toBe("Comprar Café");
  });

  it("excluir a categoria cascateia no item e ainda assim preserva a tarefa, sem vínculo", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Criar tarefa para Café" })
    );
    await waitFor(() => expect(taskRows()).toHaveLength(1));

    await user.click(
      await screen.findByRole("button", { name: "Excluir categoria Mercado" })
    );
    await user.click(await screen.findByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(itemRows()).toHaveLength(0));
    expect(taskRows()).toHaveLength(1);
    expect(taskRows()[0].linked_shopping_item_id).toBeNull();
  });

  it("depois de excluída a tarefa, a linha volta a oferecer 'Criar tarefa' (relação 1:1 recomeça)", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Criar tarefa para Café" })
    );
    await waitFor(() => expect(taskRows()).toHaveLength(1));

    await deleteTask(taskRows()[0].id as string);
    unmount();
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Criar tarefa para Café" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: 'Ver tarefa "Comprar Café"' })
    ).not.toBeInTheDocument();
  });
});
