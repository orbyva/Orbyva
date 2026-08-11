import { describe, expect, it } from "vitest";
import {
  findTransferActivity,
  isOvernightTransferTimes,
  listDayPairConnectors,
  listInterDayTransfers,
  transferPlanningHint,
  transferTimesConflictWithVisits,
  transferTitle,
  visitTimeConflictsWithTransfers,
} from "@/domain/travel/interDayTransfers";
import type { TripItineraryDay, TripStop } from "@/types/travel";

const stops: TripStop[] = [
  {
    id: "s1",
    trip_id: "t1",
    name: "Madrid",
    start_date: "2026-08-01",
    end_date: "2026-08-03",
    sort_order: 0,
  },
  {
    id: "s2",
    trip_id: "t1",
    name: "Ibiza",
    start_date: "2026-08-04",
    end_date: "2026-08-06",
    sort_order: 1,
  },
];

function day(
  id: string,
  day_number: number,
  date: string,
  activities: TripItineraryDay["activities"] = []
): TripItineraryDay {
  return { id, trip_id: "t1", day_number, date, activities };
}

describe("transferTitle", () => {
  it("formata origem → destino", () => {
    expect(transferTitle("Madrid", "Ibiza")).toBe("Madrid → Ibiza");
  });
});

describe("listDayPairConnectors", () => {
  it("cria slot entre todos os dias consecutivos", () => {
    const days = [
      day("d1", 1, "2026-08-03"),
      day("d2", 2, "2026-08-04"),
      day("d3", 3, "2026-08-05"),
    ];
    const connectors = listDayPairConnectors(days, stops);
    expect(connectors).toHaveLength(2);
    expect(connectors[0]?.cityChanged).toBe(true);
    expect(connectors[0]?.suggestedTitle).toBe("Madrid → Ibiza");
    expect(connectors[1]?.cityChanged).toBe(false);
    expect(connectors[1]?.suggestedTitle).toContain("Deslocamento");
  });

  it("anexa atividade de transport no dia de chegada", () => {
    const days = [
      day("d1", 1, "2026-08-03"),
      day("d2", 2, "2026-08-04", [
        {
          id: "a1",
          day_id: "d2",
          title: "Madrid → Ibiza",
          sort_order: 0,
          category: "transport",
          activity_time: "10:00",
          arrival_time: "14:30",
        },
      ]),
    ];
    const connectors = listDayPairConnectors(days, stops);
    expect(connectors[0]?.activity?.id).toBe("a1");
  });
});

describe("listInterDayTransfers", () => {
  it("só pares com troca de cidade", () => {
    const days = [
      day("d1", 1, "2026-08-03"),
      day("d2", 2, "2026-08-04"),
      day("d3", 3, "2026-08-05"),
    ];
    expect(listInterDayTransfers(days, stops)).toHaveLength(1);
  });
});

describe("findTransferActivity", () => {
  it("acha por categoria transport", () => {
    const toDay = day("d2", 2, "2026-08-04", [
      {
        id: "a2",
        day_id: "d2",
        title: "Transfer",
        sort_order: 1,
        category: "transport",
      },
    ]);
    expect(findTransferActivity(toDay)?.id).toBe("a2");
  });
});

describe("transferPlanningHint", () => {
  it("monta dica com saída e chegada", () => {
    expect(
      transferPlanningHint({
        activity_time: "10:00",
        arrival_time: "14:30",
      })
    ).toContain("14:30");
  });

  it("null sem horários", () => {
    expect(transferPlanningHint({ activity_time: null, arrival_time: null })).toBeNull();
  });
});

describe("isOvernightTransferTimes", () => {
  it("mesmo dia quando chegada > saída", () => {
    expect(isOvernightTransferTimes("09:00", "09:36")).toBe(false);
  });

  it("pernoite quando chegada <= saída", () => {
    expect(isOvernightTransferTimes("22:00", "08:00")).toBe(true);
  });
});

describe("visitTimeConflictsWithTransfers", () => {
  const days = [
    day("d1", 1, "2026-08-03"),
    day("d2", 2, "2026-08-04", [
      {
        id: "overnight",
        day_id: "d2",
        title: "Madrid → Ibiza",
        sort_order: 0,
        category: "transport",
        activity_time: "22:00",
        arrival_time: "08:00",
      },
      {
        id: "volta",
        day_id: "d2",
        title: "Ibiza → Madrid",
        sort_order: 1,
        category: "transport",
        activity_time: "18:00",
        arrival_time: "22:00",
      },
    ]),
  ];

  it("bloqueia visita no dia de chegada antes da chegada (pernoite)", () => {
    expect(
      visitTimeConflictsWithTransfers({
        dayId: "d2",
        activityTime: "07:00",
        days,
      })?.message
    ).toMatch(/chegada 08:00/);
  });

  it("permite visita após chegada do pernoite e antes da volta", () => {
    expect(
      visitTimeConflictsWithTransfers({
        dayId: "d2",
        activityTime: "14:30",
        days,
      })
    ).toBeNull();
  });

  it("bloqueia visita no dia anterior após saída do pernoite", () => {
    expect(
      visitTimeConflictsWithTransfers({
        dayId: "d1",
        activityTime: "22:00",
        days,
      })?.message
    ).toMatch(/saída 22:00/);
  });

  it("bloqueia visita no intervalo same-day", () => {
    expect(
      visitTimeConflictsWithTransfers({
        dayId: "d2",
        activityTime: "19:00",
        days,
      })?.message
    ).toMatch(/Ibiza → Madrid/);
  });

  it("bloqueia visita antes da chegada da ida (mesmo dia)", () => {
    const inboundDays = [
      day("d1", 1, "2026-08-10", [
        {
          id: "ida",
          day_id: "d1",
          title: "Valparaíso → Alto Paraíso",
          sort_order: 0,
          category: "transport",
          activity_time: "18:00",
          arrival_time: "21:24",
          origin_label: "Valparaíso de Goiás",
          origin_lat: -16.07,
          origin_lng: -47.98,
          destination_label: "Alto Paraíso de Goiás",
          destination_lat: -14.13,
          destination_lng: -47.51,
        },
      ]),
    ];
    expect(
      visitTimeConflictsWithTransfers({
        dayId: "d1",
        activityTime: "09:00",
        days: inboundDays,
        atLocation: {
          label: "Alto Paraíso de Goiás",
          lat: -14.13,
          lng: -47.51,
        },
      })?.message
    ).toMatch(/só chega às 21:24/i);
  });

  it("bloqueia visita antes da chegada mesmo sem coords no deslocamento (só título)", () => {
    const inboundDays = [
      day("d1", 1, "2026-08-10", [
        {
          id: "ida",
          day_id: "d1",
          title: "Valparaíso de Goiás → Alto Paraíso de Goiás",
          sort_order: 0,
          category: "transport",
          activity_time: "18:00",
          arrival_time: "21:24",
        },
      ]),
    ];
    expect(
      visitTimeConflictsWithTransfers({
        dayId: "d1",
        activityTime: "09:30",
        days: inboundDays,
        atLocation: {
          label: "Cachoeira Dos Cristais",
          lat: -14.1,
          lng: -47.5,
        },
      })?.message
    ).toMatch(/só chega às 21:24/i);
  });

  it("permite visita após a chegada da ida", () => {
    const inboundDays = [
      day("d1", 1, "2026-08-10", [
        {
          id: "ida",
          day_id: "d1",
          title: "Valparaíso → Alto Paraíso",
          sort_order: 0,
          category: "transport",
          activity_time: "18:00",
          arrival_time: "21:24",
          origin_label: "Valparaíso de Goiás",
          origin_lat: -16.07,
          origin_lng: -47.98,
          destination_label: "Alto Paraíso de Goiás",
          destination_lat: -14.13,
          destination_lng: -47.51,
        },
      ]),
    ];
    expect(
      visitTimeConflictsWithTransfers({
        dayId: "d1",
        activityTime: "22:00",
        days: inboundDays,
        atLocation: {
          label: "Alto Paraíso de Goiás",
          lat: -14.13,
          lng: -47.51,
        },
      })
    ).toBeNull();
  });

  it("não bloqueia visita por deslocamento de volta", () => {
    const returnDays = [
      day("d1", 1, "2026-08-10", [
        {
          id: "volta",
          day_id: "d1",
          title: "Alto Paraíso → Casa",
          sort_order: 0,
          category: "transport",
          activity_time: "20:00",
          arrival_time: "23:00",
          origin_label: "Alto Paraíso de Goiás",
          origin_lat: -14.13,
          origin_lng: -47.51,
          destination_label: "Valparaíso de Goiás",
          destination_lat: -16.07,
          destination_lng: -47.98,
        },
      ]),
    ];
    expect(
      visitTimeConflictsWithTransfers({
        dayId: "d1",
        activityTime: "15:00",
        days: returnDays,
        atLocation: {
          label: "Alto Paraíso de Goiás",
          lat: -14.13,
          lng: -47.51,
        },
      })
    ).toBeNull();
  });

  it("sem horário na visita não conflita", () => {
    expect(
      visitTimeConflictsWithTransfers({
        dayId: "d2",
        activityTime: null,
        days,
      })
    ).toBeNull();
  });
});

describe("transferTimesConflictWithVisits", () => {
  it("detecta visita no intervalo same-day", () => {
    const days = [
      day("d1", 1, "2026-08-04", [
        {
          id: "v1",
          day_id: "d1",
          title: "Praia",
          sort_order: 0,
          category: "attraction",
          activity_time: "19:00",
        },
      ]),
    ];
    expect(
      transferTimesConflictWithVisits({
        dayId: "d1",
        departTime: "18:00",
        arriveTime: "22:00",
        days,
      })?.message
    ).toMatch(/Praia/);
  });

  it("detecta visita conflitante no dia de saída (pernoite)", () => {
    const days = [
      day("d1", 1, "2026-08-03", [
        {
          id: "v1",
          day_id: "d1",
          title: "Museu",
          sort_order: 0,
          category: "attraction",
          activity_time: "23:00",
        },
      ]),
      day("d2", 2, "2026-08-04"),
    ];
    expect(
      transferTimesConflictWithVisits({
        dayId: "d2",
        departTime: "22:00",
        arriveTime: "08:00",
        days,
      })?.message
    ).toMatch(/Museu/);
  });
});
