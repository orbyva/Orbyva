import { describe, expect, it } from "vitest";

import {
  tripDayPlanAguardandoViagem,
  viagemConfirmadaNaConversa,
} from "../tripDayPlanGate";
import type { OrbProposal } from "../../../../supabase/functions/_shared/orb/actions.ts";

describe("tripDayPlanAguardandoViagem", () => {
  it("detecta roteiro sem trip_id com título pendente", () => {
    const proposta: OrbProposal = {
      kind: "trip_day_plan",
      label: "Roteiro do dia",
      fields: [],
      payload: {
        pending_trip_title: "Viagem para Piauí",
        plan_date: "2026-10-07",
        activities_json: "[]",
      },
    };
    expect(tripDayPlanAguardandoViagem(proposta)).toBe("Viagem para Piauí");
  });

  it("não aguarda quando já tem trip_id", () => {
    const proposta: OrbProposal = {
      kind: "trip_day_plan",
      label: "Roteiro do dia",
      fields: [],
      payload: {
        trip_id: "t-1",
        day_id: "d-1",
        pending_trip_title: "Viagem para Piauí",
        plan_date: "2026-10-07",
        activities_json: "[]",
      },
    };
    expect(tripDayPlanAguardandoViagem(proposta)).toBeNull();
  });
});

describe("viagemConfirmadaNaConversa", () => {
  const tripProposal: OrbProposal = {
    kind: "trip",
    label: "Nova viagem",
    fields: [],
    payload: {
      title: "Viagem para Piauí",
      start_date: "2026-10-01",
      end_date: "2026-10-15",
      status: "planning",
    },
  };

  it("só libera depois do cartão da viagem estar done", () => {
    const messages = [
      {
        tools: [
          {
            id: "call-trip",
            name: "propose_create",
            status: "ok",
            summary: tripProposal,
          },
        ],
      },
    ];
    expect(
      viagemConfirmadaNaConversa({
        titulo: "Viagem para Piauí",
        messages,
        proposalStates: {},
      })
    ).toBe(false);
    expect(
      viagemConfirmadaNaConversa({
        titulo: "Viagem para Piauí",
        messages,
        proposalStates: {
          "call-trip": { status: "done", message: "Viagem criada." },
        },
      })
    ).toBe(true);
  });
});
