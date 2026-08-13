/** Nudge mensal de compartilhar resumo, 1x por user/mês. */

function key(userId: string, yearMonth: string): string {
  return `orbyva_month_share_nudge_v1:${userId}:${yearMonth}`;
}

function legacyKey(userId: string, yearMonth: string): string {
  return `fintrack_month_share_nudge_v1:${userId}:${yearMonth}`;
}

function migrateNudge(userId: string, yearMonth: string) {
  try {
    const next = key(userId, yearMonth);
    if (localStorage.getItem(next) != null) return;
    const old = localStorage.getItem(legacyKey(userId, yearMonth));
    if (old != null) {
      localStorage.setItem(next, old);
      localStorage.removeItem(legacyKey(userId, yearMonth));
    }
  } catch {
    /* ignore */
  }
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
  migrateNudge(userId, yearMonth);
  return localStorage.getItem(key(userId, yearMonth)) === "1";
}

export function dismissMonthShareNudge(
  userId: string,
  yearMonth = currentYearMonth()
): void {
  migrateNudge(userId, yearMonth);
  localStorage.setItem(key(userId, yearMonth), "1");
}
