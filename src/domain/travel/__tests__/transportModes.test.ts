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
