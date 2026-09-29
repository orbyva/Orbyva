import { describe, expect, it } from "vitest";

import {
  listOrbTripTransfers,
  resolveTransferTimes,
} from "../tripTransfers";

describe("listOrbTripTransfers", () => {
  const stops = [
    {
      name: "Teresina",
      start_date: "2026-10-01",
      end_date: "2026-10-09",
      sort_order: 0,
    },
    {
      name: "Elesbão Veloso",
      start_date: "2026-10-10",
      end_date: "2026-10-15",
      sort_order: 1,
    },
  ];

  it("inclui ida, trecho entre paradas e volta", () => {
    const legs = listOrbTripTransfers({
      originLabel: "Valparaíso",
      outboundDepart: "03:30",
      interStopDepart: "08:00",
      stops,
    });
    expect(legs.map((l) => l.kind)).toEqual(["outbound", "inter", "return"]);
    expect(legs[1]).toMatchObject({
      kind: "inter",
      dayDate: "2026-10-10",
      originLabel: "Teresina",
      destinationLabel: "Elesbão Veloso",
      departHint: "08:00",
    });
    expect(legs[0]).toMatchObject({
      dayDate: "2026-10-01",
      departHint: "03:30",
      destinationLabel: "Teresina",
    });
    expect(legs[2]).toMatchObject({
      dayDate: "2026-10-15",
      originLabel: "Elesbão Veloso",
      destinationLabel: "Valparaíso",
    });
  });

  it("sem origem ainda gera deslocamento entre paradas", () => {
    const legs = listOrbTripTransfers({
      originLabel: null,
      outboundDepart: null,
      interStopDepart: "09:00",
      stops,
    });
    expect(legs).toHaveLength(1);
    expect(legs[0]?.kind).toBe("inter");
  });
});

describe("resolveTransferTimes", () => {
  const duasHoras = 2 * 3600;

  it("estima chegada a partir da saída + duração", () => {
    expect(
      resolveTransferTimes({
        departHint: "03:30",
        arriveHint: null,
        durationSeconds: duasHoras,
      })
    ).toEqual({ activity_time: "03:30", arrival_time: "05:30" });
  });

  it("estima saída a partir da chegada + duração", () => {
    expect(
      resolveTransferTimes({
        departHint: null,
        arriveHint: "11:00",
        durationSeconds: duasHoras,
      })
    ).toEqual({ activity_time: "09:00", arrival_time: "11:00" });
  });

  it("sem âncora usa defaultDepart + duração", () => {
    expect(
      resolveTransferTimes({
        departHint: null,
        arriveHint: null,
        durationSeconds: duasHoras,
        defaultDepart: "08:00",
      })
    ).toEqual({ activity_time: "08:00", arrival_time: "10:00" });
  });

  it("sem duração mantém só o que veio", () => {
    expect(
      resolveTransferTimes({
        departHint: "08:00",
        arriveHint: null,
        durationSeconds: null,
      })
    ).toEqual({ activity_time: "08:00", arrival_time: null });
  });
});
