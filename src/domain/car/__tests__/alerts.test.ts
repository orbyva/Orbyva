import { describe, expect, it } from "vitest";
import {
  getMaintenanceAlerts,
  getMaintenanceSchedule,
  getDocumentAlerts,
  calculateFuelConsumption,
} from "@/domain/car";
import type { Maintenance, Vehicle, VehicleDocument } from "@/types/car";

const vehicle: Vehicle = {
  id: "v1",
  brand: "Toyota",
  model: "Corolla",
  current_km: 45_000,
};

const oilMaintenance: Maintenance = {
  id: "m1",
  vehicle_id: "v1",
  type: "oil",
  service_date: "2025-01-01",
  km_at_service: 40_000,
  next_km: 50_000,
  next_date: "2025-07-01",
};

describe("getMaintenanceSchedule", () => {
  it("marks item as upcoming when km is within warning threshold", () => {
    const nearVehicle = { ...vehicle, current_km: 49_200 };
    const futureOil: Maintenance = {
      ...oilMaintenance,
      next_date: "2027-01-01",
    };
    const schedule = getMaintenanceSchedule(nearVehicle, [futureOil]);
    const oil = schedule.find((s) => s.type === "oil");
    expect(oil?.status).toBe("upcoming");
    expect(oil?.kmRemaining).toBe(800);
  });

  it("marks item as overdue when km passed", () => {
    const overdueVehicle = { ...vehicle, current_km: 51_000 };
    const schedule = getMaintenanceSchedule(overdueVehicle, [oilMaintenance]);
    const oil = schedule.find((s) => s.type === "oil");
    expect(oil?.status).toBe("overdue");
  });

  it("shows none for types without records", () => {
    const schedule = getMaintenanceSchedule(vehicle, [oilMaintenance]);
    const tires = schedule.find((s) => s.type === "tires");
    expect(tires?.status).toBe("none");
  });
});

describe("getMaintenanceAlerts", () => {
  it("returns only upcoming and overdue items", () => {
    const nearVehicle = { ...vehicle, current_km: 49_200 };
    const alerts = getMaintenanceAlerts(nearVehicle, [oilMaintenance]);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((a) => a.status === "upcoming" || a.status === "overdue")).toBe(true);
  });
});

describe("getDocumentAlerts", () => {
  it("ignores paid documents", () => {
    const docs: VehicleDocument[] = [
      {
        id: "d1",
        vehicle_id: "v1",
        type: "ipva",
        due_date: "2020-01-01",
        paid: true,
      },
    ];
    expect(getDocumentAlerts(docs)).toHaveLength(0);
  });
});

describe("calculateFuelConsumption", () => {
  it("returns km/l between last two logs", () => {
    const consumption = calculateFuelConsumption([
      { date: "2025-01-01", km: 10_000, liters: 40 },
      { date: "2025-02-01", km: 10_500, liters: 45 },
    ]);
    expect(consumption).toBeCloseTo(11.11, 1);
  });

  it("returns null with fewer than 2 logs", () => {
    expect(
      calculateFuelConsumption([{ date: "2025-01-01", km: 10_000, liters: 40 }])
    ).toBeNull();
  });
});
