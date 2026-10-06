import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tabs } from "@/components/ui/tabs";
import { TripItineraryTab } from "@/pages/admin/travel/components/TripItineraryTab";
import type {
  TripItineraryActivity,
  TripItineraryDay,
} from "@/types/travel";

/**
 * Feature 256: a linha não-deslocamento do roteiro se chama **evento**, não "visita".
 *
 * O que estes testes travam é o vocabulário visível — o botão, o vazio do dia, o progresso e o
 * rótulo de reabrir —, e travam também o que **não** mudou: "Deslocamento" continua sendo a outra
 * metade da linha. Sem a segunda metade, um `replace` global de "visita" por "evento" passaria.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/googleRoutes", () => ({
  fetchTravelRoutes: vi.fn(async () => []),
}));

function activity(over: Partial<TripItineraryActivity> = {}): TripItineraryActivity {
  return {
    id: "act-event",
    day_id: "day-1",
    title: "Show do Caetano",
    activity_time: "21:00",
    sort_order: 0,
    category: "other",
    visit_status: "pending",
    assets: [],
    ...over,
  };
}

function day(activities: TripItineraryActivity[]): TripItineraryDay {
  return {
    id: "day-1",
    trip_id: "trip-1",
    day_number: 1,
    date: "2026-11-10",
    activities,
  };
}

function renderTab(activities: TripItineraryActivity[]) {
  return render(
    <Tabs defaultValue="itinerary">
      <TripItineraryTab
        tripId="trip-1"
        itinerary={[day(activities)]}
        places={[]}
        savedPlaces={[]}
        members={[]}
        user={null}
        disableRoutes
        onEditDay={vi.fn()}
        onEditActivity={vi.fn()}
        onOpenAssets={vi.fn()}
        onAddActivity={vi.fn()}
        onReload={vi.fn()}
        onVisitStatusChange={vi.fn()}
        onMoveVisit={vi.fn()}
        onAddSavedPlace={vi.fn()}
      />
    </Tabs>
  );
}

describe("vocabulário do roteiro: evento", () => {
  it("o dia vazio e o botão de adicionar falam em evento", async () => {
    renderTab([]);

    expect(
      await screen.findByRole("button", { name: "Adicionar evento" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Adicione eventos ou um deslocamento no plano do dia.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/visita/i)).toBeNull();
  });

  it("o progresso do dia conta eventos concluídos", async () => {
    renderTab([
      activity({ visit_status: "completed" }),
      activity({ id: "act-2", title: "Museu Berardo", sort_order: 1 }),
    ]);

    expect(
      await screen.findByRole("progressbar", {
        name: /progresso do dia: 1 de 2 eventos concluídos/i,
      })
    ).toBeInTheDocument();
  });

  it("o card concluído oferece reabrir o evento", async () => {
    renderTab([activity({ visit_status: "completed" })]);

    expect(
      await screen.findByRole("button", {
        name: /show do caetano: reabrir evento/i,
      })
    ).toBeInTheDocument();
  });

  it("deslocamento continua sendo deslocamento", async () => {
    renderTab([
      activity({
        id: "act-flight",
        title: "GRU → LIS",
        category: "transport",
        transport_mode: "flight",
        activity_time: "22:10",
        arrival_time: "12:35",
      }),
    ]);

    // Várias ocorrências de propósito (o rótulo do card e o botão de adicionar): o que importa é
    // que a palavra continua existindo.
    expect((await screen.findAllByText(/deslocamento/i)).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Adicionar evento" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/visita/i)).toBeNull();
  });
});
