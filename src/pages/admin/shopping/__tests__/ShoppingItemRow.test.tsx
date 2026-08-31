import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ShoppingItemRow } from "@/pages/admin/shopping/ShoppingItemRow";
import {
  createTaskFromShoppingItem,
  setShoppingItemStatus,
} from "@/api/shopping/items";
import type { ShoppingItem } from "@/types/shopping";

vi.mock("@/api/shopping/items", () => ({
  setShoppingItemStatus: vi.fn(),
  createTaskFromShoppingItem: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedSetStatus = vi.mocked(setShoppingItemStatus);
const mockedCreateTask = vi.mocked(createTaskFromShoppingItem);

function makeItem(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: "i1",
    shopping_category_id: "c1",
    title: "Café",
    status: "pending",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSetStatus.mockResolvedValue(undefined);
});

function renderRow(item: ShoppingItem, onStatusChange = vi.fn()) {
  render(
    <ul>
      <ShoppingItemRow
        item={item}
        onStatusChange={onStatusChange}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    </ul>
  );
  return { onStatusChange };
}

describe("ShoppingItemRow", () => {
  it("marcar o checkbox persiste 'purchased' e avisa a página", async () => {
    const user = userEvent.setup();
    const { onStatusChange } = renderRow(makeItem());

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    expect(checkbox).toBeChecked();
    await waitFor(() =>
      expect(mockedSetStatus).toHaveBeenCalledWith("i1", "purchased")
    );
    expect(onStatusChange).toHaveBeenCalledWith("i1", "purchased");
  });

  it("desmarcar volta o item para 'pending'", async () => {
    const user = userEvent.setup();
    renderRow(makeItem({ status: "purchased" }));

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    await user.click(checkbox);

    expect(checkbox).not.toBeChecked();
    await waitFor(() =>
      expect(mockedSetStatus).toHaveBeenCalledWith("i1", "pending")
    );
  });

  it("erro ao salvar reverte o checkbox e mostra toast destrutivo", async () => {
    const user = userEvent.setup();
    mockedSetStatus.mockRejectedValue(new Error("row level security"));
    const { onStatusChange } = renderRow(makeItem());

    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);

    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" })
    );
  });

  it("item comprado aparece riscado; pendente não", () => {
    const { unmount } = render(
      <ul>
        <ShoppingItemRow
          item={makeItem({ status: "purchased" })}
          onStatusChange={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </ul>
    );
    expect(screen.getByText("Café").className).toContain("line-through");
    unmount();

    renderRow(makeItem());
    expect(screen.getByText("Café").className).not.toContain("line-through");
  });

  it("mostra quantidade + unidade e o link do fornecedor como ícone externo", () => {
    renderRow(
      makeItem({
        quantity: 2,
        unit: "pacotes",
        provider_link: "https://loja.example/cafe",
      })
    );

    expect(screen.getByText("2 pacotes")).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: "Abrir link do fornecedor de Café",
    });
    expect(link).toHaveAttribute("href", "https://loja.example/cafe");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("sem provider_link nem tarefa vinculada, não renderiza link nenhum", () => {
    renderRow(makeItem());
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("excluir passa pelo ConfirmDeleteDialog antes de chamar onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <ul>
        <ShoppingItemRow
          item={makeItem()}
          onStatusChange={vi.fn()}
          onEdit={vi.fn()}
          onDelete={onDelete}
        />
      </ul>
    );

    await user.click(screen.getByRole("button", { name: "Excluir Café" }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

/**
 * Feature 051: o item vira um compromisso de compra. Sem tarefa, a linha oferece "Criar tarefa";
 * com tarefa, o botão dá lugar ao atalho pra ela (relação 1:1 — nunca as duas coisas juntas).
 */
describe("ShoppingItemRow — vínculo com a tarefa", () => {
  function renderLinked(
    item: ShoppingItem,
    taskLink: Parameters<typeof ShoppingItemRow>[0]["taskLink"],
    onTaskCreated = vi.fn()
  ) {
    render(
      <MemoryRouter>
        <ul>
          <ShoppingItemRow
            item={item}
            taskLink={taskLink}
            onStatusChange={vi.fn()}
            onTaskCreated={onTaskCreated}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
          />
        </ul>
      </MemoryRouter>
    );
    return { onTaskCreated };
  }

  it("item sem tarefa mostra o botão 'Criar tarefa' e nenhum badge de tarefa", () => {
    renderLinked(makeItem(), null);

    expect(
      screen.getByRole("button", { name: "Criar tarefa para Café" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Tarefa")).not.toBeInTheDocument();
  });

  it("clicar em 'Criar tarefa' chama a API com o id do item, avisa a página e mostra o título no toast", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue({
      id: "task-1",
      title: "Comprar Café",
      status: "todo",
      icon_key: "shopping-cart",
      linked_shopping_item_id: "i1",
    } as never);
    const { onTaskCreated } = renderLinked(makeItem(), null);

    await user.click(screen.getByRole("button", { name: "Criar tarefa para Café" }));

    await waitFor(() => expect(mockedCreateTask).toHaveBeenCalledWith("i1"));
    expect(onTaskCreated).toHaveBeenCalledWith("i1", {
      taskId: "task-1",
      title: "Comprar Café",
      status: "todo",
    });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Tarefa "Comprar Café" criada' })
    );
  });

  it("falha ao criar a tarefa mostra toast destrutivo e não avisa a página", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockRejectedValue(new Error("row level security"));
    const { onTaskCreated } = renderLinked(makeItem(), null);

    await user.click(screen.getByRole("button", { name: "Criar tarefa para Café" }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
    expect(onTaskCreated).not.toHaveBeenCalled();
    // O botão volta a ficar disponível pra nova tentativa.
    expect(screen.getByRole("button", { name: "Criar tarefa para Café" })).toBeEnabled();
  });

  it("item já vinculado troca o botão pelo badge 'Tarefa', com o ícone de compras, linkando pra /tasks", () => {
    const { container } = render(
      <MemoryRouter>
        <ul>
          <ShoppingItemRow
            item={makeItem()}
            taskLink={{ taskId: "task-1", title: "Comprar Café", status: "todo" }}
            onStatusChange={vi.fn()}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
          />
        </ul>
      </MemoryRouter>
    );

    expect(
      screen.queryByRole("button", { name: "Criar tarefa para Café" })
    ).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: 'Ver tarefa "Comprar Café"' });
    expect(link).toHaveAttribute("href", "/tasks");
    expect(link).toHaveTextContent("Tarefa");
    // O "ícone vinculado" do pedido: o preset de compras aparece no atalho.
    expect(container.querySelector('svg[aria-label="Compra"]')).toBeInTheDocument();
  });
});
