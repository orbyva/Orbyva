import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecurringListFilters } from "@/pages/admin/finance/components/RecurringListFilters";

const emptyCounts = {
  all: 0,
  receive: 0,
  pay: 0,
  open: 0,
  paid: 0,
  upcoming: 0,
  overdue: 0,
};

describe("RecurringListFilters", () => {
  it("busca dispara onSearchChange", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(
      <RecurringListFilters
        search=""
        onSearchChange={onSearchChange}
        natureFilter="all"
        onNatureChange={vi.fn()}
        natureCounts={emptyCounts}
        statusFilter="all"
        onStatusChange={vi.fn()}
        statusCounts={emptyCounts}
        showQuitadas={false}
        onShowQuitadasChange={vi.fn()}
        quitadasCount={0}
      />
    );

    await user.type(
      screen.getByRole("textbox", { name: "Buscar recorrências" }),
      "luz"
    );
    expect(onSearchChange).toHaveBeenCalled();
    expect(onSearchChange.mock.calls.map((c) => c[0]).join("")).toBe("luz");
  });

  it("Mostrar só as quitadas some a situação e dispara o callback", async () => {
    const user = userEvent.setup();
    const onShowQuitadasChange = vi.fn();
    const { rerender } = render(
      <RecurringListFilters
        search=""
        onSearchChange={vi.fn()}
        natureFilter="all"
        onNatureChange={vi.fn()}
        natureCounts={emptyCounts}
        statusFilter="all"
        onStatusChange={vi.fn()}
        statusCounts={emptyCounts}
        showQuitadas={false}
        onShowQuitadasChange={onShowQuitadasChange}
        quitadasCount={2}
      />
    );

    expect(screen.getByText("Em aberto")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Mostrar só as quitadas/ }));
    expect(onShowQuitadasChange).toHaveBeenCalledWith(true);

    rerender(
      <RecurringListFilters
        search=""
        onSearchChange={vi.fn()}
        natureFilter="all"
        onNatureChange={vi.fn()}
        natureCounts={emptyCounts}
        statusFilter="all"
        onStatusChange={vi.fn()}
        statusCounts={emptyCounts}
        showQuitadas
        onShowQuitadasChange={onShowQuitadasChange}
        quitadasCount={2}
      />
    );
    expect(screen.queryByText("Em aberto")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Mostrar só as quitadas/ })).toBeChecked();
  });
});
