import { describe, expect, it } from "vitest";

import { computeAdherence } from "@/domain/health/adherence";
import { nextDoseSlot } from "@/domain/health/medication";
import type { Medication } from "@/types/health";
import type { Task } from "@/types/tasks";
import {
  calculaAdesao,
  proximasDoses,
} from "../../../../supabase/functions/_shared/orb/tools/health.ts";

/**
 * ALARME DE DIVERGÊNCIA entre as regras de saúde do app e as cópias das tools da Orb.
 *
 * Por que existem duas implementações: as do app recebem `Task`/`Medication` (tipos de `src/`) e
 * resolvem horário com `new Date(ano, mês, dia, hora, minuto)`, ou seja, no fuso DA MÁQUINA — que
 * na Edge Function é UTC, não o de quem perguntou. As da Orb comparam datas civis no `ctx.timezone`
 * e não podem importar de `src/` (cabeçalho de `_shared/orb/types.ts`). É a mesma REGRA com relógio
 * diferente; unificar mudaria o comportamento de um dos dois lados.
 *
 * O que não pode acontecer é a regra divergir em silêncio — a Orb responderia uma adesão e a tela
 * mostraria outra. Este arquivo roda as DUAS sobre os MESMOS casos, com os dois relógios apontando
 * para o mesmo fuso, e falha se elas discordarem. Mexeu numa das duas? Rode isto.
 */

/** O fuso do processo, que é o mesmo que o Vitest fixa em `vite.config.ts` (America/Sao_Paulo). */
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** `YYYY-MM-DD HH:MM` de um instante no fuso do processo — o "agora" que a tool da Orb recebe. */
function agoraCivil(now: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const pega = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${pega("year")}-${pega("month")}-${pega("day")} ${pega("hour")}:${pega("minute")}`;
}

/* ─────────────────────────────── Adesão às doses ─────────────────────────────── */

/** Um caso de dose, na forma neutra que vira `Task` (app) e linha de `task` (Orb). */
interface CasoDeDose {
  due_date: string | null;
  due_time: string | null;
  dose_time: string | null;
  status: "todo" | "done";
  completed_at: string | null;
}

function comoTask(caso: CasoDeDose, indice: number): Task {
  return {
    id: `dose-${indice}`,
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Losartana",
    status: caso.status,
    tag_ids: [],
    due_date: caso.due_date,
    due_time: caso.due_time,
    dose_time: caso.dose_time,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    is_medication: true,
    medication_id: "med-1",
    completed_at: caso.completed_at,
  };
}

function comoLinha(caso: CasoDeDose, indice: number) {
  return {
    id: `dose-${indice}`,
    medication_id: "med-1",
    status: caso.status,
    due_date: caso.due_date,
    due_time: caso.due_time,
    dose_time: caso.dose_time,
    completed_at: caso.completed_at,
  };
}

/** Instante local em `YYYY-MM-DDTHH:MM:SS.sssZ`, como `completed_at` chega do banco. */
function tomadaEm(ano: number, mes: number, dia: number, hora: number, minuto: number): string {
  return new Date(ano, mes - 1, dia, hora, minuto, 0, 0).toISOString();
}

const AGORA = new Date(2026, 7, 17, 12, 0, 0, 0); // 17/08/2026 12:00 no fuso do processo

/**
 * Os casos usam `completed_at` em minuto CHEIO de propósito: a implementação do app compara
 * milissegundos e a da Orb compara `HH:MM`, então uma tomada às 09:00:30 contra um limite de 09:00
 * é "atrasada" para o app e "no horário" para a Orb. Não é divergência de regra, é granularidade —
 * e está fixada no teste logo abaixo, para deixar de ser surpresa.
 */
const CASOS: CasoDeDose[] = [
  // Tomada dentro da tolerância de 60 min.
  {
    due_date: "2026-08-16",
    due_time: "08:00",
    dose_time: "08:00",
    status: "done",
    completed_at: tomadaEm(2026, 8, 16, 8, 20),
  },
  // Tomada depois da tolerância.
  {
    due_date: "2026-08-16",
    due_time: "20:00",
    dose_time: "20:00",
    status: "done",
    completed_at: tomadaEm(2026, 8, 16, 22, 30),
  },
  // Exatamente no limite: 60 min cravados ainda NÃO é atraso, nas duas.
  {
    due_date: "2026-08-15",
    due_time: "08:00",
    dose_time: "08:00",
    status: "done",
    completed_at: tomadaEm(2026, 8, 15, 9, 0),
  },
  // Vencida e não tomada: entra como perdida.
  { due_date: "2026-08-16", due_time: "08:00", dose_time: "08:00", status: "todo", completed_at: null },
  // Futura e não tomada: não entra em `total` (senão todo tratamento contínuo tenderia a zero).
  { due_date: "2026-08-18", due_time: "08:00", dose_time: "08:00", status: "todo", completed_at: null },
  // Futura mas já tomada (adiantada): entra em `total` E em `taken`.
  {
    due_date: "2026-08-18",
    due_time: "08:00",
    dose_time: "08:00",
    status: "done",
    completed_at: tomadaEm(2026, 8, 17, 9, 0),
  },
  // Hoje, sem horário: só vence no fim do dia, então às 12:00 ainda não é perdida.
  { due_date: "2026-08-17", due_time: null, dose_time: null, status: "todo", completed_at: null },
  // Sem horário e tomada: conta como tomada e NUNCA como atrasada (não há com o que comparar).
  {
    due_date: "2026-08-14",
    due_time: null,
    dose_time: null,
    status: "done",
    completed_at: tomadaEm(2026, 8, 14, 23, 0),
  },
  // `dose_time` tem precedência sobre `due_time` — e chega do Postgres com segundos.
  {
    due_date: "2026-08-16",
    due_time: "23:00:00",
    dose_time: "08:00:00",
    status: "done",
    completed_at: tomadaEm(2026, 8, 16, 8, 10),
  },
  // Concluída por `completed_at` mesmo com `status` ainda "todo".
  {
    due_date: "2026-08-15",
    due_time: "08:00",
    dose_time: "08:00",
    status: "todo",
    completed_at: tomadaEm(2026, 8, 15, 8, 5),
  },
  // Sem `due_date`: ignorada pelas duas.
  { due_date: null, due_time: "08:00", dose_time: "08:00", status: "done", completed_at: null },
];

function adesaoDoApp(casos: CasoDeDose[]) {
  const r = computeAdherence(casos.map(comoTask), AGORA);
  return {
    total: r.total,
    taken: r.taken,
    on_time: r.onTime,
    late: r.late,
    missed: r.missed,
    taken_rate: r.takenRate,
    on_time_rate: r.onTimeRate,
  };
}

const adesaoDaOrb = (casos: CasoDeDose[]) =>
  calculaAdesao(casos.map(comoLinha), agoraCivil(AGORA), TZ);

describe("adesão: app x tools da Orb", () => {
  it("dá o mesmo resultado para o catálogo inteiro de casos", () => {
    expect(adesaoDaOrb(CASOS)).toEqual(adesaoDoApp(CASOS));
  });

  it("dá o mesmo resultado caso a caso, para o erro apontar qual dose divergiu", () => {
    for (const [indice, caso] of CASOS.entries()) {
      expect(adesaoDaOrb([caso]), `caso ${indice}: ${JSON.stringify(caso)}`).toEqual(
        adesaoDoApp([caso])
      );
    }
  });

  it("lista vazia zera dos dois lados, sem dividir por zero", () => {
    expect(adesaoDaOrb([])).toEqual(adesaoDoApp([]));
  });

  /**
   * A ÚNICA diferença conhecida, fixada aqui para não virar bug misterioso: o app compara o
   * instante em milissegundos e a Orb compara `HH:MM`, então uma tomada 30 s depois do limite de
   * tolerância é atraso para um e não para o outro. A Orb responde em minutos — arredondar para
   * baixo nessa fronteira é o comportamento certo dela, não um defeito.
   */
  it("difere só na granularidade do segundo, na fronteira exata da tolerância", () => {
    const trintaSegundosDepoisDoLimite: CasoDeDose = {
      due_date: "2026-08-16",
      due_time: "08:00",
      dose_time: "08:00",
      status: "done",
      completed_at: new Date(2026, 7, 16, 9, 0, 30).toISOString(),
    };
    expect(adesaoDoApp([trintaSegundosDepoisDoLimite]).late).toBe(1);
    expect(adesaoDaOrb([trintaSegundosDepoisDoLimite]).late).toBe(0);
  });
});

/* ────────────────────────────── Próxima dose prevista ────────────────────────────── */

function medicacao(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    name: "Losartana",
    dose_amount: 1,
    dose_unit: "comprimido",
    instructions: null,
    times: ["08:00", "20:00"],
    interval_days: 1,
    started_on: "2026-08-01",
    ended_on: null,
    active: true,
    ...overrides,
  };
}

/** O `Medication` do app na forma da linha de `medication` que a tool lê (colunas nullable). */
function comoLinhaDeMedicacao(med: Medication) {
  return {
    id: med.id,
    name: med.name,
    dose_amount: med.dose_amount ?? null,
    dose_unit: med.dose_unit ?? null,
    instructions: med.instructions ?? null,
    times: med.times ?? null,
    interval_days: med.interval_days,
    started_on: med.started_on,
    ended_on: med.ended_on ?? null,
    active: med.active,
  };
}

const HOJE = "2026-08-17";

const TRATAMENTOS: { nome: string; med: Medication; agora: string }[] = [
  { nome: "diário, ainda sobra horário hoje", med: medicacao(), agora: "07:00" },
  { nome: "diário, entre os dois horários de hoje", med: medicacao(), agora: "12:00" },
  { nome: "diário, todos os horários de hoje já passaram", med: medicacao(), agora: "21:00" },
  {
    nome: "a cada 3 dias, hoje é dia de dose",
    med: medicacao({ interval_days: 3, started_on: "2026-08-02" }),
    agora: "07:00",
  },
  {
    nome: "a cada 3 dias, hoje NÃO é dia de dose",
    med: medicacao({ interval_days: 3, started_on: "2026-08-01" }),
    agora: "07:00",
  },
  {
    nome: "a cada 3 dias, hoje é dia mas o horário passou",
    med: medicacao({ interval_days: 3, started_on: "2026-08-02", times: ["08:00"] }),
    agora: "21:00",
  },
  {
    nome: "ainda vai começar",
    med: medicacao({ started_on: "2026-09-10" }),
    agora: "07:00",
  },
  {
    nome: "encerrado ontem",
    med: medicacao({ ended_on: "2026-08-16" }),
    agora: "07:00",
  },
  {
    nome: "acaba hoje, com horário ainda por vir",
    med: medicacao({ ended_on: "2026-08-17" }),
    agora: "07:00",
  },
  {
    nome: "acaba hoje, sem horário sobrando",
    med: medicacao({ ended_on: "2026-08-17" }),
    agora: "21:00",
  },
  { nome: "inativo", med: medicacao({ active: false }), agora: "07:00" },
  { nome: "sem horários cadastrados", med: medicacao({ times: [] }), agora: "07:00" },
  {
    nome: "horários fora de ordem e com segundos, como o Postgres devolve",
    med: medicacao({ times: ["20:00:00", "08:00:00", "08:00"] }),
    agora: "09:00",
  },
  {
    nome: "intervalo grande: a próxima passa do horizonte de 90 dias",
    med: medicacao({ interval_days: 120, started_on: "2026-08-16" }),
    agora: "07:00",
  },
  {
    nome: "tratamento antigo, começado há anos",
    med: medicacao({ started_on: "2019-03-04", interval_days: 2 }),
    agora: "07:00",
  },
];

describe("próxima dose prevista: app x tools da Orb", () => {
  it("aponta o mesmo (data, horário) em todo cenário de cronograma", () => {
    // `nulos` guarda contra o teste passar à toa: se as duas implementações começassem a devolver
    // `null` sempre, todos os `toEqual` continuariam verdes e o alarme estaria desligado.
    let nulos = 0;
    for (const { nome, med, agora } of TRATAMENTOS) {
      const daOrb = proximasDoses(comoLinhaDeMedicacao(med), HOJE, agora, 1)[0] ?? null;
      const doApp = nextDoseSlot(med, HOJE, agora);
      expect(daOrb, nome).toEqual(doApp);
      if (doApp === null) nulos += 1;
    }
    expect(nulos, "cenários demais sem próxima dose — os casos pararam de exercitar a regra").
      toBeLessThan(TRATAMENTOS.length / 2);
  });
});
