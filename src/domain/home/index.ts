import type {
  HomeMaintenance,
  HomeMaintenanceScheduleItem,
  HomeMaintenanceType,
} from "@/types/home";

export const DATE_WARNING_DAYS = 30;

export const HOME_MAINTENANCE_LABELS: Record<HomeMaintenanceType, string> = {
  ac_filter: "Filtro do ar-condicionado",
  painting: "Pintura",
  plumbing: "Encanamento",
  electrical: "Elétrica",
  pest_control: "Dedetização",
  cleaning: "Limpeza profunda",
  garden: "Jardim",
  appliance: "Eletrodomésticos",
  security: "Segurança",
  general: "Manutenção geral",
  other: "Outro",
};

export const TRACKED_HOME_TYPES: HomeMaintenanceType[] = [
  "ac_filter",
  "painting",
  "plumbing",
  "electrical",
  "pest_control",
  "cleaning",
  "garden",
  "appliance",
  "security",
  "general",
];

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function getLatestByType(
  maintenances: HomeMaintenance[]
): Map<HomeMaintenanceType, HomeMaintenance> {
  const map = new Map<HomeMaintenanceType, HomeMaintenance>();
  for (const item of maintenances) {
    const existing = map.get(item.type);
    if (!existing || item.service_date > existing.service_date) {
      map.set(item.type, item);
    }
  }
  return map;
}

export function getHomeMaintenanceSchedule(
  maintenances: HomeMaintenance[]
): HomeMaintenanceScheduleItem[] {
  const latestByType = getLatestByType(maintenances);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return TRACKED_HOME_TYPES.map((type) => {
    const label = HOME_MAINTENANCE_LABELS[type];
    const latest = latestByType.get(type);

    if (!latest?.next_date) {
      return { type, label, status: "none" as const, message: "Sem registro" };
    }

    const nextDate = new Date(`${latest.next_date}T12:00:00`);
    nextDate.setHours(0, 0, 0, 0);
    const daysRemaining = daysBetween(today, nextDate);

    let status: HomeMaintenanceScheduleItem["status"] = "ok";
    let message = "Em dia";

    if (daysRemaining < 0) {
      status = "overdue";
      message = `Atrasado há ${Math.abs(daysRemaining)} dias`;
    } else if (daysRemaining <= DATE_WARNING_DAYS) {
      status = "upcoming";
      message =
        daysRemaining === 0
          ? "Vence hoje"
          : `Vence em ${daysRemaining} dias`;
    }

    return {
      type,
      label,
      status,
      lastServiceDate: latest.service_date,
      nextDate: latest.next_date,
      daysRemaining,
      message,
    };
  });
}

export function getHomeMaintenanceTypeLabel(
  type: HomeMaintenanceType,
  customType?: string | null
): string {
  if (type === "other" && customType?.trim()) return customType.trim();
  return HOME_MAINTENANCE_LABELS[type];
}
