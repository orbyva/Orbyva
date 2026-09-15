export function parseHHmmToMinutes(
  value: string | null | undefined
): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToHHmm(totalMinutes: number): string {
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function computeLeaveByHHmm(params: {
  arrivalHHmm: string;
  durationSeconds: number;
}): string | null {
  const arrival = parseHHmmToMinutes(params.arrivalHHmm);
  if (arrival == null) return null;
  if (!Number.isFinite(params.durationSeconds) || params.durationSeconds < 0) {
    return null;
  }
  const travelMinutes = Math.ceil(params.durationSeconds / 60);
  return minutesToHHmm(arrival - travelMinutes);
}

export function formatDurationFriendly(
  totalSeconds: number | null | undefined
): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "·";
  }
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (totalHours < 24) {
    if (minutes === 0) return `${totalHours}h`;
    return `${totalHours}h${String(minutes).padStart(2, "0")}`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (hours === 0 && minutes === 0) return `${days}d`;
  if (minutes === 0) return `${days}d ${hours}h`;
  if (hours === 0) return `${days}d ${minutes} min`;
  return `${days}d ${hours}h${String(minutes).padStart(2, "0")}`;
}
