import { describe, expect, it } from "vitest";
import {
  computeMissingDoses,
  computeStaleDoses,
  computeVirtualDoses,
  formatDoseTitle,
  formatPosology,
  medicationTimes,
  normalizeTime,
} from "@/domain/health/medication";
import type { Medication } from "@/types/health";

function medication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    name: "Losartana",
    times: ["08:00"],
    interval_days: 1,
    started_on: "2026-08-10",
    ended_on: null,
    active: true,
    ...overrides,
  };
}

describe("normalizeTime", () => {
  it("achata HH:MM:SS do Postgres e HH:MM do input no mesmo formato", () => {
    expect(normalizeTime("08:00:00")).toBe("08:00");
    expect(normalizeTime("08:00")).toBe("08:00");
    expect(normalizeTime("8:00")).toBe("08:00");
    expect(normalizeTime("20:00:00.000")).toBe("20:00");
  });

  it("devolve null pro que não é horário", () => {
    expect(normalizeTime(null)).toBeNull();
    expect(normalizeTime("")).toBeNull();
    expect(normalizeTime("manhã")).toBeNull();
  });
});

describe("medicationTimes", () => {
  it("normaliza, deduplica e ordena", () => {
    expect(medicationTimes({ times: ["20:00:00", "08:00", "20:00"] })).toEqual([
      "08:00",
      "20:00",
    ]);
  });
});

describe("computeMissingDoses", () => {
  it("gera uma dose por (data × horário) — múltiplos horários por dia", () => {
    const missing = computeMissingDoses(
      medication({ times: ["08:00", "20:00"], started_on: "2026-08-15" }),
      [],
      "2026-08-17"
    );

    expect(missing).toEqual([
      { date: "2026-08-15", time: "08:00" },
      { date: "2026-08-15", time: "20:00" },
      { date: "2026-08-16", time: "08:00" },
      { date: "2026-08-16", time: "20:00" },
      { date: "2026-08-17", time: "08:00" },
      { date: "2026-08-17", time: "20:00" },
    ]);
  });

  it("respeita interval_days > 1 (a cada 2 dias, a partir do início)", () => {
    const missing = computeMissingDoses(
      medication({ interval_days: 2, started_on: "2026-08-11" }),
      [],
      "2026-08-16"
    );

    expect(missing.map((slot) => slot.date)).toEqual([
      "2026-08-11",
      "2026-08-13",
      "2026-08-15",
    ]);
  });

  it("para em ended_on no passado, sem gerar nada depois do fim do tratamento", () => {
    const missing = computeMissingDoses(
      medication({ started_on: "2026-08-10", ended_on: "2026-08-12" }),
      [],
      "2026-08-20"
    );

    expect(missing.map((slot) => slot.date)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
  });

  it("tratamento inativo não gera dose nenhuma, nem retroativa", () => {
    expect(
      computeMissingDoses(medication({ active: false }), [], "2026-08-20")
    ).toEqual([]);
  });

  it("não repete dose já materializada, mesmo com dose_time em HH:MM:SS", () => {
    const missing = computeMissingDoses(
      medication({ times: ["08:00", "20:00"], started_on: "2026-08-16" }),
      [
        { due_date: "2026-08-16", dose_time: "08:00:00" },
        { due_date: "2026-08-16", dose_time: "20:00:00" },
        { due_date: "2026-08-17", dose_time: "08:00:00" },
      ],
      "2026-08-17"
    );

    // Só a dose das 20:00 de hoje ficou faltando — é o guard contra dose duplicada no calendário.
    expect(missing).toEqual([{ date: "2026-08-17", time: "20:00" }]);
  });

  it("rodar de novo com o resultado já inserido devolve lista vazia (idempotente)", () => {
    const med = medication({ times: ["08:00", "20:00"], started_on: "2026-08-16" });
    const first = computeMissingDoses(med, [], "2026-08-17");
    const materialized = first.map((slot) => ({
      due_date: slot.date,
      dose_time: `${slot.time}:00`,
    }));

    expect(computeMissingDoses(med, materialized, "2026-08-17")).toEqual([]);
  });

  it("tratamento que ainda não começou não gera dose", () => {
    expect(
      computeMissingDoses(medication({ started_on: "2026-09-01" }), [], "2026-08-17")
    ).toEqual([]);
  });

  it("tratamento sem horário nenhum não gera dose", () => {
    expect(computeMissingDoses(medication({ times: [] }), [], "2026-08-17")).toEqual([]);
  });
});

describe("computeVirtualDoses", () => {
  it("preenche a janela futura a cada N dias, sem incluir hoje", () => {
    // Início 15/08, a cada 2 dias → 15, 17, 19, 21, 23. Hoje é 19: só 21 e 23 são futuro.
    const virtual = computeVirtualDoses(
      medication({ interval_days: 2, started_on: "2026-08-15", times: ["08:00"] }),
      [],
      "2026-08-24",
      "2026-08-19"
    );

    expect(virtual).toEqual([
      { date: "2026-08-21", time: "08:00" },
      { date: "2026-08-23", time: "08:00" },
    ]);
  });

  it("gera uma dose por horário em cada dia futuro da janela", () => {
    const virtual = computeVirtualDoses(
      medication({ times: ["08:00", "20:00"], started_on: "2026-08-19" }),
      [],
      "2026-08-21",
      "2026-08-19"
    );

    expect(virtual).toEqual([
      { date: "2026-08-20", time: "08:00" },
      { date: "2026-08-20", time: "20:00" },
      { date: "2026-08-21", time: "08:00" },
      { date: "2026-08-21", time: "20:00" },
    ]);
  });

  it("`ended_on` dentro da janela corta o resto", () => {
    const virtual = computeVirtualDoses(
      medication({ started_on: "2026-08-19", ended_on: "2026-08-21" }),
      [],
      "2026-08-26",
      "2026-08-19"
    );

    expect(virtual.map((slot) => slot.date)).toEqual(["2026-08-20", "2026-08-21"]);
  });

  it("tratamento inativo não gera nada", () => {
    expect(
      computeVirtualDoses(medication({ active: false }), [], "2026-08-26", "2026-08-19")
    ).toEqual([]);
  });

  it("dose já materializada não aparece de novo como virtual", () => {
    const virtual = computeVirtualDoses(
      medication({ times: ["08:00", "20:00"], started_on: "2026-08-19" }),
      [{ due_date: "2026-08-20", dose_time: "08:00:00" }],
      "2026-08-20",
      "2026-08-19"
    );

    expect(virtual).toEqual([{ date: "2026-08-20", time: "20:00" }]);
  });

  it("janela que termina hoje devolve vazio — o passado é da materialização", () => {
    expect(
      computeVirtualDoses(medication({ started_on: "2026-08-10" }), [], "2026-08-19", "2026-08-19")
    ).toEqual([]);
  });

  it("tratamento que começa depois da janela não gera nada", () => {
    expect(
      computeVirtualDoses(medication({ started_on: "2026-09-01" }), [], "2026-08-26", "2026-08-19")
    ).toEqual([]);
  });

  it("tratamento que começa no futuro, dentro da janela, gera a partir do início", () => {
    const virtual = computeVirtualDoses(
      medication({ started_on: "2026-08-22" }),
      [],
      "2026-08-24",
      "2026-08-19"
    );

    expect(virtual.map((slot) => slot.date)).toEqual([
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
    ]);
  });

  it("tratamento contínuo começado há anos ainda alcança a janela visível", () => {
    const virtual = computeVirtualDoses(
      medication({ started_on: "2020-01-01" }),
      [],
      "2026-08-21",
      "2026-08-19"
    );

    expect(virtual.map((slot) => slot.date)).toEqual(["2026-08-20", "2026-08-21"]);
  });

  it("sem horário cadastrado não há o que sintetizar", () => {
    expect(
      computeVirtualDoses(medication({ times: [] }), [], "2026-08-26", "2026-08-19")
    ).toEqual([]);
  });
});

describe("formatDoseTitle", () => {
  it("junta nome, quantidade e unidade", () => {
    expect(
      formatDoseTitle({ name: "Losartana", dose_amount: 2, dose_unit: "comprimidos" })
    ).toBe("Losartana 2 comprimidos");
  });

  it("sem posologia devolve só o nome (o caso das medicações migradas da 049)", () => {
    expect(formatDoseTitle({ name: "Losartana", dose_amount: null, dose_unit: null })).toBe(
      "Losartana"
    );
  });

  it("aceita quantidade sem unidade e unidade sem quantidade", () => {
    expect(formatDoseTitle({ name: "Vitamina D", dose_amount: 2, dose_unit: null })).toBe(
      "Vitamina D 2"
    );
    expect(formatDoseTitle({ name: "Insulina", dose_amount: null, dose_unit: "UI" })).toBe(
      "Insulina UI"
    );
  });

  it("não inventa casa decimal", () => {
    expect(
      formatDoseTitle({ name: "Dipirona", dose_amount: 500, dose_unit: "mg" })
    ).toBe("Dipirona 500 mg");
    expect(
      formatDoseTitle({ name: "Dipirona", dose_amount: 0.5, dose_unit: "mg" })
    ).toBe("Dipirona 0,5 mg");
  });
});

describe("formatPosology", () => {
  it("resume posologia, horários e cadência numa linha", () => {
    expect(
      formatPosology(
        medication({
          dose_amount: 2,
          dose_unit: "comprimidos",
          times: ["08:00", "20:00"],
        })
      )
    ).toBe("2 comprimidos · 08:00, 20:00 · todos os dias");
  });

  it("cadência maior que um dia aparece explícita", () => {
    expect(formatPosology(medication({ interval_days: 3 }))).toBe(
      "08:00 · a cada 3 dias"
    );
  });
});

/**
 * Feature 074 — reconciliar as doses ao editar o tratamento. Sem isto, mudar 08:00 para 09:00
 * deixava todas as doses futuras das 08:00 de pé e a materialização criava as das 09:00 ao lado:
 * duas doses por dia, para sempre.
 *
 * A regra que o arquivo inteiro protege: **passado e dose tomada são intocáveis**. Eles são o
 * histórico de adesão da 064.
 */
describe("computeStaleDoses", () => {
  const HOJE = "2026-08-20";

  /** Uma dose materializada, pendente por padrão. */
  function dose(overrides: Partial<Parameters<typeof computeStaleDoses>[1][number]> = {}) {
    return {
      id: "dose-1",
      due_date: "2026-08-25",
      dose_time: "08:00",
      status: "todo",
      completed_at: null,
      ...overrides,
    };
  }

  it("trocar o horário marca as futuras do horário velho, e só elas", () => {
    const stale = computeStaleDoses(
      medication({ times: ["09:00"] }),
      [
        dose({ id: "futura-velha", due_date: "2026-08-25", dose_time: "08:00" }),
        dose({ id: "futura-nova", due_date: "2026-08-25", dose_time: "09:00" }),
        dose({ id: "futura-velha-2", due_date: "2026-08-30", dose_time: "08:00" }),
      ],
      HOJE
    );
    expect(stale).toEqual(["futura-velha", "futura-velha-2"]);
  });

  it("dose passada nunca entra, mesmo com o horário fora da nova configuração", () => {
    const stale = computeStaleDoses(
      medication({ times: ["09:00"] }),
      [
        dose({ id: "ontem", due_date: "2026-08-19", dose_time: "08:00" }),
        dose({ id: "semana-passada", due_date: "2026-08-12", dose_time: "08:00" }),
        // A de hoje também fica: o dia está em curso e pode estar prestes a ser marcada.
        dose({ id: "hoje", due_date: HOJE, dose_time: "08:00" }),
      ],
      HOJE
    );
    expect(stale).toEqual([]);
  });

  it("dose futura já concluída nunca entra (adiantar a dose não some com o registro)", () => {
    const stale = computeStaleDoses(
      medication({ times: ["09:00"] }),
      [
        dose({ id: "tomada-status", due_date: "2026-08-25", dose_time: "08:00", status: "done" }),
        dose({
          id: "tomada-completed-at",
          due_date: "2026-08-26",
          dose_time: "08:00",
          status: "todo",
          completed_at: "2026-08-26T08:05:00Z",
        }),
        dose({ id: "pendente", due_date: "2026-08-27", dose_time: "08:00" }),
      ],
      HOJE
    );
    expect(stale).toEqual(["pendente"]);
  });

  it("encurtar `ended_on` marca as que caíram fora da janela", () => {
    const stale = computeStaleDoses(
      medication({ ended_on: "2026-08-24" }),
      [
        dose({ id: "dentro", due_date: "2026-08-23" }),
        dose({ id: "no-limite", due_date: "2026-08-24" }),
        dose({ id: "fora", due_date: "2026-08-25" }),
      ],
      HOJE
    );
    expect(stale).toEqual(["fora"]);
  });

  it("adiar `started_on` marca as que passaram a ficar antes do início", () => {
    const stale = computeStaleDoses(
      medication({ started_on: "2026-08-26" }),
      [
        dose({ id: "antes-do-inicio", due_date: "2026-08-25" }),
        dose({ id: "no-inicio", due_date: "2026-08-26" }),
      ],
      HOJE
    );
    expect(stale).toEqual(["antes-do-inicio"]);
  });

  it("aumentar `interval_days` marca os dias que saíram da cadência", () => {
    // Início 10/08, a cada 3 dias: 10, 13, 16, 19, 22, 25, 28…
    const stale = computeStaleDoses(
      medication({ interval_days: 3 }),
      [
        dose({ id: "21", due_date: "2026-08-21" }),
        dose({ id: "22", due_date: "2026-08-22" }),
        dose({ id: "23", due_date: "2026-08-23" }),
        dose({ id: "25", due_date: "2026-08-25" }),
      ],
      HOJE
    );
    expect(stale).toEqual(["21", "23"]);
  });

  it("tratamento encerrado marca todas as futuras pendentes", () => {
    const stale = computeStaleDoses(
      medication({ active: false }),
      [
        dose({ id: "futura", due_date: "2026-08-25" }),
        dose({ id: "futura-tomada", due_date: "2026-08-26", status: "done" }),
        dose({ id: "passada", due_date: "2026-08-19" }),
      ],
      HOJE
    );
    expect(stale).toEqual(["futura"]);
  });

  it("`dose_time` em HH:MM:SS compara igual a HH:MM (normalizeTime)", () => {
    const stale = computeStaleDoses(
      medication({ times: ["08:00"] }),
      [dose({ id: "postgres", due_date: "2026-08-25", dose_time: "08:00:00" })],
      HOJE
    );
    expect(stale).toEqual([]);
  });

  it("dose sem `dose_time` é obsoleta: não dá pra dizer a que horário do tratamento ela pertence", () => {
    const stale = computeStaleDoses(
      medication(),
      [dose({ id: "sem-horario", due_date: "2026-08-25", dose_time: null })],
      HOJE
    );
    expect(stale).toEqual(["sem-horario"]);
  });

  it("tratamento inalterado devolve vazio", () => {
    const stale = computeStaleDoses(
      medication({ times: ["08:00", "20:00"] }),
      [
        dose({ id: "a", due_date: "2026-08-25", dose_time: "08:00" }),
        dose({ id: "b", due_date: "2026-08-25", dose_time: "20:00" }),
        dose({ id: "c", due_date: "2026-08-26", dose_time: "08:00" }),
      ],
      HOJE
    );
    expect(stale).toEqual([]);
  });
});
