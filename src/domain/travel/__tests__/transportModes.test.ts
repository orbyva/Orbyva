import { describe, expect, it } from "vitest";
import {
  canEstimateTransferArrival,
  endpointsFromTransferTitle,
  estimateArrivalHHmm,
  estimateDepartHHmm,
  hasRequiredTransferEndpoints,
  normalizeTripTransportMode,
  routesModeForTransport,
  suggestedTransportMode,
  transferEndpointsTitle,
  transportModeHasBoarding,
} from "@/domain/travel/transportModes";

describe("normalizeTripTransportMode", () => {
  it("aceita modos conhecidos", () => {
    expect(normalizeTripTransportMode("flight")).toBe("flight");
    expect(normalizeTripTransportMode("car")).toBe("car");
  });

  it("fallback other", () => {
    expect(normalizeTripTransportMode(null)).toBe("other");
    expect(normalizeTripTransportMode("boat")).toBe("other");
  });
});

describe("suggestedTransportMode", () => {
  it("voo na troca de cidade", () => {
    expect(suggestedTransportMode(true)).toBe("flight");
    expect(suggestedTransportMode(false)).toBe("car");
  });
});

describe("transferEndpointsTitle", () => {
  it("monta Origem → Destino", () => {
    expect(transferEndpointsTitle("Alto Paraíso", "São Jorge")).toBe(
      "Alto Paraíso → São Jorge"
    );
  });
});

describe("endpointsFromTransferTitle", () => {
  it("extrai origem e destino", () => {
    expect(endpointsFromTransferTitle("Alto Paraíso → São Jorge")).toEqual({
      originLabel: "Alto Paraíso",
      destinationLabel: "São Jorge",
    });
  });

  it("null se não casar", () => {
    expect(endpointsFromTransferTitle("Deslocamento")).toBeNull();
  });
});

describe("hasRequiredTransferEndpoints", () => {
  it("exige ambos", () => {
    expect(hasRequiredTransferEndpoints("A", "B")).toBe(true);
    expect(hasRequiredTransferEndpoints("A", "  ")).toBe(false);
    expect(hasRequiredTransferEndpoints(null, "B")).toBe(false);
  });
});

describe("canEstimateTransferArrival", () => {
  it("só terra / superfície", () => {
    expect(canEstimateTransferArrival("car")).toBe(true);
    expect(canEstimateTransferArrival("train")).toBe(true);
    expect(canEstimateTransferArrival("bus")).toBe(true);
    expect(canEstimateTransferArrival("flight")).toBe(false);
    expect(canEstimateTransferArrival("other")).toBe(false);
  });
});

describe("routesModeForTransport", () => {
  it("mapeia para Google Routes", () => {
    expect(routesModeForTransport("car")).toBe("DRIVE");
    expect(routesModeForTransport("train")).toBe("TRANSIT");
    expect(routesModeForTransport("bus")).toBe("TRANSIT");
    expect(routesModeForTransport("flight")).toBeNull();
  });
});

describe("estimateArrivalHHmm", () => {
  it("soma duração à saída", () => {
    expect(estimateArrivalHHmm("10:00", 2.5 * 3600)).toBe("12:30");
  });

  it("quebra meia-noite", () => {
    expect(estimateArrivalHHmm("22:00", 3 * 3600)).toBe("01:00");
  });

  it("null com saída inválida", () => {
    expect(estimateArrivalHHmm("", 600)).toBeNull();
  });
});

describe("estimateDepartHHmm", () => {
  it("subtrai duração da chegada", () => {
    expect(estimateDepartHHmm("12:30", 2.5 * 3600)).toBe("10:00");
  });
});

describe("transportModeHasBoarding", () => {
  it("voo, trem e ônibus têm embarque", () => {
    expect(transportModeHasBoarding("flight")).toBe(true);
    expect(transportModeHasBoarding("train")).toBe(true);
    expect(transportModeHasBoarding("bus")).toBe(true);
  });

  it("carro e outro não — pedir horário de embarque ali é pedir nada", () => {
    expect(transportModeHasBoarding("car")).toBe(false);
    expect(transportModeHasBoarding("other")).toBe(false);
  });

  it("modo ausente ou desconhecido cai em other, logo sem embarque", () => {
    expect(transportModeHasBoarding(null)).toBe(false);
    expect(transportModeHasBoarding(undefined)).toBe(false);
    expect(transportModeHasBoarding("boat")).toBe(false);
  });
});
