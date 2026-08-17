import type { Medication } from "@/types/health";

/**
 * Regras puras do controle de medicamentos (feature 064) — sem I/O, para o Vitest cobrir sem
 * Supabase. `src/api/health/medications.ts` é só a insert do que sai daqui.
 *
 * O que este módulo resolve e a 049 não conseguia: **N doses por dia**. Lá uma medicação era uma
 * `recurrence_rule` com um `time` singular; aqui a unidade é o par (data × horário), então
 * "1 de manhã e 1 à noite" é um tratamento só com dois horários.
 */

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
 * Teto de iterações do laço de datas — mesmo espírito do `guard` de
 * `computeMissingWeekdayOccurrences` (`src/domain/tasks/recurrence.ts`). Um tratamento contínuo
 * começado há anos não pode virar um laço infinito nem uma insert de milhares de linhas de uma vez;
 * o que sobrar entra na carga seguinte, porque as doses já criadas saem de `existingDoses`.
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

  const missing: DoseSlot[] = [];
  const cursor = parseIso(start);

  for (let step = 0; step < MAX_DAYS; step += 1) {
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
