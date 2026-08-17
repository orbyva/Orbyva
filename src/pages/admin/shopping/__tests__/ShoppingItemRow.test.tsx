import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShoppingItemRow } from "@/pages/admin/shopping/ShoppingItemRow";
import { setShoppingItemStatus } from "@/api/shopping/items";
import type { ShoppingItem } from "@/types/shopping";

vi.mock("@/api/shopping/items", () => ({
  setShoppingItemStatus: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedSetStatus = vi.mocked(setShoppingItemStatus);

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

  it("sem provider_link, não renderiza link nenhum", () => {
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
