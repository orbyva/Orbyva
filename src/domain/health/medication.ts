import type { Medication } from "@/types/health";

/**
 * Regras puras do controle de medicamentos (feature 064) — sem I/O, para o Vitest cobrir sem
 * Supabase. `src/api/health/medications.ts` é só a insert do que sai daqui.
 *
 * O que este módulo resolve e a 049 não conseguia: **N doses por dia**. Lá uma medicação era uma
 * `recurrence_rule` com um `time` singular; aqui a unidade é o par (data × horário), então
 * "1 de manhã e 1 à noite" é um tratamento só com dois horários.
 */

/**
 * `icon_key` gravada em toda dose materializada (feature 071). O preset correspondente é
 * `{ key: "pill", label: "Medicação" }` em `TASK_ICON_PRESETS`
 * (`src/pages/admin/tasks/TaskIconBadge.tsx`) — é ele que a bolinha da agenda desenha, e é o que
 * diferencia a dose das outras tarefas pontuais do dia sem precisar de texto.
 *
 * Mesmo padrão de `SHOPPING_TASK_ICON_KEY` (`src/domain/shopping/taskLink.ts`): a chave mora no
 * domínio, quem grava e quem desenha só a importam.
 */
export const MEDICATION_TASK_ICON_KEY = "pill";

/** Uma dose a materializar: o dia e qual dos `medication.times` ela representa. */
export interface DoseSlot {
  /** `YYYY-MM-DD` no fuso local. */
  date: string;
  /** `HH:MM` — sempre normalizado, mesmo que o banco devolva `HH:MM:SS`. */
  time: string;
}

/** O mínimo que `computeMissingDoses` precisa saber de uma dose já materializada. */
export interface ExistingDose {
  due_date: string | null;
  dose_time?: string | null;
}

/**
 * Quantas datas da cadência um laço pode visitar de uma vez — mesmo espírito do `guard` de
 * `computeMissingWeekdayOccurrences` (`src/domain/tasks/recurrence.ts`). Um tratamento contínuo
 * começado há anos não pode virar laço infinito nem uma insert de milhares de linhas de uma vez.
 *
 * **Não é um teto de alcance** (feature 096). Era, até então, e isso escondia um bug: o laço
 * contava iterações a partir de `started_on` e avançava o cursor em toda passada, inclusive nas
 * datas cuja dose já existia. O alcance do gerador era `started_on + 399 × interval_days`, **para
 * sempre** — um tratamento diário começado há mais de 400 dias parava de materializar dose e nunca
 * mais voltava, enquanto a agenda continuava desenhando a dose virtual pontilhada que nunca virava
 * real. O comentário aqui afirmava o contrário ("o que sobrar entra na carga seguinte"), então
 * quem lia o código era ativamente enganado.
 *
 * Hoje o laço para **por data** e a janela é ancorada no fim (`hoje`, ou o fim programado), não no
 * começo: `computeMissingDoses` cobre sempre os últimos `MAX_DAYS` passos de cadência até `limit`.
 * A consequência assumida é que um tratamento mais velho que isso não materializa retroativamente o
 * início — e é a troca certa: são doses de mais de um ano atrás, que ninguém vai marcar como
 * tomadas, e o que não pode faltar é a dose de **hoje**.
 */
const MAX_DAYS = 400;

/**
 * `HH:MM` a partir de `HH:MM`, `HH:MM:SS` ou `HH:MM:SS.mmm`. O Postgres devolve `time` com
 * segundos e o `<input type="time">` devolve sem — comparar as duas formas cruas geraria dose
 * duplicada todo dia, que é exatamente o bug que esta feature não pode ter.
 */
export function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  return `${match[1]!.padStart(2, "0")}:${match[2]}`;
}

/** Horários do tratamento, normalizados, sem repetidos e em ordem cronológica. */
export function medicationTimes(medication: Pick<Medication, "times">): string[] {
  const normalized = (medication.times ?? [])
    .map((time) => normalizeTime(time))
    .filter((time): time is string => time != null);
  return Array.from(new Set(normalized)).sort();
}

function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Meio-dia local, como em `recurrence.ts`: imune a horário de verão ao somar dias. */
function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year!, month! - 1, day!, 12);
}

/**
 * Os pares (data, horário) que o tratamento já deveria ter gerado até `today` e ainda não existem
 * como tarefa.
 *
 * Respeita, nesta ordem: `active` (tratamento encerrado não gera mais nada — nem retroativo),
 * `started_on` (a primeira dose é no dia de início, não no dia seguinte), `interval_days` (a cada
 * N dias a partir do início) e `ended_on` (nada depois do fim programado, mesmo que `today` seja
 * bem posterior).
 *
 * `existingDoses` são as doses já materializadas **deste** tratamento; a comparação é por
 * (`due_date`, `dose_time` normalizado), então rodar isto de novo com o resultado já inserido
 * devolve lista vazia — é o que impede a mesma dose de aparecer duas vezes no calendário.
 *
 * A janela varrida termina em `limit` e tem no máximo `MAX_DAYS` datas de cadência (ver o comentário
 * de `MAX_DAYS`): a dose de **hoje** sai daqui por mais velho que seja o tratamento, e é o começo
 * de um tratamento muito antigo que fica de fora, não o fim.
 */
export function computeMissingDoses(
  medication: Medication,
  existingDoses: ExistingDose[],
  today: string
): DoseSlot[] {
  if (!medication.active) return [];

  const times = medicationTimes(medication);
  if (times.length === 0) return [];

  const interval = Math.max(1, Math.trunc(medication.interval_days || 1));
  const start = medication.started_on;
  if (!start || start > today) return [];

  // Fim da janela: hoje, ou o fim programado se ele já passou.
  const limit =
    medication.ended_on && medication.ended_on < today ? medication.ended_on : today;
  if (limit < start) return [];

  const existing = new Set(
    existingDoses
      .filter((dose) => dose.due_date)
      .map((dose) => `${dose.due_date}T${normalizeTime(dose.dose_time) ?? ""}`)
  );

  // Onde a varredura começa. Um tratamento dentro da janela começa em `started_on`, como sempre;
  // um mais antigo que `MAX_DAYS` passos começa no passo que deixa exatamente `MAX_DAYS` datas até
  // `limit`. O salto é aritmético a partir de `started_on` (mesma conta de `computeVirtualDoses`),
  // então a cadência continua alinhada com o início: um `interval_days = 3` cai sempre no dia certo
  // e nunca no de véspera.
  const totalSteps = Math.floor(daysBetween(start, limit) / interval);
  const firstStep = Math.max(0, totalSteps - MAX_DAYS + 1);
  const cursor = parseIso(start);
  cursor.setDate(cursor.getDate() + firstStep * interval);

  const missing: DoseSlot[] = [];

  // O laço para **por data**. `MAX_DAYS + 1` é trava de segurança contra laço infinito, não regra
  // de negócio: o `firstStep` acima garante que a saída seja sempre o `date > limit`.
  for (let guard = 0; guard <= MAX_DAYS; guard += 1) {
    const date = toIso(cursor);
    if (date > limit) break;

    for (const time of times) {
      if (!existing.has(`${date}T${time}`)) missing.push({ date, time });
    }

    cursor.setDate(cursor.getDate() + interval);
  }

  return missing;
}

/**
 * Uma dose já materializada, do ponto de vista da **reconciliação** (feature 074): além da chave
 * (`due_date`, `dose_time`) que `computeMissingDoses` usa, precisa do `id` (é o que vai ser
 * apagado) e de como saber se ela já foi tomada.
 */
export interface ReconcilableDose extends ExistingDose {
  id: string;
  status?: string | null;
  completed_at?: string | null;
}

/** Dose já tomada — nunca é tocada pela reconciliação: é o histórico de adesão da 064. */
function isDoseCompleted(dose: ReconcilableDose): boolean {
  return dose.status === "done" || dose.completed_at != null;
}

/**
 * Os ids das doses que **deixaram de fazer parte** do tratamento depois de uma edição — o que
 * `updateMedication` apaga para o calendário não ficar com a dose do horário velho ao lado da do
 * horário novo (feature 074).
 *
 * Só entram doses **futuras** (`due_date > today`) e **não concluídas**. Essa é a regra que não
 * pode ser relaxada: dose passada e dose já tomada são o histórico de adesão da `064`, e apagá-las
 * falsificaria a métrica — quem mudou o horário hoje não desfez o remédio que tomou ontem. A dose
 * de **hoje** também fica de fora de propósito: o dia está em curso, ela pode estar prestes a ser
 * marcada, e a materialização não recriaria nada melhor no lugar.
 *
 * Uma dose futura é obsoleta quando qualquer coisa da nova configuração a exclui: tratamento
 * encerrado (`active = false`), `dose_time` que não está mais em `times`, dia anterior ao novo
 * `started_on`, dia posterior ao novo `ended_on`, ou dia fora da cadência de `interval_days`.
 * O que continua batendo fica de pé — reconciliar não é "apagar tudo e materializar de novo", que
 * trocaria ids e perderia qualquer edição feita na linha.
 */
export function computeStaleDoses(
  medication: Medication,
  existingDoses: ReconcilableDose[],
  today: string
): string[] {
  const times = new Set(medicationTimes(medication));
  const interval = Math.max(1, Math.trunc(medication.interval_days || 1));
  const start = medication.started_on;

  const stale: string[] = [];
  for (const dose of existingDoses) {
    if (!dose.due_date) continue;
    if (dose.due_date <= today) continue;
    if (isDoseCompleted(dose)) continue;

    if (!medication.active) {
      stale.push(dose.id);
      continue;
    }

    const time = normalizeTime(dose.dose_time);
    if (!time || !times.has(time)) {
      stale.push(dose.id);
      continue;
    }
    if (!start || dose.due_date < start) {
      stale.push(dose.id);
      continue;
    }
    if (medication.ended_on && dose.due_date > medication.ended_on) {
      stale.push(dose.id);
      continue;
    }
    if (daysBetween(start, dose.due_date) % interval !== 0) {
      stale.push(dose.id);
    }
  }
  return stale;
}

/** Dias inteiros de `fromIso` até `toIso` (negativo se `toIso` for anterior). */
function daysBetween(fromIso: string, toIso: string): number {
  const ms = parseIso(toIso).getTime() - parseIso(fromIso).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Os pares (data, horário) que o tratamento **ainda vai** gerar, do dia seguinte a `today` até
 * `rangeEndIso` (inclusive) — as doses virtuais da agenda (feature 071).
 *
 * `computeMissingDoses` para em `today` de propósito: a 064 decidiu não encher a base de linhas
 * futuras para tratamentos que o usuário pode encerrar amanhã. O efeito colateral era a agenda não
 * mostrar dose nenhuma no futuro, contradizendo o "aparece no meu calendário" do prompt. Estas
 * doses fecham o buraco sem persistir nada: são sintetizadas na janela visível, desenhadas como a
 * bolinha tracejada da 070 e não são clicáveis — quando o dia chegar, a materialização cria a linha
 * de verdade.
 *
 * Mesmas regras de `computeMissingDoses` (`active`, `started_on`, `interval_days`, `ended_on`) e a
 * mesma deduplicação por (`due_date`, `dose_time`) contra `existingDoses`: se a dose já foi
 * materializada — o que acontece com a de hoje, e com qualquer futura que exista por outro caminho
 * —, ela não aparece uma segunda vez como virtual.
 */
export function computeVirtualDoses(
  medication: Medication,
  existingDoses: ExistingDose[],
  rangeEndIso: string,
  today: string
): DoseSlot[] {
  if (!medication.active) return [];

  const times = medicationTimes(medication);
  if (times.length === 0) return [];

  const start = medication.started_on;
  if (!start) return [];

  // Fim da janela: o fim do intervalo visível, ou o fim programado do tratamento se ele vier antes.
  const limit =
    medication.ended_on && medication.ended_on < rangeEndIso
      ? medication.ended_on
      : rangeEndIso;

  // Só o futuro: hoje (e o passado) é responsabilidade da materialização, não da síntese.
  if (limit <= today) return [];

  const interval = Math.max(1, Math.trunc(medication.interval_days || 1));

  // Primeira ocorrência depois de hoje, sem varrer dia a dia desde `started_on`: um tratamento
  // contínuo começado há anos estouraria o guard antes de chegar na janela visível.
  let firstIso = start;
  const offset = daysBetween(start, today);
  if (offset >= 0) {
    const steps = Math.floor(offset / interval) + 1;
    const cursorStart = parseIso(start);
    cursorStart.setDate(cursorStart.getDate() + steps * interval);
    firstIso = toIso(cursorStart);
  }
  if (firstIso > limit) return [];

  const existing = new Set(
    existingDoses
      .filter((dose) => dose.due_date)
      .map((dose) => `${dose.due_date}T${normalizeTime(dose.dose_time) ?? ""}`)
  );

  const virtual: DoseSlot[] = [];
  const cursor = parseIso(firstIso);

  for (let step = 0; step < MAX_DAYS; step += 1) {
    const date = toIso(cursor);
    if (date > limit) break;

    for (const time of times) {
      if (!existing.has(`${date}T${time}`)) virtual.push({ date, time });
    }

    cursor.setDate(cursor.getDate() + interval);
  }

  return virtual;
}

/**
 * A próxima dose prevista do tratamento a partir de agora (`today` + `nowTime`), materializada ou
 * não — o que a lista de tratamentos mostra por linha (feature 071).
 *
 * Deliberadamente ignora o que já existe em `task`: a pergunta aqui é "quando é a próxima",
 * não "qual linha do banco vem a seguir". Uma dose de hoje já tomada continua sendo a dose de hoje;
 * o que interessa na lista é o próximo horário do **cronograma**, então basta `medication`.
 *
 * `null` quando o tratamento está inativo, não tem horário, ou já acabou (`ended_on` no passado) —
 * e também quando a próxima dose está além de `horizonDays`, que só acontece com `interval_days`
 * muito grande e é melhor do que varrer o calendário inteiro.
 */
export function nextDoseSlot(
  medication: Medication,
  today: string,
  nowTime: string,
  horizonDays = 90
): DoseSlot | null {
  if (!medication.active) return null;

  const times = medicationTimes(medication);
  if (times.length === 0) return null;
  if (!medication.started_on) return null;
  if (medication.ended_on && medication.ended_on < today) return null;

  // Hoje ainda conta, se for dia de dose e sobrar horário no relógio.
  const interval = Math.max(1, Math.trunc(medication.interval_days || 1));
  const offset = daysBetween(medication.started_on, today);
  const hojeEhDiaDeDose = offset >= 0 && offset % interval === 0;
  if (hojeEhDiaDeDose) {
    const restante = times.find((time) => time >= nowTime);
    if (restante) return { date: today, time: restante };
  }

  const horizon = parseIso(today);
  horizon.setDate(horizon.getDate() + horizonDays);
  return computeVirtualDoses(medication, [], toIso(horizon), today)[0] ?? null;
}

/**
 * Título da dose que vai para `task.title` — "Losartana 2 comprimidos", "Losartana 500 mg",
 * ou só "Losartana" quando não há posologia registrada (o caso das medicações migradas da 049,
 * que não tinham onde guardar quantidade).
 */
export function formatDoseTitle(
  medication: Pick<Medication, "name" | "dose_amount" | "dose_unit">
): string {
  const name = medication.name.trim();
  const amount = medication.dose_amount;
  const unit = medication.dose_unit?.trim();

  if (amount == null && !unit) return name;
  if (amount == null) return `${name} ${unit}`;

  // Sem casa decimal inútil: "2 comprimidos", não "2,0 comprimidos".
  const formattedAmount = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

  return unit ? `${name} ${formattedAmount} ${unit}` : `${name} ${formattedAmount}`;
}

/** Resumo em uma linha da posologia, para a lista de tratamentos: "2 comprimidos · 08:00, 20:00". */
export function formatPosology(medication: Medication): string {
  const parts: string[] = [];
  const dose = formatDoseTitle(medication).replace(medication.name.trim(), "").trim();
  if (dose) parts.push(dose);

  const times = medicationTimes(medication);
  if (times.length > 0) parts.push(times.join(", "));

  if (medication.interval_days > 1) parts.push(`a cada ${medication.interval_days} dias`);
  else parts.push("todos os dias");

  return parts.join(" · ");
}
