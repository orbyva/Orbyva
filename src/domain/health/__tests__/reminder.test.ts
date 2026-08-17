import { describe, expect, it } from "vitest";
import {
  isReminderDue,
  nextReminderAt,
  type ReminderSchedule,
} from "@/domain/health/reminder";

/**
 * Agendamento de lembrete (feature 063), puro. É a prova de que o lembrete cai na hora certa e
 * **não repete** — sem navegador (proibido pela skill `next`) e sem gravar uma linha por ocorrência
 * no banco: as ocorrências são calculadas aqui, como as das tarefas recorrentes.
 *
 * Todas as datas são locais (`new Date(ano, mês, dia, ...)`), como o app as monta, para o teste não
 * depender do fuso da máquina.
 */

function pref(over: Partial<ReminderSchedule> = {}): ReminderSchedule {
  return {
    frequency: "daily",
    time_of_day: "09:00",
    enabled: true,
    last_notified_at: null,
    // Segunda-feira, 10/08/2026 — âncora das cadências semanal e mensal.
    created_at: new Date(2026, 7, 10, 9, 0, 0).toISOString(),
    ...over,
  };
}

describe("nextReminderAt", () => {
  it("diário: antes do horário, é hoje; depois, é amanhã", () => {
    const daily = pref();

    expect(nextReminderAt(daily, new Date(2026, 7, 17, 7, 0))).toEqual(
      new Date(2026, 7, 17, 9, 0)
    );
    expect(nextReminderAt(daily, new Date(2026, 7, 17, 9, 30))).toEqual(
      new Date(2026, 7, 18, 9, 0)
    );
  });

  it("diário: exatamente no horário, o próximo é agora", () => {
    expect(nextReminderAt(pref(), new Date(2026, 7, 17, 9, 0))).toEqual(
      new Date(2026, 7, 17, 9, 0)
    );
  });

  it("semanal: cai no mesmo dia da semana da criação (segunda)", () => {
    const weekly = pref({ frequency: "weekly" });

    // Terça 11/08 → próxima segunda, 17/08.
    expect(nextReminderAt(weekly, new Date(2026, 7, 11, 10, 0))).toEqual(
      new Date(2026, 7, 17, 9, 0)
    );
    // Segunda 17/08 antes das 9h → hoje mesmo.
    expect(nextReminderAt(weekly, new Date(2026, 7, 17, 8, 0))).toEqual(
      new Date(2026, 7, 17, 9, 0)
    );
    // Segunda 17/08 depois das 9h → só na semana seguinte.
    expect(nextReminderAt(weekly, new Date(2026, 7, 17, 9, 1))).toEqual(
      new Date(2026, 7, 24, 9, 0)
    );
  });

  it("mensal: cai no mesmo dia do mês da criação (dia 10)", () => {
    const monthly = pref({ frequency: "monthly" });

    expect(nextReminderAt(monthly, new Date(2026, 7, 5, 12, 0))).toEqual(
      new Date(2026, 7, 10, 9, 0)
    );
    expect(nextReminderAt(monthly, new Date(2026, 7, 17, 12, 0))).toEqual(
      new Date(2026, 8, 10, 9, 0)
    );
    // Vira o ano sem tropeçar.
    expect(nextReminderAt(monthly, new Date(2026, 11, 20, 12, 0))).toEqual(
      new Date(2027, 0, 10, 9, 0)
    );
  });

  it("mensal ancorado no dia 31: em mês curto vai para o último dia, sem pular o mês", () => {
    const monthly = pref({
      frequency: "monthly",
      created_at: new Date(2026, 0, 31, 9, 0).toISOString(),
    });

    // Fevereiro de 2026 tem 28 dias.
    expect(nextReminderAt(monthly, new Date(2026, 1, 10, 12, 0))).toEqual(
      new Date(2026, 1, 28, 9, 0)
    );
  });

  it("sem time_of_day cai no padrão 09:00, e aceita o HH:MM:SS que o Postgres devolve", () => {
    expect(nextReminderAt(pref({ time_of_day: null }), new Date(2026, 7, 17, 7, 0))).toEqual(
      new Date(2026, 7, 17, 9, 0)
    );
    expect(
      nextReminderAt(pref({ time_of_day: "20:30:00" }), new Date(2026, 7, 17, 7, 0))
    ).toEqual(new Date(2026, 7, 17, 20, 30));
  });

  it("desligado não tem próximo lembrete", () => {
    expect(nextReminderAt(pref({ enabled: false }), new Date(2026, 7, 17, 7, 0))).toBeNull();
  });
});

describe("isReminderDue", () => {
  it("no horário: vencido", () => {
    expect(isReminderDue(pref(), new Date(2026, 7, 17, 9, 0))).toBe(true);
  });

  it("antes do horário (fora da tolerância): não vencido", () => {
    expect(isReminderDue(pref(), new Date(2026, 7, 17, 8, 0))).toBe(false);
  });

  it("diário perdido ontem não toca hoje de manhã: só vale o slot de hoje", () => {
    // Nunca notificado e o app ficou dias fechado — ainda assim, às 8h o lembrete de hoje (9h)
    // não chegou, e o de ontem não é ressuscitado.
    const neverNotified = pref({ last_notified_at: null });

    expect(isReminderDue(neverNotified, new Date(2026, 7, 17, 8, 0))).toBe(false);
    expect(isReminderDue(neverNotified, new Date(2026, 7, 17, 9, 0))).toBe(true);
  });

  it("dentro da tolerância antes do horário: já vencido, para não perder o slot por relógio", () => {
    // 8h56 + 5 min de tolerância alcança as 9h.
    expect(isReminderDue(pref(), new Date(2026, 7, 17, 8, 56))).toBe(true);
    // 8h54 não alcança.
    expect(isReminderDue(pref(), new Date(2026, 7, 17, 8, 54))).toBe(false);
  });

  it("depois da tolerância continua vencido: quem abre o app às 14h ainda é lembrado", () => {
    expect(isReminderDue(pref(), new Date(2026, 7, 17, 14, 0))).toBe(true);
  });

  it("já notificado no período: não repete (é o que impede o toast a cada recarga)", () => {
    const notified = pref({
      last_notified_at: new Date(2026, 7, 17, 9, 0, 30).toISOString(),
    });

    expect(isReminderDue(notified, new Date(2026, 7, 17, 14, 0))).toBe(false);
  });

  it("notificado ontem: vence de novo no slot de hoje", () => {
    const notified = pref({
      last_notified_at: new Date(2026, 7, 16, 9, 0, 30).toISOString(),
    });

    expect(isReminderDue(notified, new Date(2026, 7, 17, 9, 5))).toBe(true);
  });

  it("desligado nunca vence, mesmo com o horário passado", () => {
    expect(isReminderDue(pref({ enabled: false }), new Date(2026, 7, 17, 14, 0))).toBe(false);
  });

  it("não dispara retroativamente o slot anterior à criação da preferência", () => {
    const justCreated = pref({
      created_at: new Date(2026, 7, 17, 14, 0).toISOString(),
    });

    // Criada às 14h com horário das 9h: o slot das 9h de hoje é anterior a ela.
    expect(isReminderDue(justCreated, new Date(2026, 7, 17, 14, 1))).toBe(false);
    // No dia seguinte, às 9h, vence normalmente.
    expect(isReminderDue(justCreated, new Date(2026, 7, 18, 9, 0))).toBe(true);
  });

  it("semanal só vence no dia da semana da âncora", () => {
    const weekly = pref({ frequency: "weekly" });

    // Terça, depois das 9h — o slot corrente é a segunda anterior, já coberta pela notificação.
    const notifiedMonday = pref({
      frequency: "weekly",
      last_notified_at: new Date(2026, 7, 17, 9, 0, 30).toISOString(),
    });
    expect(isReminderDue(notifiedMonday, new Date(2026, 7, 18, 10, 0))).toBe(false);
    // Segunda seguinte: vence de novo.
    expect(isReminderDue(notifiedMonday, new Date(2026, 7, 24, 9, 0))).toBe(true);
    // Nunca notificado, numa terça: o slot da segunda continua pendente.
    expect(isReminderDue(weekly, new Date(2026, 7, 18, 10, 0))).toBe(true);
  });

  it("mensal: notificado neste mês não vence de novo antes do mês que vem", () => {
    const monthly = pref({
      frequency: "monthly",
      last_notified_at: new Date(2026, 7, 10, 9, 0, 30).toISOString(),
    });

    expect(isReminderDue(monthly, new Date(2026, 7, 25, 10, 0))).toBe(false);
    expect(isReminderDue(monthly, new Date(2026, 8, 10, 9, 0))).toBe(true);
  });

  it("tolerância configurável: 0 exige o horário cravado", () => {
    expect(isReminderDue(pref(), new Date(2026, 7, 17, 8, 58), 0)).toBe(false);
    expect(isReminderDue(pref(), new Date(2026, 7, 17, 9, 0), 0)).toBe(true);
  });
});
