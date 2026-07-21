export type TimelineModule =
  | "finance"
  | "car"
  | "travel"
  | "goals"
  | "habits"
  | "places"
  | "cinema";

export type TimelineStatus =
  | "upcoming"
  | "overdue"
  | "today"
  | "completed"
  | "info";

export interface TimelineItem {
  id: string;
  date: string;
  module: TimelineModule;
  title: string;
  subtitle?: string;
  status: TimelineStatus;
  link?: string;
}

export interface LifeDashboardSummary {
  activeGoals: number;
  habitsTodayTotal: number;
  habitsTodayDone: number;
  upcomingTrips: number;
  totalPlaces: number;
  moviesToWatch: number;
  overdueAlerts: number;
  upcomingAlerts: number;
  balance?: number;
  expenseTotal?: number;
}
