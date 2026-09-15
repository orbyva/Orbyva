import type { AppAlertKind } from "@/domain/alerts";
import { kvGet, kvSet } from "@/lib/kv";

const DISMISS_KEY = "orbyva.alerts.dismissed";
const KINDS_KEY = "orbyva_alert_kinds_v1";

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
    kind: "task_overdue",
    label: "Tarefas atrasadas",
    description: "Prazos que já passaram",
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

function parseKinds(raw: string | null): Set<AppAlertKind> {
  if (!raw) return new Set(ALL_KINDS);
  try {
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

function parseIds(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export async function loadEnabledAlertKinds(): Promise<Set<AppAlertKind>> {
  return parseKinds(await kvGet(KINDS_KEY));
}

export async function setAlertKindEnabled(
  kind: AppAlertKind,
  enabled: boolean
): Promise<Set<AppAlertKind>> {
  const next = await loadEnabledAlertKinds();
  if (enabled) next.add(kind);
  else next.delete(kind);
  const stored = next.size === 0 ? ALL_KINDS : [...next];
  await kvSet(KINDS_KEY, JSON.stringify(stored));
  return new Set(stored);
}

export async function loadDismissedAlertIds(): Promise<Set<string>> {
  return parseIds(await kvGet(DISMISS_KEY));
}

export async function dismissAlertId(id: string): Promise<Set<string>> {
  const next = await loadDismissedAlertIds();
  next.add(id);
  await kvSet(DISMISS_KEY, JSON.stringify([...next]));
  return next;
}

export async function clearDismissedAlertIds(): Promise<void> {
  await kvSet(DISMISS_KEY, "[]");
}

export function filterVisibleAlerts<T extends { id: string; kind: AppAlertKind }>(
  alerts: T[],
  enabled: Set<AppAlertKind>,
  dismissed: Set<string>
): T[] {
  return alerts.filter((alert) => enabled.has(alert.kind) && !dismissed.has(alert.id));
}
