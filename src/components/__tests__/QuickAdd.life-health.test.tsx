import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QuickAddHost } from "@/components/QuickAddHost";
import { QuickAddMenu } from "@/components/QuickAddMenu";
import { QuickAddProvider } from "@/hooks/useQuickAdd";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/pages/admin/finance/components/TransactionFormDialog", () => ({
  TransactionFormDialog: () => null,
}));
vi.mock("@/components/PlaceFormDialog", () => ({ PlaceFormDialog: () => null }));
vi.mock("@/components/TripFormDialog", () => ({ TripFormDialog: () => null }));
vi.mock("@/pages/admin/car/components/VehicleFormDialog", () => ({
  VehicleFormDialog: () => null,
}));
vi.mock("@/pages/admin/movies/components/MovieSearchModal", () => ({
  MovieSearchModal: () => null,
}));
vi.mock("@/pages/admin/books/components/BookSearchModal", () => ({
  BookSearchModal: () => null,
}));
vi.mock("@/pages/admin/music/components/AlbumSearchModal", () => ({
  AlbumSearchModal: () => null,
}));
vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/api/finance", () => ({ createTransactionApi: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock("@/pages/admin/health/MedicationQuickCreateDialog", () => ({
  MedicationQuickCreateDialog: ({ open }: { open: boolean }) =>
    open ? <div>Dialog nova medicação</div> : null,
}));

vi.mock("@/pages/admin/tasks/ConsultationQuickCreateDialog", () => ({
  ConsultationQuickCreateDialog: ({ open }: { open: boolean }) =>
    open ? <div>Dialog agendar consulta</div> : null,
}));

function renderLifeQuickAdd() {
  return render(
    <MemoryRouter>
      <QuickAddProvider>
        <QuickAddMenu open onOpenChange={() => {}} area="life" source="fab">
          <button type="button">Adicionar</button>
        </QuickAddMenu>
        <QuickAddHost />
      </QuickAddProvider>
    </MemoryRouter>
  );
}

describe("Quick Add de Vida — medicação e consulta", () => {
  it("o menu de Vida lista cadastrar medicação e agendar consulta", () => {
    renderLifeQuickAdd();

    expect(
      screen.getByRole("menuitem", { name: "Cadastrar medicação" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Agendar consulta" })
    ).toBeInTheDocument();
  });

  it("escolher cadastrar medicação abre o diálogo no overlay", async () => {
    const user = userEvent.setup();
    renderLifeQuickAdd();

    await user.click(
      screen.getByRole("menuitem", { name: "Cadastrar medicação" })
    );

    expect(await screen.findByText("Dialog nova medicação")).toBeInTheDocument();
    expect(screen.queryByText("Dialog agendar consulta")).toBeNull();
  });

  it("escolher agendar consulta abre o diálogo no overlay", async () => {
    const user = userEvent.setup();
    renderLifeQuickAdd();

    await user.click(screen.getByRole("menuitem", { name: "Agendar consulta" }));

    expect(await screen.findByText("Dialog agendar consulta")).toBeInTheDocument();
    expect(screen.queryByText("Dialog nova medicação")).toBeNull();
  });
});
