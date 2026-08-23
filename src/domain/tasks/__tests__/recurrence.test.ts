import { describe, expect, it } from "vitest";
import {
  computeMissingOccurrences,
  computeVirtualOccurrences,
  formatRecurrenceSummary,
  resolveSeriesOriginId,
} from "@/domain/tasks/recurrence";

describe("computeMissingOccurrences", () => {
  it("gera ocorrências diárias faltantes até hoje", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1 },
      [],
      "2026-08-04"
    );
    expect(result).toEqual(["2026-08-02", "2026-08-03", "2026-08-04"]);
  });

  it("não gera ocorrências além de hoje", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1 },
      [],
      "2026-08-01"
    );
    expect(result).toEqual([]);
  });

  it("pula datas já existentes", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1 },
      ["2026-08-02"],
      "2026-08-03"
    );
    expect(result).toEqual(["2026-08-03"]);
  });

  it("respeita intervalo semanal", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "weekly", interval: 1 },
      [],
      "2026-08-20"
    );
    expect(result).toEqual(["2026-08-08", "2026-08-15"]);
  });

  it("respeita intervalo mensal", () => {
    const result = computeMissingOccurrences(
      "2026-01-31",
      { frequency: "monthly", interval: 1 },
      [],
      "2026-04-01"
    );
    expect(result).toEqual(["2026-03-03"]);
  });

  it("para no limite `until`", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1, until: "2026-08-02" },
      [],
      "2026-08-10"
    );
    expect(result).toEqual(["2026-08-02"]);
  });

  it("rejeita interval zero", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 0 },
      [],
      "2026-08-10"
    );
    expect(result).toEqual([]);
  });

  it("rejeita interval negativo", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: -1 },
      [],
      "2026-08-10"
    );
    expect(result).toEqual([]);
  });

  it("gera ocorrências semanais em dias da semana específicos (terça e quinta)", () => {
    // 2026-08-01 é sábado; terça=2, quinta=4
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "weekly", interval: 1, weekdays: [2, 4] },
      [],
      "2026-08-20"
    );
    expect(result).toEqual([
      "2026-08-04",
      "2026-08-06",
      "2026-08-11",
      "2026-08-13",
      "2026-08-18",
      "2026-08-20",
    ]);
  });

  it("respeita intervalo de N semanas com dias da semana específicos", () => {
    // 2026-08-04 é terça; a cada 2 semanas, só terça
    const result = computeMissingOccurrences(
      "2026-08-04",
      { frequency: "weekly", interval: 2, weekdays: [2] },
      [],
      "2026-09-01"
    );
    expect(result).toEqual(["2026-08-18", "2026-09-01"]);
  });

  it("sem weekdays, mantém o comportamento semanal antigo (regressão)", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "weekly", interval: 1, weekdays: [] },
      [],
      "2026-08-20"
    );
    expect(result).toEqual(["2026-08-08", "2026-08-15"]);
  });

  it("pula datas de dias da semana já existentes", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "weekly", interval: 1, weekdays: [2, 4] },
      ["2026-08-04"],
      "2026-08-06"
    );
    expect(result).toEqual(["2026-08-06"]);
  });

  it("gera ocorrências anuais", () => {
    const result = computeMissingOccurrences(
      "2024-08-01",
      { frequency: "yearly", interval: 1 },
      [],
      "2027-08-01"
    );
    expect(result).toEqual(["2025-08-01", "2026-08-01", "2027-08-01"]);
  });

  it("mensal no enésimo dia da semana (terceira terça-feira)", () => {
    // 2026-08-18 é a 3ª terça-feira de agosto
    const result = computeMissingOccurrences(
      "2026-08-18",
      { frequency: "monthly", interval: 1, monthlyMode: "weekday" },
      [],
      "2026-11-20"
    );
    expect(result).toEqual(["2026-09-15", "2026-10-20", "2026-11-17"]);
  });

  it("mensal no enésimo dia da semana respeita intervalo de N meses", () => {
    const result = computeMissingOccurrences(
      "2026-08-18",
      { frequency: "monthly", interval: 2, monthlyMode: "weekday" },
      [],
      "2027-02-01"
    );
    expect(result).toEqual(["2026-10-20", "2026-12-15"]);
  });

  it("mensal no último dia da semana do mês", () => {
    // 2026-08-25 é a última terça-feira de agosto (2026-09-01 já é setembro)
    const result = computeMissingOccurrences(
      "2026-08-25",
      { frequency: "monthly", interval: 1, monthlyMode: "weekday" },
      [],
      "2026-11-30"
    );
    expect(result).toEqual(["2026-09-29", "2026-10-27", "2026-11-24"]);
  });

  it("mensal por dia do mês continua sendo o padrão sem monthlyMode (regressão)", () => {
    const result = computeMissingOccurrences(
      "2026-01-31",
      { frequency: "monthly", interval: 1 },
      [],
      "2026-04-01"
    );
    expect(result).toEqual(["2026-03-03"]);
  });

  it("termina depois de N ocorrências (count)", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1, count: 3 },
      [],
      "2026-08-10"
    );
    // origem (2026-08-01) já conta como a 1ª; só faltam 2 novas
    expect(result).toEqual(["2026-08-02", "2026-08-03"]);
  });

  it("count considera ocorrências já materializadas", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1, count: 3 },
      ["2026-08-02"],
      "2026-08-10"
    );
    expect(result).toEqual(["2026-08-03"]);
  });

  it("count zero ou nulo não limita (comportamento normal)", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1, count: null },
      [],
      "2026-08-03"
    );
    expect(result).toEqual(["2026-08-02", "2026-08-03"]);
  });
});

describe("computeVirtualOccurrences", () => {
  it("gera ocorrência futura ainda não materializada (a cada 15 dias)", () => {
    const result = computeVirtualOccurrences(
      [
        {
          id: "origin",
          due_date: "2026-08-10",
          recurrence_rule: { frequency: "daily", interval: 15 },
          recurrence_origin_id: null,
        },
      ],
      "2026-08-31"
    );
    expect(result).toEqual([{ originId: "origin", dueDate: "2026-08-25" }]);
  });

  it("não duplica ocorrência já materializada", () => {
    const result = computeVirtualOccurrences(
      [
        {
          id: "origin",
          due_date: "2026-08-10",
          recurrence_rule: { frequency: "daily", interval: 15 },
          recurrence_origin_id: null,
        },
        {
          id: "instance-1",
          due_date: "2026-08-25",
          recurrence_rule: null,
          recurrence_origin_id: "origin",
        },
      ],
      "2026-08-31"
    );
    expect(result).toEqual([]);
  });

  it("ignora tarefas sem recorrência", () => {
    const result = computeVirtualOccurrences(
      [{ id: "1", due_date: "2026-08-10", recurrence_rule: null, recurrence_origin_id: null }],
      "2026-08-31"
    );
    expect(result).toEqual([]);
  });

  it("ignora instâncias já materializadas de uma série (não são origem)", () => {
    const result = computeVirtualOccurrences(
      [
        {
          id: "instance-1",
          due_date: "2026-08-25",
          recurrence_rule: null,
          recurrence_origin_id: "origin",
        },
      ],
      "2026-08-31"
    );
    expect(result).toEqual([]);
  });

  it("respeita `until` ao gerar preview", () => {
    const result = computeVirtualOccurrences(
      [
        {
          id: "origin",
          due_date: "2026-08-01",
          recurrence_rule: { frequency: "daily", interval: 15, until: "2026-08-20" },
          recurrence_origin_id: null,
        },
      ],
      "2026-09-30"
    );
    // próxima ocorrência (08-16) cai dentro de `until`; a seguinte (08-31) já não
    expect(result).toEqual([{ originId: "origin", dueDate: "2026-08-16" }]);
  });

  /**
   * Feature 074 — a duplicação que o usuário viu na agenda. A origem de uma medicação backfillada
   * pela 064 (`20260816233000_medication_backfill.sql`) **mantém** `recurrence_rule` e ganha
   * `medication_id`. Quem gera as doses dela é `materializeMedicationDoses`/`computeVirtualDoses`,
   * então emitir ocorrência virtual aqui desenharia a mesma dose duas vezes no mesmo dia.
   *
   * É a mesma regra do filtro `!task.medication_id` de `materializeRecurringInstances`
   * (`src/api/tasks/tasks.ts`), que existia só naquele caminho.
   */
  it("ignora origem de medicação (`medication_id`), que quem materializa é a dose", () => {
    const result = computeVirtualOccurrences(
      [
        {
          id: "origem-semtri",
          due_date: "2026-08-17",
          recurrence_rule: { frequency: "daily", interval: 1, time: "08:00" },
          recurrence_origin_id: null,
          medication_id: "med-1",
        },
        // A dose real do dia seguinte, como `materializeMedicationDoses` a grava: sem
        // `recurrence_origin_id`, portanto invisível para a deduplicação daqui.
        {
          id: "dose-18",
          due_date: "2026-08-18",
          recurrence_rule: null,
          recurrence_origin_id: null,
          medication_id: "med-1",
        },
      ],
      "2026-08-31"
    );
    expect(result).toEqual([]);
  });

  it("continua gerando preview de série recorrente comum (`medication_id` nulo)", () => {
    const result = computeVirtualOccurrences(
      [
        {
          id: "origin",
          due_date: "2026-08-17",
          recurrence_rule: { frequency: "daily", interval: 7 },
          recurrence_origin_id: null,
          medication_id: null,
        },
      ],
      "2026-08-31"
    );
    expect(result).toEqual([
      { originId: "origin", dueDate: "2026-08-24" },
      { originId: "origin", dueDate: "2026-08-31" },
    ]);
  });
});

describe("resolveSeriesOriginId", () => {
  it("devolve o próprio id quando a tarefa é a origem da série", () => {
    expect(
      resolveSeriesOriginId({
        id: "origin",
        recurrence_rule: { frequency: "weekly", interval: 1 },
        recurrence_origin_id: null,
      })
    ).toBe("origin");
  });

  it("devolve a origem quando a tarefa é uma ocorrência materializada", () => {
    expect(
      resolveSeriesOriginId({
        id: "instance-3",
        recurrence_rule: null,
        recurrence_origin_id: "origin",
      })
    ).toBe("origin");
  });

  it("devolve a origem para ocorrência vinculada à Recorrência Financeira", () => {
    // `materializeLinkedInstances` grava `recurrence_origin_id` junto com `linked_recurring_id`,
    // então a série financeira cai no mesmo escopo sem tratamento próprio.
    expect(
      resolveSeriesOriginId({
        id: "parcela-2",
        recurrence_rule: null,
        recurrence_origin_id: "template",
      })
    ).toBe("template");
  });

  it("devolve null para dose de medicação", () => {
    expect(
      resolveSeriesOriginId({
        id: "dose-1",
        recurrence_rule: null,
        recurrence_origin_id: null,
      })
    ).toBeNull();
  });

  it("devolve null para tarefa avulsa", () => {
    expect(resolveSeriesOriginId({ id: "avulsa" })).toBeNull();
  });
});

/**
 * Feature 080 — o resumo textual que o botão de recorrência do painel denso mostra. A
 * configuração saiu para um modal, então o estado precisa continuar legível **sem** abrir o modal.
 */
describe("formatRecurrenceSummary", () => {
  it("sem regra e sem vínculo: 'Não se repete'", () => {
    expect(
      formatRecurrenceSummary({ recurrence_rule: null, linked_recurring_id: null })
    ).toBe("Não se repete");
  });

  it("diária a cada 1 dia", () => {
    expect(
      formatRecurrenceSummary({
        recurrence_rule: { frequency: "daily", interval: 1 },
        due_date: "2026-08-20",
      })
    ).toBe("A cada 1 dia");
  });

  it("diária a cada 3 dias pluraliza a unidade", () => {
    expect(
      formatRecurrenceSummary({
        recurrence_rule: { frequency: "daily", interval: 3 },
        due_date: "2026-08-20",
      })
    ).toBe("A cada 3 dias");
  });

  it("semanal com dias da semana lista os dias", () => {
    expect(
      formatRecurrenceSummary({
        recurrence_rule: { frequency: "weekly", interval: 1, weekdays: [1, 3] },
        due_date: "2026-08-20",
      })
    ).toBe("A cada 1 semana, seg e qua");
  });

  it("semanal com três dias usa vírgula e 'e' no último", () => {
    expect(
      formatRecurrenceSummary({
        recurrence_rule: { frequency: "weekly", interval: 2, weekdays: [1, 3, 5] },
        due_date: "2026-08-20",
      })
    ).toBe("A cada 2 semanas, seg, qua e sex");
  });

  it("semanal sem dias marcados não inventa lista", () => {
    expect(
      formatRecurrenceSummary({
        recurrence_rule: { frequency: "weekly", interval: 1 },
        due_date: "2026-08-20",
      })
    ).toBe("A cada 1 semana");
  });

  it("mensal por dia do mês usa a data de prazo", () => {
    expect(
      formatRecurrenceSummary({
        recurrence_rule: { frequency: "monthly", interval: 1 },
        due_date: "2026-06-15",
      })
    ).toBe("Todo dia 15");
  });

  it("mensal por dia-da-semana descreve a posição no mês", () => {
    // 2026-06-16 é a terceira terça-feira de junho/2026.
    expect(
      formatRecurrenceSummary({
        recurrence_rule: { frequency: "monthly", interval: 1, monthlyMode: "weekday" },
        due_date: "2026-06-16",
      })
    ).toBe("Na terceira terça-feira");
  });

  it("mensal com intervalo maior que 1 mostra o intervalo e o dia", () => {
    expect(
      formatRecurrenceSummary({
        recurrence_rule: { frequency: "monthly", interval: 2 },
        due_date: "2026-06-15",
      })
    ).toBe("A cada 2 meses, no dia 15");
  });

  it("com `until` acrescenta a data de término em dd/MM/yyyy", () => {
    expect(
      formatRecurrenceSummary({
        recurrence_rule: { frequency: "monthly", interval: 1, until: "2026-06-30" },
        due_date: "2026-01-15",
      })
    ).toBe("Todo dia 15, até 30/06/2026");
  });

  it("com `count` acrescenta o número de ocorrências", () => {
    expect(
      formatRecurrenceSummary({
        recurrence_rule: { frequency: "daily", interval: 1, count: 5 },
        due_date: "2026-08-20",
      })
    ).toBe("A cada 1 dia, 5 ocorrências");
  });

  it("`count` 1 fica no singular", () => {
    expect(
      formatRecurrenceSummary({
        recurrence_rule: { frequency: "daily", interval: 1, count: 1 },
        due_date: "2026-08-20",
      })
    ).toBe("A cada 1 dia, 1 ocorrência");
  });

  it("anual", () => {
    expect(
      formatRecurrenceSummary({
        recurrence_rule: { frequency: "yearly", interval: 1 },
        due_date: "2026-08-20",
      })
    ).toBe("A cada 1 ano");
  });

  it("vinculada a Recorrência Financeira mostra a descrição entre aspas", () => {
    expect(
      formatRecurrenceSummary(
        { recurrence_rule: null, linked_recurring_id: "rec-1" },
        "Aluguel"
      )
    ).toBe("Vinculada a «Aluguel»");
  });

  it("vinculada sem descrição conhecida cai no genérico", () => {
    expect(
      formatRecurrenceSummary({ recurrence_rule: null, linked_recurring_id: "rec-1" })
    ).toBe("Vinculada a «Recorrência Financeira»");
  });

  it("o vínculo tem precedência sobre uma regra remanescente", () => {
    expect(
      formatRecurrenceSummary(
        {
          recurrence_rule: { frequency: "daily", interval: 1 },
          linked_recurring_id: "rec-1",
        },
        "Aluguel"
      )
    ).toBe("Vinculada a «Aluguel»");
  });
});
