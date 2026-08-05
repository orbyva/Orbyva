import { describe, expect, it } from "vitest";
import {
  buildDelayInsight,
  computeLeaveByHHmm,
  findLastCompletedVisit,
  findNextPendingVisit,
  findPreviousVisit,
  formatDurationFriendly,
  formatLeaveByInsight,
  isPastDay,
  isVisitDone,
  isVisitOpen,
  normalizeVisitStatus,
  parseHHmmToMinutes,
  resolveRouteOrigin,
  shouldComputeRoutesForDay,
  sortVisitsForDay,
  visitHasCoordinates,
  type VisitLike,
} from "@/domain/itinerary/visits";

function visit(partial: Partial<VisitLike> & { id: string; title: string }): VisitLike {
  return {
    sort_order: 0,
    visit_status: "pending",
    activity_time: null,
    place_visit_id: null,
    ...partial,
  };
}

describe("normalizeVisitStatus / open / done / coords", () => {
  it("normaliza status", () => {
    expect(normalizeVisitStatus("completed")).toBe("completed");
    expect(normalizeVisitStatus("skipped")).toBe("skipped");
    expect(normalizeVisitStatus(null)).toBe("pending");
    expect(normalizeVisitStatus("weird")).toBe("pending");
  });

  it("open vs done", () => {
    expect(isVisitOpen(visit({ id: "1", title: "A" }))).toBe(true);
    expect(
      isVisitDone(visit({ id: "1", title: "A", visit_status: "completed" }))
    ).toBe(true);
    expect(
      isVisitDone(visit({ id: "1", title: "A", visit_status: "skipped" }))
    ).toBe(true);
  });

  it("visitHasCoordinates", () => {
    expect(visitHasCoordinates(visit({ id: "1", title: "A" }))).toBe(false);
    expect(
      visitHasCoordinates(visit({ id: "1", title: "A", lat: 1, lng: 2 }))
    ).toBe(true);
  });

  it("parseHHmmToMinutes", () => {
    expect(parseHHmmToMinutes("09:30")).toBe(9 * 60 + 30);
    expect(parseHHmmToMinutes(null)).toBeNull();
    expect(parseHHmmToMinutes("xx")).toBeNull();
  });
});

describe("formatLeaveByInsight", () => {
  it("monta texto de saída", () => {
    expect(
      formatLeaveByInsight({
        destinationTitle: "Mané",
        arrivalHHmm: "11:00",
        originTitle: "Hotel",
        leaveByHHmm: "10:26",
        durationSeconds: 34 * 60,
      })
    ).toBe(
      "Para chegar em Mané às 11:00 saindo de Hotel, saia às 10:26 (34 min)."
    );
  });
});

describe("resolveRouteOrigin fallbacks", () => {
  it("usa visita anterior e depois origem da viagem", () => {
    const visits = [
      visit({
        id: "1",
        title: "A",
        activity_time: "09:00",
        visit_status: "pending",
        lat: 1,
        lng: 1,
        sort_order: 0,
      }),
      visit({
        id: "2",
        title: "B",
        activity_time: "11:00",
        visit_status: "pending",
        lat: 2,
        lng: 2,
        sort_order: 1,
      }),
    ];
    expect(
      resolveRouteOrigin({
        userLocation: null,
        visits,
        nextVisit: visits[1],
        tripOrigin: { lat: 9, lng: 9 },
      })
    ).toEqual({ lat: 1, lng: 1 });

    expect(
      resolveRouteOrigin({
        userLocation: null,
        visits: [visits[1]],
        nextVisit: visits[1],
        tripOrigin: { lat: 9, lng: 9 },
      })
    ).toEqual({ lat: 9, lng: 9 });

    expect(
      resolveRouteOrigin({
        userLocation: null,
        visits: [visits[1]],
        nextVisit: visits[1],
        tripOrigin: null,
      })
    ).toBeNull();
  });
});

describe("sortVisitsForDay", () => {
  it("ordena por horário e sort_order", () => {
    const sorted = sortVisitsForDay([
      visit({ id: "c", title: "C", activity_time: "13:00", sort_order: 0 }),
      visit({ id: "a", title: "A", activity_time: "09:00", sort_order: 2 }),
      visit({ id: "b", title: "B", activity_time: "11:00", sort_order: 1 }),
    ]);
    expect(sorted.map((v) => v.id)).toEqual(["a", "b", "c"]);
  });
});

describe("findNextPendingVisit", () => {
  it("ignora completed/skipped e não usa horário passado", () => {
    const next = findNextPendingVisit([
      visit({
        id: "1",
        title: "Catetinho",
        activity_time: "09:00",
        visit_status: "completed",
        sort_order: 0,
      }),
      visit({
        id: "2",
        title: "Mané",
        activity_time: "11:00",
        visit_status: "pending",
        sort_order: 1,
      }),
      visit({
        id: "3",
        title: "Pontão",
        activity_time: "08:00",
        visit_status: "skipped",
        sort_order: 2,
      }),
    ]);
    expect(next?.id).toBe("2");
  });

  it("retorna null se tudo concluído/pulado", () => {
    expect(
      findNextPendingVisit([
        visit({ id: "1", title: "A", visit_status: "completed" }),
        visit({ id: "2", title: "B", visit_status: "skipped" }),
      ])
    ).toBeNull();
  });
});

describe("findLastCompletedVisit / findPreviousVisit", () => {
  const day = [
    visit({
      id: "1",
      title: "Catetinho",
      activity_time: "09:00",
      visit_status: "completed",
      lat: -15.9,
      lng: -47.9,
      sort_order: 0,
    }),
    visit({
      id: "2",
      title: "Mané",
      activity_time: "11:00",
      visit_status: "pending",
      lat: -15.78,
      lng: -47.89,
      sort_order: 1,
    }),
    visit({
      id: "3",
      title: "Pontão",
      activity_time: "13:00",
      visit_status: "pending",
      sort_order: 2,
    }),
  ];

  it("acha última concluída", () => {
    expect(findLastCompletedVisit(day)?.id).toBe("1");
  });

  it("acha visita anterior na ordem", () => {
    expect(findPreviousVisit(day, "2")?.id).toBe("1");
    expect(findPreviousVisit(day, "1")).toBeNull();
  });
});

describe("shouldComputeRoutesForDay", () => {
  it("só no dia do roteiro", () => {
    expect(
      shouldComputeRoutesForDay({
        dayDate: "2026-08-05",
        todayIso: "2026-08-04",
      })
    ).toBe(false);
    expect(
      shouldComputeRoutesForDay({
        dayDate: "2026-08-05",
        todayIso: "2026-08-05",
      })
    ).toBe(true);
    expect(
      shouldComputeRoutesForDay({ dayDate: null, todayIso: "2026-08-05" })
    ).toBe(false);
  });
});

describe("isPastDay", () => {
  it("marca apenas dias anteriores a hoje", () => {
    expect(isPastDay({ dayDate: "2026-08-04", todayIso: "2026-08-05" })).toBe(
      true
    );
    expect(isPastDay({ dayDate: "2026-08-05", todayIso: "2026-08-05" })).toBe(
      false
    );
    expect(isPastDay({ dayDate: "2026-08-06", todayIso: "2026-08-05" })).toBe(
      false
    );
    expect(isPastDay({ dayDate: null, todayIso: "2026-08-05" })).toBe(false);
  });

  it("ignora a parte de hora do timestamp", () => {
    expect(
      isPastDay({ dayDate: "2026-08-04T23:00:00Z", todayIso: "2026-08-05" })
    ).toBe(true);
  });
});

describe("computeLeaveByHHmm", () => {
  it("subtrai duração do horário de chegada", () => {
    // 11:00 − 34 min = 10:26
    expect(
      computeLeaveByHHmm({ arrivalHHmm: "11:00", durationSeconds: 34 * 60 })
    ).toBe("10:26");
  });
});

describe("buildDelayInsight", () => {
  it("on_time quando ainda dá tempo", () => {
    const insight = buildDelayInsight({
      arrivalHHmm: "11:00",
      durationSeconds: 34 * 60,
      nowMinutes: 10 * 60, // 10:00
    });
    expect(insight).toEqual({
      kind: "on_time",
      leaveByHHmm: "10:26",
      etaHHmm: "11:00",
      durationSeconds: 34 * 60,
    });
  });

  it("leave_now_late quando atraso", () => {
    const insight = buildDelayInsight({
      arrivalHHmm: "11:00",
      durationSeconds: 34 * 60,
      nowMinutes: 10 * 60 + 32, // 10:32 → eta 11:06
    });
    expect(insight?.kind).toBe("leave_now_late");
    if (insight?.kind === "leave_now_late") {
      expect(insight.delayMinutes).toBe(6);
      expect(insight.etaHHmm).toBe("11:06");
    }
  });
});

describe("resolveRouteOrigin", () => {
  const visits = [
    visit({
      id: "1",
      title: "A",
      activity_time: "09:00",
      visit_status: "completed",
      lat: 1,
      lng: 2,
    }),
    visit({
      id: "2",
      title: "B",
      activity_time: "11:00",
      visit_status: "pending",
      lat: 3,
      lng: 4,
    }),
  ];

  it("prioriza GPS do usuário", () => {
    expect(
      resolveRouteOrigin({
        userLocation: { lat: 9, lng: 9 },
        visits,
        nextVisit: visits[1],
        tripOrigin: { lat: 0, lng: 0 },
      })
    ).toEqual({ lat: 9, lng: 9 });
  });

  it("usa última concluída sem GPS", () => {
    expect(
      resolveRouteOrigin({
        userLocation: null,
        visits,
        nextVisit: visits[1],
        tripOrigin: { lat: 0, lng: 0 },
      })
    ).toEqual({ lat: 1, lng: 2 });
  });
});

describe("formatDurationFriendly", () => {
  it("formata minutos, horas e dias", () => {
    expect(formatDurationFriendly(34 * 60)).toBe("34 min");
    expect(formatDurationFriendly(72 * 60)).toBe("1h12");
    expect(formatDurationFriendly(60 * 60)).toBe("1h");
    expect(formatDurationFriendly(25 * 60 * 60)).toBe("1d 1h");
    expect(formatDurationFriendly(48 * 60 * 60)).toBe("2d");
  });
});
