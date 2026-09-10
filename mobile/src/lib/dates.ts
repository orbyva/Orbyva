/** Datas civis no fuso local (evita shift de `toISOString` em UTC−). */
export function formatLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `YYYY-MM-DDTHH:mm` no fuso local. */
export function formatLocalIsoDateTime(dateIso: string, time: string): string {
  const hhmm = time.trim() || "00:00";
  return `${dateIso.slice(0, 10)}T${hhmm.length === 5 ? hhmm : hhmm.slice(0, 5)}`;
}

export function formatEventWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${formatLocalIsoDate(date).split("-").reverse().join("/")} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
