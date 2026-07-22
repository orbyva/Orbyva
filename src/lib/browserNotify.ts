import type { AppAlertKind } from "@/api/alerts";

const NOTIFY_KEY = "fintrack_browser_notify";
const NOTIFY_SENT_KEY = "fintrack_browser_notify_sent";
const ALERT_KINDS_KEY = "fintrack_alert_kinds_v1";

export const ALERT_KIND_OPTIONS: Array<{
  kind: AppAlertKind;
  label: string;
  description: string;
}> = [
  {
    kind: "recurring_overdue",
    label: "Parcelas atrasadas",
    description: "Recorrentes vencidas",
  },
  {
    kind: "recurring_upcoming",
    label: "Parcelas próximas",
    description: "Vencimentos nos próximos dias",
  },
  {
    kind: "budget",
    label: "Orçamento",
    description: "Categorias estouradas no mês",
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
];

const ALL_KINDS: AppAlertKind[] = ALERT_KIND_OPTIONS.map((o) => o.kind);

export function isBrowserNotifyEnabled(): boolean {
  return localStorage.getItem(NOTIFY_KEY) === "1";
}

export function setBrowserNotifyEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIFY_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new Event("fintrack-alert-prefs"));
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
  // Evita lista vazia (sempre pelo menos um tipo) — se zerar, restaura todos.
  if (next.size === 0) {
    localStorage.setItem(ALERT_KINDS_KEY, JSON.stringify(ALL_KINDS));
    window.dispatchEvent(new Event("fintrack-alert-prefs"));
    return;
  }
  localStorage.setItem(ALERT_KINDS_KEY, JSON.stringify([...next]));
  window.dispatchEvent(new Event("fintrack-alert-prefs"));
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

  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(NOTIFY_SENT_KEY) === today) return;

  localStorage.setItem(NOTIFY_SENT_KEY, today);
  new Notification("FinTrack", {
    body:
      count === 1
        ? "Você tem 1 alerta urgente."
        : `Você tem ${count} alertas urgentes.`,
    icon: "/logo.webp",
    tag: "fintrack-daily-alerts",
  });
}
