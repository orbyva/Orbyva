/** Nudge mensal de compartilhar resumo — 1x por user/mês. */

function key(userId: string, yearMonth: string): string {
  return `fintrack_month_share_nudge_v1:${userId}:${yearMonth}`;
}

export function currentYearMonth(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function isMonthShareNudgeDismissed(
  userId: string,
  yearMonth = currentYearMonth()
): boolean {
  return localStorage.getItem(key(userId, yearMonth)) === "1";
}

export function dismissMonthShareNudge(
  userId: string,
  yearMonth = currentYearMonth()
): void {
  localStorage.setItem(key(userId, yearMonth), "1");
}
