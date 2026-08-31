import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShoppingItemDialog } from "@/pages/admin/shopping/ShoppingItemDialog";
import { createShoppingItem, updateShoppingItem } from "@/api/shopping/items";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

vi.mock("@/api/shopping/items", () => ({
  createShoppingItem: vi.fn(),
  updateShoppingItem: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedCreate = vi.mocked(createShoppingItem);
const mockedUpdate = vi.mocked(updateShoppingItem);

const categories: ShoppingCategory[] = [
  { id: "c1", name: "Mercado" },
  { id: "c2", name: "Escritório" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockedCreate.mockResolvedValue({
    id: "i9",
    shopping_category_id: "c1",
    title: "Café",
    status: "pending",
  });
  mockedUpdate.mockResolvedValue(undefined);
});

function renderDialog({
  item = null,
  defaultCategoryId = null,
}: { item?: ShoppingItem | null; defaultCategoryId?: string | null } = {}) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ShoppingItemDialog
      open
      onOpenChange={onOpenChange}
      item={item}
      categories={categories}
      defaultCategoryId={defaultCategoryId}
      onSaved={onSaved}
    />
  );
  return { onSaved, onOpenChange };
}

describe("ShoppingItemDialog", () => {
  it("título vazio mantém o botão de salvar desabilitado", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Criar item" })).toBeDisabled();
  });

  it("cria o item na categoria pré-selecionada, com quantidade, unidade e link", async () => {
    const user = userEvent.setup();
    const { onSaved, onOpenChange } = renderDialog({ defaultCategoryId: "c2" });

    await user.type(screen.getByLabelText(/Título/), "Cabo HDMI");
    await user.type(screen.getByLabelText(/Quantidade/), "2");
    await user.type(screen.getByLabelText(/Unidade/), "un");
    await user.type(
      screen.getByLabelText(/Link do fornecedor/),
      "https://loja.example/hdmi"
    );

    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith({
        shopping_category_id: "c2",
        title: "Cabo HDMI",
        description: null,
        quantity: 2,
        unit: "un",
        provider_link: "https://loja.example/hdmi",
        status: "pending",
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalled();
  });

  it("sem categoria pré-selecionada, abre em 'Sem categoria' — nunca na primeira da lista", async () => {
    renderDialog();

    const trigger = screen.getByRole("combobox", { name: "Categoria" });
    expect(trigger).toHaveTextContent("Sem categoria");
    expect(trigger).not.toHaveTextContent("Mercado");
  });

  it("salvar só com o título cria o item com shopping_category_id null", async () => {
    const user = userEvent.setup();
    const { onSaved, onOpenChange } = renderDialog();

    const saveButton = screen.getByRole("button", { name: "Criar item" });
    await user.type(screen.getByLabelText(/Título/), "Pilha AA");
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith({
        shopping_category_id: null,
        title: "Pilha AA",
        description: null,
        quantity: null,
        unit: null,
        provider_link: null,
        status: "pending",
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalled();
  });

  it("com defaultCategoryId, abre naquela categoria (o botão da seção continua valendo)", () => {
    renderDialog({ defaultCategoryId: "c2" });
    expect(screen.getByRole("combobox", { name: "Categoria" })).toHaveTextContent(
      "Escritório"
    );
  });

  it("editar um item solto e escolher uma categoria move o item", async () => {
    const user = userEvent.setup();
    renderDialog({
      item: {
        id: "i1",
        shopping_category_id: null,
        title: "Pilha AA",
        status: "pending",
      },
    });

    const trigger = screen.getByRole("combobox", { name: "Categoria" });
    expect(trigger).toHaveTextContent("Sem categoria");

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Mercado" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "i1", shopping_category_id: "c1" })
      )
    );
  });

  it("editar um item categorizado e escolher 'Sem categoria' solta o item", async () => {
    const user = userEvent.setup();
    renderDialog({
      item: {
        id: "i2",
        shopping_category_id: "c1",
        title: "Café",
        status: "pending",
      },
    });

    const trigger = screen.getByRole("combobox", { name: "Categoria" });
    expect(trigger).toHaveTextContent("Mercado");

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Sem categoria" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "i2", shopping_category_id: null })
      )
    );
  });

  it("sem categoria nenhuma cadastrada, ainda dá para criar o item", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <ShoppingItemDialog
        open
        onOpenChange={vi.fn()}
        item={null}
        categories={[]}
        defaultCategoryId={null}
        onSaved={onSaved}
      />
    );

    await user.type(screen.getByLabelText(/Título/), "Pilha AA");
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pilha AA",
          shopping_category_id: null,
        })
      )
    );
  });

  it("o select mostra a categoria escolhida e permite trocar", async () => {
    const user = userEvent.setup();
    renderDialog({ defaultCategoryId: "c1" });

    const trigger = screen.getByRole("combobox", { name: "Categoria" });
    expect(trigger).toHaveTextContent("Mercado");

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Escritório" }));
    expect(trigger).toHaveTextContent("Escritório");

    await user.type(screen.getByLabelText(/Título/), "Cadeira");
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({ shopping_category_id: "c2" })
      )
    );
  });

  it("quantidade com vírgula vira número; campos em branco viram null", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/Título/), "Farinha");
    await user.type(screen.getByLabelText(/Quantidade/), "0,5");
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 0.5,
          unit: null,
          provider_link: null,
          description: null,
        })
      )
    );
  });

  it("em modo edição, pré-preenche e chama update com o id do item", async () => {
    const user = userEvent.setup();
    renderDialog({
      item: {
        id: "i1",
        shopping_category_id: "c2",
        title: "Café",
        quantity: 3,
        unit: "pacotes",
        provider_link: "https://loja.example/cafe",
        description: "moído",
        status: "purchased",
      },
    });

    expect(screen.getByLabelText(/Título/)).toHaveValue("Café");
    expect(screen.getByLabelText(/Quantidade/)).toHaveValue("3");
    expect(screen.getByRole("combobox", { name: "Categoria" })).toHaveTextContent(
      "Escritório"
    );

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({
        id: "i1",
        shopping_category_id: "c2",
        title: "Café",
        description: "moído",
        quantity: 3,
        unit: "pacotes",
        provider_link: "https://loja.example/cafe",
        status: "purchased",
      })
    );
  });

  it("erro na API mostra toast destrutivo e não fecha o dialog", async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValue(new Error("falhou"));
    const { onOpenChange } = renderDialog();

    await user.type(screen.getByLabelText(/Título/), "Café");
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
