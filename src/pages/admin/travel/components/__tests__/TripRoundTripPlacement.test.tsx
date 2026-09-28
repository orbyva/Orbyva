import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripFormDialog } from "@/components/TripFormDialog";
import { Tabs } from "@/components/ui/tabs";
import { TripItineraryTab } from "@/pages/admin/travel/components/TripItineraryTab";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const itineraryProps = {
  tripId: "trip-1",
  itinerary: [],
  places: [],
  savedPlaces: [],
  members: [],
  user: null,
  onEditDay: vi.fn(),
  onEditActivity: vi.fn(),
  onAddActivity: vi.fn(),
  onReload: vi.fn(),
  onVisitStatusChange: vi.fn(),
  onMoveVisit: vi.fn(),
  onAddSavedPlace: vi.fn(),
};

describe("deslocamentos de ida e volta depois da criação", () => {
  it("não oferece ida e volta no formulário de criação da viagem", () => {
    render(
      <TripFormDialog
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
      />
    );

    expect(screen.getByText("Nova viagem")).toBeInTheDocument();
    expect(screen.queryByText(/deslocamentos de ida e volta/i)).toBeNull();
  });

  it("oferece adicionar ida e volta na visualização do roteiro", async () => {
    const user = userEvent.setup();
    const onManageRoundTrip = vi.fn();
    render(
      <Tabs defaultValue="itinerary">
        <TripItineraryTab
          {...itineraryProps}
          onManageRoundTrip={onManageRoundTrip}
        />
      </Tabs>
    );

    await user.click(
      screen.getByRole("button", { name: "Adicionar ida e volta" })
    );
    expect(onManageRoundTrip).toHaveBeenCalledOnce();
  });

  it("identifica a ação como edição quando os trechos já existem", () => {
    render(
      <Tabs defaultValue="itinerary">
        <TripItineraryTab
          {...itineraryProps}
          hasRoundTrip
          onManageRoundTrip={() => {}}
        />
      </Tabs>
    );

    expect(
      screen.getByRole("button", { name: "Editar ida e volta" })
    ).toBeInTheDocument();
  });
});
