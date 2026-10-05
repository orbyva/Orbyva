import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "@/components/ui/tabs";
import { TripItineraryTab } from "@/pages/admin/travel/components/TripItineraryTab";
import type {
  TripItineraryActivity,
  TripItineraryDay,
} from "@/types/travel";

/**
 * Feature 102 no roteiro: o botão de assets existe nos **dois** tipos de linha (o pedido-mãe é
 * "tanto em um lugar quanto um deslocamento"), e o embarque aparece só no deslocamento com portão.
 *
 * O que estes testes travam é justamente a simetria: um botão que só aparecesse na visita, ou só no
 * deslocamento, passaria por qualquer teste que olhasse um card de cada vez.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// O painel de rota vai à rede; o roteiro é renderizado com `disableRoutes`, mas o mock garante que
// nenhum teste aqui dependa de Google Routes.
vi.mock("@/lib/googleRoutes", () => ({
  fetchTravelRoutes: vi.fn(async () => []),
}));

function activity(over: Partial<TripItineraryActivity> = {}): TripItineraryActivity {
  return {
    id: "act-visit",
    day_id: "day-1",
    title: "Mosteiro dos Jerónimos",
    activity_time: "10:00",
    sort_order: 0,
    category: "museum",
    visit_status: "pending",
    assets: [],
    ...over,
  };
}

const FLIGHT = activity({
  id: "act-flight",
  title: "GRU → LIS",
  category: "transport",
  transport_mode: "flight",
  activity_time: "22:10",
  arrival_time: "12:35",
  boarding_time: "21:30",
  sort_order: 1,
});

function day(activities: TripItineraryActivity[]): TripItineraryDay {
  return {
    id: "day-1",
    trip_id: "trip-1",
    day_number: 1,
    date: "2026-11-10",
    activities,
  };
}

function baseProps(activities: TripItineraryActivity[], onOpenAssets = vi.fn()) {
  return {
    tripId: "trip-1",
    itinerary: [day(activities)],
    places: [],
    savedPlaces: [],
    members: [],
    user: null,
    disableRoutes: true,
    onEditDay: vi.fn(),
    onEditActivity: vi.fn(),
    onOpenAssets,
    onAddActivity: vi.fn(),
    onReload: vi.fn(),
    onVisitStatusChange: vi.fn(),
    onMoveVisit: vi.fn(),
    onAddSavedPlace: vi.fn(),
  };
}

function renderTab(props: ReturnType<typeof baseProps>) {
  return render(
    <Tabs defaultValue="itinerary">
      <TripItineraryTab {...props} />
    </Tabs>
  );
}

describe("botão de assets no roteiro", () => {
  it("aparece na visita e abre com a atividade da linha", async () => {
    const user = userEvent.setup();
    const onOpenAssets = vi.fn();
    renderTab(baseProps([activity()], onOpenAssets));

    const button = await screen.findByRole("button", {
      name: /anexar assets em mosteiro dos jerónimos/i,
    });
    await user.click(button);

    expect(onOpenAssets).toHaveBeenCalledTimes(1);
    expect(onOpenAssets.mock.calls[0][0].id).toBe("act-visit");
  });

  it("aparece também no deslocamento — é a outra metade do pedido", async () => {
    const user = userEvent.setup();
    const onOpenAssets = vi.fn();
    renderTab(baseProps([FLIGHT], onOpenAssets));

    const button = await screen.findByRole("button", {
      name: /anexar assets em gru → lis/i,
    });
    await user.click(button);

    expect(onOpenAssets.mock.calls[0][0].id).toBe("act-flight");
  });

  it("os dois tipos de linha têm o botão no mesmo roteiro", async () => {
    renderTab(baseProps([activity(), FLIGHT]));

    expect(
      await screen.findByRole("button", {
        name: /anexar assets em mosteiro dos jerónimos/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /anexar assets em gru → lis/i })
    ).toBeInTheDocument();
  });

  it("com assets, o card mostra a contagem no rótulo acessível", async () => {
    renderTab(
      baseProps([
        activity({
          assets: [
            {
              id: "as-1",
              trip_id: "trip-1",
              activity_id: "act-visit",
              kind: "link",
              label: "Ingresso",
              url: "https://x.test/i",
              storage_path: null,
              mime_type: null,
              size_bytes: null,
              position: 0,
            },
            {
              id: "as-2",
              trip_id: "trip-1",
              activity_id: "act-visit",
              kind: "file",
              label: "Voucher",
              url: null,
              storage_path: "trip-1/act-visit/a.pdf",
              mime_type: "application/pdf",
              size_bytes: 2048,
              position: 1,
            },
          ],
        }),
      ])
    );

    expect(
      await screen.findByRole("button", {
        name: /assets de mosteiro dos jerónimos: 2/i,
      })
    ).toBeInTheDocument();
  });
});

describe("horário de embarque no card", () => {
  it("o voo mostra o embarque, separado da seta partida → chegada", async () => {
    renderTab(baseProps([FLIGHT]));

    expect(await screen.findByText(/embarque 21:30/i)).toBeInTheDocument();
    // A seta continua sendo só trajeto.
    expect(screen.getByText("22:10 → 12:35")).toBeInTheDocument();
  });

  it("carro não mostra embarque, mesmo com dado antigo na coluna", async () => {
    renderTab(
      baseProps([
        activity({
          id: "act-car",
          title: "Lisboa → Sintra",
          category: "transport",
          transport_mode: "car",
          activity_time: "09:00",
          arrival_time: "09:40",
          // Pode ter sobrado de quando a linha era um voo: a regra do domínio é que manda, não o
          // que está gravado.
          boarding_time: "08:30",
        }),
      ])
    );

    await screen.findByText("09:00 → 09:40");
    expect(screen.queryByText(/embarque/i)).toBeNull();
  });

  it("visita nunca mostra embarque", async () => {
    renderTab(baseProps([activity({ boarding_time: "09:00" })]));

    await screen.findByText("Mosteiro dos Jerónimos");
    expect(screen.queryByText(/embarque/i)).toBeNull();
  });
});
