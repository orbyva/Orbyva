import type { AppAlertKind } from "@/api/alerts";

const LEGACY_NOTIFY_KEY = "fintrack_browser_notify";
const LEGACY_NOTIFY_SENT_KEY = "fintrack_browser_notify_sent";
const NOTIFY_KEY = "orbyva_browser_notify";
const NOTIFY_SENT_KEY = "orbyva_browser_notify_sent";
const ALERT_KINDS_KEY = "orbyva_alert_kinds_v1";
const PREFS_EVENT = "orbyva-alert-prefs";

function migrateKey(legacy: string, next: string) {
  try {
    if (localStorage.getItem(next) != null) return;
    const old = localStorage.getItem(legacy);
    if (old != null) {
      localStorage.setItem(next, old);
      localStorage.removeItem(legacy);
    }
  } catch {
    /* ignore */
  }
}

function ensureNotifyKeysMigrated() {
  migrateKey(LEGACY_NOTIFY_KEY, NOTIFY_KEY);
  migrateKey(LEGACY_NOTIFY_SENT_KEY, NOTIFY_SENT_KEY);
}

function dispatchPrefsChanged() {
  window.dispatchEvent(new Event(PREFS_EVENT));
  // Compat com listeners antigos ainda em tabs abertas
  window.dispatchEvent(new Event("fintrack-alert-prefs"));
}

export const ALERT_KIND_OPTIONS: Array<{
  kind: AppAlertKind;
  label: string;
  description: string;
}> = [
  {
    kind: "recurring_overdue",
    label: "Recorrências atrasadas",
    description: "Recorrentes vencidas",
  },
  {
    kind: "recurring_upcoming",
    label: "Recorrências próximas",
    description: "Vencimentos nos próximos dias",
  },
  {
    kind: "budget",
    label: "Orçamento",
    description: "Despesas estouradas e receitas acima da meta",
  },
  {
    kind: "maintenance",
    label: "Manutenção",
    description: "Serviços de veículos",
  },
  {
    kind: "document",
    label: "Documentos",
    description: "IPVA, seguro e afins",
  },
  {
    kind: "goal_due",
    label: "Metas próximas",
    description: "Prazos nos próximos 7 dias",
  },
  {
    kind: "goal_overdue",
    label: "Metas atrasadas",
    description: "Prazos já vencidos",
  },
  {
    kind: "series_episode",
    label: "Episódios novos",
    description: "Séries com aviso ligado (últimos 14 dias)",
  },
];

const ALL_KINDS: AppAlertKind[] = ALERT_KIND_OPTIONS.map((o) => o.kind);

export function isBrowserNotifyEnabled(): boolean {
  ensureNotifyKeysMigrated();
  return localStorage.getItem(NOTIFY_KEY) === "1";
}

export function setBrowserNotifyEnabled(enabled: boolean): void {
  ensureNotifyKeysMigrated();
  localStorage.setItem(NOTIFY_KEY, enabled ? "1" : "0");
  dispatchPrefsChanged();
}

export function getEnabledAlertKinds(): Set<AppAlertKind> {
  try {
    const raw = localStorage.getItem(ALERT_KINDS_KEY);
    if (!raw) return new Set(ALL_KINDS);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set(ALL_KINDS);
    const valid = parsed.filter((k): k is AppAlertKind =>
      ALL_KINDS.includes(k as AppAlertKind)
    );
    return valid.length ? new Set(valid) : new Set(ALL_KINDS);
  } catch {
    return new Set(ALL_KINDS);
  }
}

export function isAlertKindEnabled(kind: AppAlertKind): boolean {
  return getEnabledAlertKinds().has(kind);
}

export function setAlertKindEnabled(kind: AppAlertKind, enabled: boolean): void {
  const next = getEnabledAlertKinds();
  if (enabled) next.add(kind);
  else next.delete(kind);
  if (next.size === 0) {
    localStorage.setItem(ALERT_KINDS_KEY, JSON.stringify(ALL_KINDS));
    dispatchPrefsChanged();
    return;
  }
  localStorage.setItem(ALERT_KINDS_KEY, JSON.stringify([...next]));
  dispatchPrefsChanged();
}

export async function requestBrowserNotifyPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

/** Dispara no máx. 1 notificação/dia com contagem de alertas críticos. */
export function maybeNotifyCriticalAlerts(count: number): void {
  if (count <= 0) return;
  if (!isBrowserNotifyEnabled()) return;
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  ensureNotifyKeysMigrated();
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(NOTIFY_SENT_KEY) === today) return;

  localStorage.setItem(NOTIFY_SENT_KEY, today);
  new Notification("Orbyva", {
    body:
      count === 1
        ? "Você tem 1 alerta urgente."
        : `Você tem ${count} alertas urgentes.`,
    icon: "/logo-mark.webp",
    tag: "orbyva-daily-alerts",
  });
}

/**
 * Notificação local pontual do navegador (feature 063 — lembretes de saúde). Devolve `false` quando
 * não dá para notificar (browser sem Notification API ou permissão não concedida), para quem chama
 * decidir o que fazer — no Health Dashboard, o toast in-app aparece de qualquer jeito.
 *
 * Não passa pelo `isBrowserNotifyEnabled()`: aquele toggle é do sino de alertas do app. Quem liga e
 * desliga o lembrete de saúde é a linha de `reminder_preference` do próprio usuário; exigir os dois
 * faria o lembrete configurado na tela simplesmente não chegar, sem explicação.
 *
 * É notificação **local**, com a aba aberta. Push com o app fechado depende de um service worker
 * com handler de `push` — o SW deste projeto é gerado pelo workbox (`generateSW`) e não aceita
 * código próprio; ver as Notas da feature 063.
 */
export function sendBrowserNotification(
  title: string,
  options: { body: string; tag?: string }
): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  new Notification(title, {
    body: options.body,
    icon: "/logo-mark.webp",
    tag: options.tag,
  });
  return true;
}

/** Nome do evento de preferências de alerta (para AlertsBell). */
export const ALERT_PREFS_EVENT = PREFS_EVENT;
export const LEGACY_ALERT_PREFS_EVENT = "fintrack-alert-prefs";
