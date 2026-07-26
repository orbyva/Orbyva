/** Retenção D7 do funil — evento PostHog no client (quem volta).
 *  Server: `profiles.last_seen_at` + e-mail via `retention-d7-email`.
 */

import { track } from "@/lib/analytics";
import { daysSinceIsoDate } from "@/lib/ledgerStickiness";

const D7_KEY_PREFIX = "orbyva_retention_d7_v1:";

export function hasTrackedRetentionD7(userId: string): boolean {
  try {
    return localStorage.getItem(`${D7_KEY_PREFIX}${userId}`) === "1";
  } catch {
    return true;
  }
}

export function markRetentionD7Tracked(userId: string): void {
  try {
    localStorage.setItem(`${D7_KEY_PREFIX}${userId}`, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Dispara `retention_d7` uma vez quando a conta tem ≥ 7 dias corridos.
 * Retorna true se o evento foi enviado nesta chamada.
 */
export function maybeTrackRetentionD7(
  userId: string | null | undefined,
  createdAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!userId || !createdAt) return false;
  if (hasTrackedRetentionD7(userId)) return false;
  const days = daysSinceIsoDate(createdAt, now);
  if (days === null || days < 7) return false;
  markRetentionD7Tracked(userId);
  track("retention_d7", { days_since_signup: days });
  return true;
}
