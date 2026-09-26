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
