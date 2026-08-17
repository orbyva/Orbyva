import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShoppingCategoryDialog } from "@/pages/admin/shopping/ShoppingCategoryDialog";
import {
  createShoppingCategory,
  updateShoppingCategory,
} from "@/api/shopping/categories";
import type { ShoppingCategory } from "@/types/shopping";
import type { Project } from "@/types/tasks";

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

const PROJECTS = [
  { id: "p1", name: "Obra da casa" },
  { id: "p2", name: "Setup do estúdio" },
] as Project[];

function renderDialog(
  category: ShoppingCategory | null = null,
  projects: Project[] = PROJECTS
) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ShoppingCategoryDialog
      open
      onOpenChange={onOpenChange}
      category={category}
      projects={projects}
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
        project_id: null,
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
        project_id: null,
      })
    );
  });

  it("cria a categoria vinculada ao projeto escolhido", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/Nome/), "Materiais");
    await user.click(screen.getByRole("option", { name: "Obra da casa" }));
    expect(screen.getByRole("option", { name: "Obra da casa" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    await user.click(screen.getByRole("button", { name: "Criar categoria" }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Materiais", project_id: "p1" })
      )
    );
  });

  it("em modo edição, pré-seleciona o projeto da categoria e permite desvincular", async () => {
    const user = userEvent.setup();
    renderDialog({ id: "c2", name: "Materiais", project_id: "p2" });

    expect(
      screen.getByRole("option", { name: "Setup do estúdio" })
    ).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("option", { name: "Sem projeto" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "c2", project_id: null })
      )
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
