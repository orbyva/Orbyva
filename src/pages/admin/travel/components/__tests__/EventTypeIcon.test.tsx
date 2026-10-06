import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "@/components/ui/tabs";
import { TripItineraryTab } from "@/pages/admin/travel/components/TripItineraryTab";
import {
  TripEditActivityDialog,
  type ActivityForm,
} from "@/pages/admin/travel/components/TripEditActivityDialog";
import {
  clearEventTypeIcon,
  setEventTypeIcon,
} from "@/api/travel/eventTypeIcons";
import { useEventTypeIcons } from "@/hooks/useEventTypeIcons";
import type {
  TripItineraryActivity,
  TripItineraryDay,
} from "@/types/travel";

/**
 * Feature 258: o ícone personalizado é **do tipo**, não do evento.
 *
 * As duas metades disso estão aqui: o card de todo evento daquele tipo passa a desenhar o ícone
 * escolhido, e escolher no formulário grava na configuração do usuário (`setEventTypeIcon`) em vez
 * de virar campo do evento — o `onSave` do formulário não é nem chamado.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/googleRoutes", () => ({
  fetchTravelRoutes: vi.fn(async () => []),
}));

vi.mock("@/hooks/useUserLocationBias", () => ({
  useUserLocationBias: () => ({ bias: null }),
}));

vi.mock("@/api/tasks/iconAssets", () => ({
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  uploadIconAsset: vi.fn(),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/api/travel/eventTypeIcons", () => ({
  setEventTypeIcon: vi.fn().mockResolvedValue(undefined),
  clearEventTypeIcon: vi.fn().mockResolvedValue(undefined),
  fetchEventTypeIcons: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/hooks/useEventTypeIcons", () => ({
  useEventTypeIcons: vi.fn(() => ({})),
  invalidateEventTypeIcons: vi.fn(),
}));

const CUSTOM_URL = "https://cdn.test/storage/task-icons/u/library/mic.svg";

function activity(over: Partial<TripItineraryActivity> = {}): TripItineraryActivity {
  return {
    id: "act-1",
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

function form(over: Partial<ActivityForm> = {}): ActivityForm {
  return {
    title: "Show do Caetano",
    activity_time: "",
    arrival_time: "",
    boarding_time: "",
    transport_mode: "other",
    notes: "",
    link_url: "",
    is_reserved: false,
    category: "museum",
    place_visit_id: null,
    linked_place_label: null,
    pending_catalog: null,
    origin: null,
    destination: null,
    asset_drafts: [],
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(useEventTypeIcons).mockReturnValue({});
  vi.mocked(setEventTypeIcon).mockClear();
  vi.mocked(clearEventTypeIcon).mockClear();
});

describe("o card do roteiro desenha o ícone do tipo", () => {
  it("sem personalização, desenha o ícone padrão do tipo", async () => {
    const { container } = renderTab([activity({ category: "museum" })]);

    await screen.findByText("Show do Caetano");
    expect(container.querySelector(`img[src="${CUSTOM_URL}"]`)).toBeNull();
    // O padrão é um SVG lucide, não uma imagem.
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("com personalização, todo evento daquele tipo desenha o ícone escolhido", async () => {
    vi.mocked(useEventTypeIcons).mockReturnValue({
      museum: { icon_key: null, icon_url: CUSTOM_URL },
    });

    const { container } = renderTab([
      activity({ id: "a-1", title: "Museu Berardo", category: "museum" }),
      activity({ id: "a-2", title: "Museu do Azulejo", category: "museum", sort_order: 1 }),
      activity({ id: "a-3", title: "Jantar", category: "restaurant", sort_order: 2 }),
    ]);

    await screen.findByText("Museu Berardo");
    // Os dois museus, e só eles.
    expect(container.querySelectorAll(`img[src="${CUSTOM_URL}"]`)).toHaveLength(2);
  });

  it("o preset escolhido também desenha", async () => {
    vi.mocked(useEventTypeIcons).mockReturnValue({
      other: { icon_key: "star", icon_url: null },
    });

    const { container } = renderTab([activity()]);

    await screen.findByText("Show do Caetano");
    expect(container.querySelector('svg[aria-label="Estrela"]')).not.toBeNull();
  });
});

describe("escolher o ícone no formulário", () => {
  it("grava para o tipo, não para o evento", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <TripEditActivityDialog
        open
        onOpenChange={vi.fn()}
        form={form()}
        onSave={onSave}
        places={[]}
        mode="create"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Escolher o ícone do tipo Museu" })
    );
    await user.click(await screen.findByRole("button", { name: "Estrela" }));

    expect(setEventTypeIcon).toHaveBeenCalledWith("museum", {
      icon_key: "star",
      icon_url: null,
    });
    // O ícone do tipo é configuração: não passa pelo "Salvar" do evento.
    expect(onSave).not.toHaveBeenCalled();
  });

  it("remover o ícone apaga a personalização do tipo", async () => {
    const user = userEvent.setup();
    vi.mocked(useEventTypeIcons).mockReturnValue({
      museum: { icon_key: "star", icon_url: null },
    });

    render(
      <TripEditActivityDialog
        open
        onOpenChange={vi.fn()}
        form={form()}
        onSave={vi.fn()}
        places={[]}
        mode="create"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Trocar o ícone do tipo Museu" })
    );
    await user.click(await screen.findByRole("button", { name: "Remover ícone" }));

    expect(clearEventTypeIcon).toHaveBeenCalledWith("museum");
    expect(setEventTypeIcon).not.toHaveBeenCalled();
  });

  it("deslocamento não oferece ícone de tipo", () => {
    render(
      <TripEditActivityDialog
        open
        onOpenChange={vi.fn()}
        form={form({ category: "transport", transport_mode: "flight" })}
        onSave={vi.fn()}
        places={[]}
        mode="create"
      />
    );

    expect(screen.queryByText(/ícone do tipo/i)).toBeNull();
  });
});
