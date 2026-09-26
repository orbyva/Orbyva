/** Datas civis no fuso local (evita shift de `toISOString` em UTC−). */

export function formatLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `YYYY-MM-DDTHH:mm` no fuso local — o valor que o `datetime-local` entregava, agora montado
 * pelo `DatePicker` + horário (`<input type="time">`). */
export function formatLocalIsoDateTime(date: Date, time: string): string {
  const hhmm = time.trim() || "00:00";
  return `${formatLocalIsoDate(date)}T${hhmm.length === 5 ? hhmm : hhmm.slice(0, 5)}`;
}

export function startOfLocalDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * ISO (UTC) -> valor de `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`), no fuso local.
 *
 * Nunca fatie `toISOString()` para isso: em UTC− o horário volta com o dia/hora deslocados (mesmo
 * bug que `formatLocalIsoDate` já existe pra evitar). Data inválida ou string vazia devolve `""`,
 * que é o valor "campo vazio" que o input aceita (feature 067).
 */
export function toLocalDateTimeInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatLocalIsoDate(d)}T${hh}:${mm}`;
}

/**
 * Valor de `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`, sempre lido como hora local) -> ISO
 * em UTC, que é o formato gravado em `project_event.starts_at`/`ends_at`. Caminho de volta de
 * `toLocalDateTimeInputValue`: entrada vazia/inválida devolve `""` para quem chama decidir (o form
 * bloqueia o envio antes disso).
 */
export function localDateTimeInputToIso(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return "";
  const [, y, m, day, hh, mm, ss] = match;
  const d = new Date(
    Number(y),
    Number(m) - 1,
    Number(day),
    Number(hh),
    Number(mm),
    Number(ss ?? 0)
  );
  if (Number.isNaN(d.getTime())) return "";
  // `new Date(2026, 12, 1)` rola para janeiro de 2027 em vez de falhar — comparar de volta os
  // componentes é o que faz uma data impossível (mês 13, 30 de fevereiro) virar `""`.
  if (d.getFullYear() !== Number(y) || d.getMonth() !== Number(m) - 1 || d.getDate() !== Number(day)) {
    return "";
  }
  return d.toISOString();
}
