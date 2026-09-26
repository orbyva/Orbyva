import { describe, expect, it } from "vitest";
import { resolveDeleteScope } from "@/domain/tasks/taskDelete";

/**
 * Feature 075 — a decisão de **o que** vai ser apagado, provada sem Supabase e sem navegador.
 *
 * O caso que justifica a função existir é o da medicação backfillada: a mesma linha é origem de
 * série e dose, e o escopo correto é a união `id = origem OR recurrence_origin_id = origem OR
 * medication_id = <med>`. Olhar só um dos lados deixa linhas para trás e a materialização seguinte
 * devolve o resto para a tela — o "apago e volta" que o usuário reportou.
 */

const REGRA = { frequency: "daily", interval: 1 } as const;

/** Dose criada por `materializeMedicationDoses` (064): só `medication_id`, sem série nenhuma. */
const dose = { id: "dose-1", medication_id: "med-1" };

/** Tarefa-origem depois do backfill 049→064: série **e** dose ao mesmo tempo. */
const origemBackfilled = {
  id: "origem-med",
  recurrence_rule: REGRA,
  medication_id: "med-1",
};

describe("resolveDeleteScope — dose de medicação", () => {
  it("'encerrar o tratamento' só alcança o futuro ainda não tomado, e avisa quem chama", () => {
    expect(resolveDeleteScope(dose, { mode: "end-treatment" })).toEqual({
      kind: "doses",
      taskId: "dose-1",
      originId: null,
      medicationId: "med-1",
      onlyFuture: true,
      includeCompleted: false,
      // Sem isto o chamador apagaria as doses e a próxima `fetchTasks` recriaria todas.
      endsTreatment: true,
    });
  });

  it("'todas as doses' sem marcar o checkbox preserva o que já foi tomado", () => {
    expect(resolveDeleteScope(dose, { mode: "all-doses" })).toMatchObject({
      kind: "doses",
      medicationId: "med-1",
      onlyFuture: false,
      includeCompleted: false,
      endsTreatment: false,
    });
  });

  it("'todas as doses' com o checkbox marcado é o que libera apagar as concluídas", () => {
    expect(
      resolveDeleteScope(dose, { mode: "all-doses", includeCompleted: true })
    ).toMatchObject({ includeCompleted: true, onlyFuture: false });
  });

  it("marcar 'incluir as tomadas' não afeta 'encerrar o tratamento'", () => {
    // O checkbox é da terceira ação; a recomendada continua sendo só-futuras-não-tomadas.
    expect(
      resolveDeleteScope(dose, { mode: "end-treatment", includeCompleted: true })
    ).toMatchObject({ onlyFuture: true, includeCompleted: false });
  });

  it("origem backfillada: o escopo é a união de série e tratamento", () => {
    expect(resolveDeleteScope(origemBackfilled, { mode: "all-doses" })).toMatchObject({
      kind: "doses",
      // `id = origem-med OR recurrence_origin_id = origem-med` — as ocorrências antigas da 049 …
      originId: "origem-med",
      // … e `medication_id = med-1` — as doses novas da 064, que nascem sem `recurrence_origin_id`.
      medicationId: "med-1",
    });
  });

  it("ocorrência antiga marcada pelo backfill resolve para a mesma origem", () => {
    expect(
      resolveDeleteScope(
        { id: "oco-antiga", recurrence_origin_id: "origem-med", medication_id: "med-1" },
        { mode: "all-doses" }
      )
    ).toMatchObject({ kind: "doses", originId: "origem-med", medicationId: "med-1" });
  });

  it("a origem backfillada não cai na variante de recorrência simples", () => {
    // `mode: "series"` apagaria só o lado `recurrence_origin_id`, deixando as doses da 064 de pé.
    expect(resolveDeleteScope(origemBackfilled, { mode: "series" })).toMatchObject({
      kind: "single",
      taskId: "origem-med",
    });
  });
});

describe("resolveDeleteScope — recorrência simples", () => {
  it("ocorrência materializada resolve para a origem da série", () => {
    expect(
      resolveDeleteScope({ id: "oco-2", recurrence_origin_id: "origem" }, { mode: "series" })
    ).toEqual({
      kind: "series",
      taskId: "oco-2",
      originId: "origem",
      medicationId: null,
      onlyFuture: false,
      // A série inteira sai, inclusive as ocorrências já concluídas — é o que "todas as
      // ocorrências" significa desde a feature 028.
      includeCompleted: true,
      endsTreatment: false,
    });
  });

  it("a própria origem ancora a série em si mesma", () => {
    expect(
      resolveDeleteScope({ id: "origem", recurrence_rule: REGRA }, { mode: "series" })
    ).toMatchObject({ kind: "series", originId: "origem" });
  });

  it("'apagar só esta' numa ocorrência continua sendo uma linha só", () => {
    expect(
      resolveDeleteScope({ id: "oco-2", recurrence_origin_id: "origem" }, { mode: "single" })
    ).toMatchObject({ kind: "single", taskId: "oco-2", originId: null, medicationId: null });
  });
});

describe("resolveDeleteScope — degradação para exclusão única", () => {
  it("tarefa avulsa nunca vira exclusão em massa, mesmo pedindo 'series'", () => {
    expect(resolveDeleteScope({ id: "avulsa" }, { mode: "series" })).toMatchObject({
      kind: "single",
      taskId: "avulsa",
    });
  });

  it("tarefa avulsa pedindo 'all-doses' também cai em única (não há tratamento)", () => {
    expect(resolveDeleteScope({ id: "avulsa" }, { mode: "all-doses" })).toMatchObject({
      kind: "single",
      medicationId: null,
    });
  });

  it("parcela de Recorrência Financeira continua com exclusão única", () => {
    // Elas têm sync bidirecional próprio (`syncLinkedInstallmentFromTask`); apagar a série aqui
    // deixaria a Recorrência Financeira falando de parcelas que não existem mais.
    expect(
      resolveDeleteScope(
        { id: "parcela-2", recurrence_origin_id: "template", linked_recurring_id: "rec-1" },
        { mode: "series" }
      )
    ).toMatchObject({ kind: "single", taskId: "parcela-2" });
  });

  it("o modo 'single' de uma dose apaga a linha e nada além dela", () => {
    expect(resolveDeleteScope(dose, { mode: "single" })).toMatchObject({
      kind: "single",
      taskId: "dose-1",
      medicationId: null,
      endsTreatment: false,
    });
  });
});
