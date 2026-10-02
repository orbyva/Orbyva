/** Chave estável por cidade (arredonda lat/lng). */
export function cityWeatherKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)}|${lng.toFixed(3)}`;
}

/** Horas até o fim da parada mais longa desta cidade (teto 240). */
export function hoursNeededForCityEnd(
  endDates: string[],
  now: number = Date.now()
): number | null {
  let maxEndMs = -Infinity;
  for (const end of endDates) {
    const t = new Date(`${end}T23:59:59`).getTime();
    if (!Number.isNaN(t) && t > maxEndMs) maxEndMs = t;
  }
  if (!Number.isFinite(maxEndMs)) return null;
  const ms = maxEndMs - now;
  if (ms < -36 * 3600_000) return null;
  const hours = Math.ceil(ms / 3600_000) + 2;
  if (hours <= 0) return 72;
  return Math.min(Math.max(hours, 72), 240);
}
