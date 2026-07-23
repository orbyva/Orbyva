/** Helpers de retenção do ledger (Fase A). */

const STALE_NUDGE_PREFIX = "orbyva_ledger_stale_nudge_v1:";

export function isLedgerStaleNudgeDismissed(
  userId: string,
  dayKey = new Date().toISOString().slice(0, 10)
): boolean {
  try {
    return localStorage.getItem(`${STALE_NUDGE_PREFIX}${userId}`) === dayKey;
  } catch {
    return false;
  }
}

export function dismissLedgerStaleNudge(
  userId: string,
  dayKey = new Date().toISOString().slice(0, 10)
): void {
  try {
    localStorage.setItem(`${STALE_NUDGE_PREFIX}${userId}`, dayKey);
  } catch {
    /* ignore */
  }
}

/** Dias corridos desde a última tx (0 = hoje). null = sem tx. */
export function daysSinceIsoDate(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  );
}
