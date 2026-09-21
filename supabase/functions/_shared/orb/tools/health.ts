/**
 * Tools de saúde da Orb: tratamentos medicamentosos (posologia, próximas doses e adesão) e
 * medições corporais. Somente leitura.
 *
 * O app NÃO tem tabela de dose: a dose é uma `task` (`medication_id` + `dose_time`,
 * `20260816230000_medication.sql`), e a materialização só cria linhas até HOJE
 * (`computeMissingDoses`, `src/domain/health/medication.ts`). Por isso "próximas doses" aqui é
 * CALCULADA do cronograma do tratamento — ler `task` para o futuro devolveria lista vazia e a Orb
 * responderia "não tem dose amanhã" com o remédio em curso.
 *
 * O IMC (`computeBmi`/`bmiCategory`) FOI extraído: mora em `_shared/orb/domain.ts` e o app importa
 * de lá. Não recopie.
 *
 * A adesão (`calculaAdesao`) e o cronograma de doses (`proximasDoses`) continuam replicados de
 * `src/domain/health/{adherence,medication}.ts`, e de propósito: aquelas funções recebem `Task`
 * (tipo de `src/`) e resolvem horário com `new Date(ano, mês, dia, hora, minuto)`, ou seja, no fuso
 * DA MÁQUINA — o que na Edge é UTC, não o fuso de quem perguntou. Aqui a comparação é civil, no
 * `ctx.timezone`. Não é a mesma função com nome diferente: é a mesma REGRA com relógio diferente, e
 * unificar mudaria o comportamento de um dos dois lados.
 *
 * O alarme contra a divergência é `src/domain/orb/__tests__/equivalencia.test.ts`, que roda as duas
 * implementações sobre os mesmos casos e falha se elas discordarem. Mexeu numa, rode ele.
 */

import type { OrbTool, OrbToolContext } from "../types.ts";
import { OrbToolError } from "../types.ts";
import {
  bool,
  clampLimit,
  ilikePattern,
  isoDate,
  num,
  paginate,
  shiftDays,
  str,
  unwrap,
} from "../helpers.ts";
import { bmiCategory, computeBmi } from "../domain.ts";

// ── medicações ───────────────────────────────────────────────────────────────────────────────

interface MedicationRow {
  id: string;
  name: string;
  /** `numeric` — o PostgREST pode devolver como texto; sempre passe por `Number`. */
  dose_amount: number | string | null;
  dose_unit: string | null;
  instructions: string | null;
  /** `time[]` — o Postgres devolve `"08:00:00"`, o formulário grava `"08:00"`. Normalize sempre. */
  times: string[] | null;
  interval_days: number;
  started_on: string;
  ended_on: string | null;
  active: boolean;
}

interface DoseRow {
  id: string;
  medication_id: string | null;
  status: string;
  due_date: string | null;
  due_time: string | null;
  dose_time: string | null;
  completed_at: string | null;
}

const DOSE_SELECT = "id, medication_id, status, due_date, due_time, dose_time, completed_at";

/** Margem de `isDoseLate` (`src/domain/tasks/medication.ts`): tomar até 1h depois não é atraso. */
const MINUTOS_DE_TOLERANCIA = 60;

/** Quantas doses futuras devolver por tratamento — teto de resultado, não regra de negócio. */
const MAX_PROXIMAS_DOSES = 3;

/** Até onde procurar a próxima dose. Acima disso o `interval_days` é grande demais para importar. */
const HORIZONTE_DIAS = 90;

/**
 * `HH:MM` a partir de `HH:MM`, `HH:MM:SS` ou `HH:MM:SS.mmm` — cópia de `normalizeTime`
 * (`src/domain/health/medication.ts`). Comparar as duas formas cruas faria a dose de `08:00`
 * nunca casar com a `08:00:00` que veio do banco.
 */
function normalizaHora(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const casou = /^(\d{1,2}):(\d{2})/.exec(String(valor).trim());
  if (!casou) return null;
  return `${casou[1].padStart(2, "0")}:${casou[2]}`;
}

/** Horários do tratamento normalizados, sem repetidos e em ordem — cópia de `medicationTimes`. */
function horariosDo(medicacao: MedicationRow): string[] {
  const normalizados: string[] = [];
  for (const bruto of medicacao.times ?? []) {
    const hora = normalizaHora(bruto);
    if (hora !== null && !normalizados.includes(hora)) normalizados.push(hora);
  }
  return normalizados.sort();
}

/**
 * Dias inteiros entre duas datas civis. `Date.UTC` de propósito (mesmo motivo de
 * `monthsAgoRange` em `helpers.ts`): o processo da Edge roda em UTC e o do MCP no fuso da máquina,
 * e o construtor local faria a mesma cadência cair em dias diferentes nos dois runtimes.
 */
function diasEntre(deIso: string, ateIso: string): number {
  const de = Date.UTC(Number(deIso.slice(0, 4)), Number(deIso.slice(5, 7)) - 1, Number(deIso.slice(8, 10)));
  const ate = Date.UTC(
    Number(ateIso.slice(0, 4)),
    Number(ateIso.slice(5, 7)) - 1,
    Number(ateIso.slice(8, 10))
  );
  return Math.round((ate - de) / 86_400_000);
}

/**
 * Instante civil (`YYYY-MM-DD HH:MM`) de um timestamp no fuso do usuário.
 *
 * PORQUÊ civil e não epoch: comparar "tomei" com "estava marcado" exige as duas pontas no MESMO
 * relógio, e o único relógio que o usuário reconhece é o dele. `Intl` existe nos dois runtimes
 * (é o que `localDateInTz` já usa em `helpers.ts`), então não viola a regra do diretório.
 */
function instanteLocal(isoTimestamp: string, timeZone: string): string {
  try {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(isoTimestamp));
    const pega = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
    const dia = `${pega("year")}-${pega("month")}-${pega("day")}`;
    return `${dia} ${pega("hour")}:${pega("minute")}`;
  } catch {
    // Fuso inválido vindo do browser não pode derrubar a tool: cai no próprio ISO.
    return `${isoTimestamp.slice(0, 10)} ${isoTimestamp.slice(11, 16)}`;
  }
}

/** `HH:MM` de agora no fuso do usuário. Falhou? `23:59`, que é "o dia já passou inteiro". */
function horaDeAgora(timeZone: string): string {
  try {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const pega = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
    const hora = normalizaHora(`${pega("hour")}:${pega("minute")}`);
    return hora ?? "23:59";
  } catch {
    return "23:59";
  }
}

/** `YYYY-MM-DD HH:MM` somado de N minutos, em aritmética civil (imune ao fuso do processo). */
function somaMinutos(dataIso: string, hora: string, minutos: number): string {
  const base = Date.UTC(
    Number(dataIso.slice(0, 4)),
    Number(dataIso.slice(5, 7)) - 1,
    Number(dataIso.slice(8, 10)),
    Number(hora.slice(0, 2)),
    Number(hora.slice(3, 5))
  );
  const alvo = new Date(base + minutos * 60_000).toISOString();
  return `${alvo.slice(0, 10)} ${alvo.slice(11, 16)}`;
}

interface Adesao {
  total: number;
  taken: number;
  on_time: number;
  late: number;
  missed: number;
  taken_rate: number;
  on_time_rate: number;
}

const ADESAO_VAZIA: Adesao = {
  total: 0,
  taken: 0,
  on_time: 0,
  late: 0,
  missed: 0,
  taken_rate: 0,
  on_time_rate: 0,
};

/** 4 casas, igual a `rate` de `src/domain/health/adherence.ts` — 2/3 vira 67% sem lixo binário. */
function taxa(parte: number, todo: number): number {
  if (todo <= 0) return 0;
  return Math.round((parte / todo) * 10_000) / 10_000;
}

/**
 * Adesão sobre uma lista de doses — cópia de `computeAdherence` (`src/domain/health/adherence.ts`).
 *
 * A regra que não pode mudar: só entram as doses **já vencidas** em `agoraCivil`. Incluir dose
 * futura afundaria a adesão de qualquer tratamento contínuo (um remédio diário sem fim teria
 * adesão tendendo a zero só por existir amanhã). Dose concluída conta como tomada mesmo antes da
 * hora — quem tomou adiantado não é punido —, mas então também entra no `total`.
 *
 * Sem horário, a dose só vence no fim do dia (`23:59`): assim a dose de hoje sem horário não é
 * dada como perdida às 9 da manhã. E dose sem horário nunca é "atrasada", porque não há com o que
 * comparar — mesma decisão de `isDoseLate`.
 *
 * `export` só por causa de `src/domain/orb/__tests__/equivalencia.test.ts`, que roda esta função e a
 * do app sobre os mesmos casos e falha se as duas discordarem. Nenhuma tool a importa de fora.
 */
export function calculaAdesao(doses: DoseRow[], agoraCivil: string, timeZone: string): Adesao {
  let total = 0;
  let taken = 0;
  let late = 0;

  for (const dose of doses) {
    if (!dose.due_date) continue;
    const hora = normalizaHora(dose.dose_time) ?? normalizaHora(dose.due_time);
    const agendada = `${dose.due_date} ${hora ?? "23:59"}`;
    const concluida = dose.status === "done" || dose.completed_at != null;
    if (agendada > agoraCivil && !concluida) continue;

    total += 1;
    if (!concluida) continue;
    taken += 1;

    if (hora && dose.completed_at) {
      const limite = somaMinutos(dose.due_date, hora, MINUTOS_DE_TOLERANCIA);
      if (instanteLocal(dose.completed_at, timeZone) > limite) late += 1;
    }
  }

  const onTime = taken - late;
  return {
    total,
    taken,
    on_time: onTime,
    late,
    missed: total - taken,
    taken_rate: taxa(taken, total),
    on_time_rate: taxa(onTime, total),
  };
}

interface Slot {
  date: string;
  time: string;
}

/**
 * As próximas doses previstas do tratamento a partir de agora — cópia enxuta de `nextDoseSlot` +
 * `computeVirtualDoses` (`src/domain/health/medication.ts`).
 *
 * Sai do CRONOGRAMA, não da tabela: a materialização para em hoje, então nenhuma dose futura
 * existe como `task`. Respeita `active`, `started_on`, `interval_days` e `ended_on`, e o horário
 * de hoje que já passou não entra.
 *
 * `export` só por causa de `src/domain/orb/__tests__/equivalencia.test.ts` (ver `calculaAdesao`).
 */
export function proximasDoses(
  medicacao: MedicationRow,
  hoje: string,
  agora: string,
  maximo: number
): Slot[] {
  if (!medicacao.active || !medicacao.started_on) return [];
  const horarios = horariosDo(medicacao);
  if (horarios.length === 0) return [];
  if (medicacao.ended_on && medicacao.ended_on < hoje) return [];

  const intervalo = Math.max(1, Math.trunc(medicacao.interval_days || 1));
  const horizonte = shiftDays(hoje, HORIZONTE_DIAS);
  const limite =
    medicacao.ended_on && medicacao.ended_on < horizonte ? medicacao.ended_on : horizonte;

  // Primeira data >= hoje que cai na cadência, por aritmética (não varrendo dia a dia desde
  // `started_on`): um tratamento diário começado há anos não pode custar milhares de iterações.
  const deslocamento = diasEntre(medicacao.started_on, hoje);
  let cursor: string;
  if (deslocamento < 0) cursor = medicacao.started_on;
  else {
    const resto = deslocamento % intervalo;
    cursor = resto === 0 ? hoje : shiftDays(hoje, intervalo - resto);
  }

  const slots: Slot[] = [];
  for (let guarda = 0; guarda < 400 && slots.length < maximo; guarda += 1) {
    if (cursor > limite) break;
    for (const hora of horarios) {
      if (cursor === hoje && hora < agora) continue;
      slots.push({ date: cursor, time: hora });
      if (slots.length >= maximo) break;
    }
    cursor = shiftDays(cursor, intervalo);
  }
  return slots;
}

/** "2 comprimidos" / "500 mg" / `null` — a posologia da dose, sem repetir o nome do remédio. */
function rotuloDaDose(medicacao: MedicationRow): string | null {
  const unidade = medicacao.dose_unit?.trim() || null;
  if (medicacao.dose_amount == null) return unidade;
  const quantidade = Number(medicacao.dose_amount);
  if (!Number.isFinite(quantidade)) return unidade;
  return unidade ? `${quantidade} ${unidade}` : String(quantidade);
}

/** Resumo em uma linha, no formato de `formatPosology`: "2 comprimidos · 08:00, 20:00 · todos os dias". */
function resumoDaPosologia(medicacao: MedicationRow, horarios: string[]): string {
  const partes: string[] = [];
  const dose = rotuloDaDose(medicacao);
  if (dose) partes.push(dose);
  if (horarios.length > 0) partes.push(horarios.join(", "));
  partes.push(
    medicacao.interval_days > 1 ? `a cada ${medicacao.interval_days} dias` : "todos os dias"
  );
  return partes.join(" · ");
}

export const queryMedications: OrbTool = {
  name: "query_medications",
  title: "Medicações",
  description:
    "Tratamentos medicamentosos do usuário: posologia (quantidade, horários, a cada quantos " +
    "dias), período, as próximas doses previstas e a adesão recente (doses tomadas x já " +
    "vencidas, com quantas foram no horário). Use para 'quais remédios eu tomo?', 'já tomei o " +
    "remédio hoje?', 'estou seguindo direito o tratamento?', 'quando é a próxima dose?'. " +
    "As doses de hoje e do passado saem das tarefas; as futuras são calculadas do cronograma, " +
    "porque o app só materializa a dose no dia em que ela cai.",
  inputSchema: {
    type: "object",
    properties: {
      include_inactive: {
        type: "boolean",
        description:
          "true traz também os tratamentos encerrados (active = false). Padrão false: só os ativos.",
      },
      search: { type: "string", description: "Texto a procurar no nome do remédio." },
      adherence_days: {
        type: "number",
        description:
          "Tamanho em dias da janela de adesão, terminando hoje (1 a 180, padrão 30).",
      },
      limit: { type: "number", description: "Máximo de tratamentos (1 a 50, padrão 20)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 20, 50);
    const dias = clampLimit(num(input, "adherence_days"), 30, 180);
    const incluirInativos = bool(input, "include_inactive") === true;
    const search = str(input, "search");

    let query = ctx.db
      .from("medication")
      .select(
        "id, name, dose_amount, dose_unit, instructions, times, interval_days, started_on, ended_on, active"
      )
      .eq("user_id", ctx.userId);
    if (!incluirInativos) query = query.eq("active", true);
    if (search) query = query.ilike("name", ilikePattern(search));

    const tratamentos = unwrap<MedicationRow[]>(
      await query.order("created_at", { ascending: true }).limit(limit),
      "os tratamentos"
    );

    const inicio = shiftDays(ctx.today, -(dias - 1));
    const janela = { start: inicio, end: ctx.today, days: dias };
    if (tratamentos.length === 0) {
      return {
        today: ctx.today,
        limit,
        adherence_window: janela,
        adherence_overall: ADESAO_VAZIA,
        medications: [],
      };
    }

    // `due_date` é `date` (não `timestamptz`), então `.lte(hoje)` já é inclusivo — a armadilha do
    // `exclusiveEnd` de `helpers.ts` não se aplica aqui.
    const { rows: doses, truncated } = await paginate<DoseRow>(
      (de, ate) =>
        ctx.db
          .from("task")
          .select(DOSE_SELECT)
          .eq("user_id", ctx.userId)
          .in(
            "medication_id",
            tratamentos.map((tratamento) => tratamento.id)
          )
          .gte("due_date", inicio)
          .lte("due_date", ctx.today)
          .order("due_date", { ascending: true })
          .order("id", { ascending: true })
          .range(de, ate),
      "as doses",
      { max: 3000 }
    );

    const agora = horaDeAgora(ctx.timezone);
    const agoraCivil = `${ctx.today} ${agora}`;

    const medications = tratamentos.map((tratamento) => {
      const minhas = doses.filter((dose) => dose.medication_id === tratamento.id);
      const horarios = horariosDo(tratamento);

      // Índice (data × horário) das doses já materializadas, para dizer se a dose de hoje já foi
      // tomada. Dose futura não está aqui — por isso `already_taken` é `null` nesse caso.
      const porSlot = new Map<string, DoseRow>();
      for (const dose of minhas) {
        if (!dose.due_date) continue;
        const hora = normalizaHora(dose.dose_time) ?? normalizaHora(dose.due_time);
        porSlot.set(`${dose.due_date}T${hora ?? ""}`, dose);
      }

      return {
        id: tratamento.id,
        name: tratamento.name,
        active: tratamento.active,
        dose_amount: tratamento.dose_amount == null ? null : Number(tratamento.dose_amount),
        dose_unit: tratamento.dose_unit,
        dose_label: rotuloDaDose(tratamento),
        times: horarios,
        interval_days: tratamento.interval_days,
        started_on: tratamento.started_on,
        ended_on: tratamento.ended_on,
        instructions: tratamento.instructions,
        posology: resumoDaPosologia(tratamento, horarios),
        next_doses: proximasDoses(tratamento, ctx.today, agora, MAX_PROXIMAS_DOSES).map(
          (slot) => {
            const dose = porSlot.get(`${slot.date}T${slot.time}`);
            return {
              date: slot.date,
              time: slot.time,
              // `null` = a dose ainda não existe como tarefa (só vira linha no dia em que cai).
              already_taken: dose
                ? dose.status === "done" || dose.completed_at != null
                : null,
            };
          }
        ),
        adherence: calculaAdesao(minhas, agoraCivil, ctx.timezone),
      };
    });

    // Dois cortes possíveis e um único `truncated`: a lista de tratamentos (cortada no `limit` do
    // banco) e as doses da janela de adesão (cortadas no teto do `paginate`). Um flag por causa
    // esconderia a outra, e sem o primeiro uma lista cortada passava como "esses são todos".
    const avisos: string[] = [];
    if (tratamentos.length === limit) {
      avisos.push(
        `Vieram ${limit} tratamentos, que é exatamente o limite pedido: pode haver mais. Refine com search em vez de subir o limit.`
      );
    }
    if (truncated) {
      avisos.push(
        "Vieram doses demais para a janela pedida — a adesão está calculada só sobre parte delas. Peça de novo com adherence_days menor."
      );
    }

    return {
      today: ctx.today,
      limit,
      adherence_window: janela,
      adherence_overall: calculaAdesao(doses, agoraCivil, ctx.timezone),
      medications,
      ...(avisos.length > 0 ? { truncated: true, truncated_warning: avisos.join(" ") } : {}),
    };
  },
};

// ── medições corporais ───────────────────────────────────────────────────────────────────────

interface MetricRow {
  id: string;
  metric_type: string;
  /** `numeric` — pode chegar como texto. */
  value: number | string;
  recorded_date: string;
  notes: string | null;
  created_at: string | null;
}

/**
 * Tipos, unidades e rótulos das medições. Espelham o check `health_metric_type_check`
 * (`20260816210000_health_metric.sql`) e `METRIC_UNIT`/`METRIC_LABEL`
 * (`src/domain/health/metrics.ts`) — mexeu num, mexe nos outros. Peso em kg, o resto em cm.
 */
const TIPOS_DE_METRICA = ["weight", "height", "waist", "hip", "chest", "arm"];

const UNIDADE: Record<string, string> = {
  weight: "kg",
  height: "cm",
  waist: "cm",
  hip: "cm",
  chest: "cm",
  arm: "cm",
};

const ROTULO: Record<string, string> = {
  weight: "Peso",
  height: "Altura",
  waist: "Cintura",
  hip: "Quadril",
  chest: "Peito",
  arm: "Braço",
};

/** Janela padrão: medição corporal é esparsa (pesar-se uma vez por semana já é muito). */
const JANELA_PADRAO_DIAS = 180;

/** Observação da medição é texto livre — corta, senão uma nota longa envenena o turno. */
const MAX_NOTA = 120;

function cortaNota(texto: string | null): string | null {
  if (!texto) return null;
  const limpo = texto.trim();
  if (limpo === "") return null;
  return limpo.length > MAX_NOTA ? `${limpo.slice(0, MAX_NOTA)}…` : limpo;
}

/** Duas casas — evita `0.5000000000000071` na variação, igual a `deltaSincePrevious`. */
function duasCasas(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Mais recente primeiro. `recorded_date` manda (é o dia da medição) e `created_at` só desempata
 * duas medições do mesmo dia — mesma regra de `sortedDesc` (`src/domain/health/metrics.ts`).
 */
function maisRecentePrimeiro(linhas: MetricRow[]): MetricRow[] {
  return [...linhas].sort((a, b) => {
    if (a.recorded_date !== b.recorded_date) return a.recorded_date < b.recorded_date ? 1 : -1;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

/** A última altura registrada, de qualquer época — sem ela o IMC seria sempre nulo. */
async function ultimaAltura(ctx: OrbToolContext): Promise<MetricRow | undefined> {
  const linhas = unwrap<MetricRow[]>(
    await ctx.db
      .from("health_metric")
      .select("id, metric_type, value, recorded_date, notes, created_at")
      .eq("user_id", ctx.userId)
      .eq("metric_type", "height")
      .order("recorded_date", { ascending: false })
      .limit(1),
    "a última altura registrada"
  );
  // Confere o tipo do que voltou: o IMC é derivado, e uma linha que não seja altura viraria um
  // número absurdo apresentado com cara de exato.
  const linha = linhas[0];
  return linha && linha.metric_type === "height" ? linha : undefined;
}

export const queryHealthMetrics: OrbTool = {
  name: "query_health_metrics",
  title: "Medições corporais",
  description:
    "Histórico das medições corporais do usuário (peso em kg; altura, cintura, quadril, peito e " +
    "braço em cm), por tipo e período, com a última medição, a variação no intervalo e o IMC " +
    "quando há peso e altura. Use para 'quanto eu pesava em janeiro?', 'engordei ou emagreci nos " +
    "últimos 3 meses?', 'qual é o meu IMC?'. Sem período informado, olha os últimos 180 dias.",
  inputSchema: {
    type: "object",
    properties: {
      metric_type: {
        type: "string",
        enum: ["weight", "height", "waist", "hip", "chest", "arm"],
        description:
          "Tipo da medição: weight (peso, kg), height (altura), waist (cintura), hip (quadril), " +
          "chest (peito), arm (braço) — os cinco últimos em cm. Omita para trazer todos.",
      },
      from: {
        type: "string",
        description: "Data inicial (YYYY-MM-DD). Padrão: 180 dias antes da data final.",
      },
      to: { type: "string", description: "Data final (YYYY-MM-DD, inclusive). Padrão: hoje." },
      limit: { type: "number", description: "Máximo de medições (1 a 200, padrão 40)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const limit = clampLimit(num(input, "limit"), 40, 200);
    const tipo = str(input, "metric_type");
    const ate = isoDate(input, "to") ?? ctx.today;
    const de = isoDate(input, "from") ?? shiftDays(ate, -(JANELA_PADRAO_DIAS - 1));
    if (de > ate) {
      throw new OrbToolError('"from" não pode ser depois de "to".');
    }

    // `recorded_date` é `date`, não `timestamptz`: `.lte` já é inclusivo e a fronteira exclusiva
    // de `helpers.ts` não se aplica.
    let query = ctx.db
      .from("health_metric")
      .select("id, metric_type, value, recorded_date, notes, created_at")
      .eq("user_id", ctx.userId)
      .gte("recorded_date", de)
      .lte("recorded_date", ate);
    if (tipo) query = query.eq("metric_type", tipo);

    const linhas = unwrap<MetricRow[]>(
      await query
        .order("recorded_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit),
      "as medições corporais"
    );

    const metrics: Record<string, unknown>[] = [];
    let pesoAtual: MetricRow | undefined;
    let alturaAtual: MetricRow | undefined;

    for (const tipoAtual of TIPOS_DE_METRICA) {
      const serie = maisRecentePrimeiro(
        linhas.filter((linha) => linha.metric_type === tipoAtual)
      );
      if (serie.length === 0) continue;

      const ultima = serie[0];
      const maisAntiga = serie[serie.length - 1];
      if (tipoAtual === "weight") pesoAtual = ultima;
      if (tipoAtual === "height") alturaAtual = ultima;

      const valorUltima = Number(ultima.value);
      const valorAntiga = Number(maisAntiga.value);
      const variacao = serie.length > 1 ? duasCasas(valorUltima - valorAntiga) : null;

      metrics.push({
        metric_type: tipoAtual,
        label: ROTULO[tipoAtual],
        unit: UNIDADE[tipoAtual],
        count: serie.length,
        latest: {
          value: valorUltima,
          recorded_date: ultima.recorded_date,
          notes: cortaNota(ultima.notes),
        },
        // Primeira medição DENTRO do que voltou: com `truncated`, ela não é a mais antiga do
        // período pedido, e a variação abaixo se refere a este recorte.
        first_in_range: { value: valorAntiga, recorded_date: maisAntiga.recorded_date },
        change_in_range: variacao,
        change_percent:
          variacao !== null && valorAntiga !== 0
            ? duasCasas((variacao / Math.abs(valorAntiga)) * 100)
            : null,
        // Variação contra a medição imediatamente anterior — é o número que o card da tela mostra.
        delta_since_previous:
          serie.length > 1 ? duasCasas(valorUltima - Number(serie[1].value)) : null,
        series: serie.map((linha) => ({
          recorded_date: linha.recorded_date,
          value: Number(linha.value),
          notes: cortaNota(linha.notes),
        })),
      });
    }

    // Altura é medida uma vez e nunca mais: sem esta busca extra o IMC seria sempre nulo em
    // qualquer janela que não contenha o dia em que ela foi registrada.
    if (pesoAtual && !alturaAtual) alturaAtual = await ultimaAltura(ctx);

    const peso = pesoAtual;
    const altura = alturaAtual;
    const imc =
      peso && altura ? computeBmi(Number(peso.value), Number(altura.value)) : null;

    return {
      today: ctx.today,
      range: { start: de, end: ate },
      total_measurements: linhas.length,
      metrics,
      // IMC não é coluna do banco (`20260816210000_health_metric.sql`): sai de peso + altura, e é
      // nulo quando falta um dos dois.
      bmi:
        imc === null || !peso || !altura
          ? null
          : {
              value: imc,
              category: bmiCategory(imc),
              weight_kg: Number(peso.value),
              weight_date: peso.recorded_date,
              height_cm: Number(altura.value),
              height_date: altura.recorded_date,
            },
      ...(linhas.length >= limit
        ? {
            truncated: true,
            truncated_warning:
              `Vieram só as ${limit} medições mais recentes do período — as mais antigas ficaram ` +
              "de fora, e a variação se refere ao que voltou. Peça de novo com from/to mais " +
              "estreito ou filtrando metric_type.",
          }
        : {}),
    };
  },
};

export const healthTools: OrbTool[] = [queryMedications, queryHealthMetrics];
