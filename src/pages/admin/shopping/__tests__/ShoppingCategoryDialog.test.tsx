import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShoppingCategoryDialog } from "@/pages/admin/shopping/ShoppingCategoryDialog";
import {
  createShoppingCategory,
  updateShoppingCategory,
} from "@/api/shopping/categories";
import type { ShoppingCategory } from "@/types/shopping";

vi.mock("@/api/shopping/categories", () => ({
  createShoppingCategory: vi.fn(),
  updateShoppingCategory: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedCreate = vi.mocked(createShoppingCategory);
const mockedUpdate = vi.mocked(updateShoppingCategory);

beforeEach(() => {
  vi.clearAllMocks();
  mockedCreate.mockResolvedValue({ id: "c9", name: "Mercado" });
  mockedUpdate.mockResolvedValue(undefined);
});

function renderDialog(category: ShoppingCategory | null = null) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ShoppingCategoryDialog
      open
      onOpenChange={onOpenChange}
      category={category}
      onSaved={onSaved}
    />
  );
  return { onSaved, onOpenChange };
}

describe("ShoppingCategoryDialog", () => {
  it("nome vazio mantém o botão de salvar desabilitado", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Criar categoria" })).toBeDisabled();
  });

  it("cria a categoria com nome, descrição e cor escolhida", async () => {
    const user = userEvent.setup();
    const { onSaved, onOpenChange } = renderDialog();

    await user.type(screen.getByLabelText(/Nome/), "Mercado");
    await user.type(screen.getByLabelText(/Descrição/), "Compras da semana");

    const saveButton = screen.getByRole("button", { name: "Criar categoria" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith({
        name: "Mercado",
        description: "Compras da semana",
        color: null,
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalled();
  });

  it("em modo edição, pré-preenche os campos e chama update com o id", async () => {
    const user = userEvent.setup();
    renderDialog({
      id: "c1",
      name: "Mercado",
      description: "Semana",
      color: "#22c55e",
    });

    expect(screen.getByLabelText(/Nome/)).toHaveValue("Mercado");
    expect(screen.getByLabelText(/Descrição/)).toHaveValue("Semana");

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({
        id: "c1",
        name: "Mercado",
        description: "Semana",
        color: "#22c55e",
      })
    );
  });

  it("erro na API mostra toast destrutivo e mantém o dialog aberto", async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValue(new Error("falhou"));
    const { onSaved, onOpenChange } = renderDialog();

    await user.type(screen.getByLabelText(/Nome/), "Mercado");
    await user.click(screen.getByRole("button", { name: "Criar categoria" }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
